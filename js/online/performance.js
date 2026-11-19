// Online performance score (out of 100, one decimal) for one whole run.
//
// It rewards both playing well and lasting long:
//   70%  your rounds: each round = half "how you did against the others at the
//        table that round" + half "how good that score is for this game"
//        (vs a typical player; races: how fast you solved it)
//   30%  where you finished (1st = all of it, last = none)
// So someone who gets knocked out first can't out-score the winner just by
// having one great round, and a long run of solid rounds counts.
import { simulateScore, simulateSolveTime } from '../competition/engine.js';
import { createRng } from '../core/rng.js';

export const PERFORMANCE = { roundsWeight: 0.7, placeWeight: 0.3, samples: 2000 };

const cache = new Map();
function sample(key, fn) {
  if (!cache.has(key)) {
    const rng = createRng(0x51ab1e);
    cache.set(key, Array.from({ length: PERFORMANCE.samples }, () => fn(rng)));
  }
  return cache.get(key);
}

/** 0..1: how good a score is for this game/version, vs a typical player. */
function quality(r, id) {
  if (r.kind === 'race') {
    const t = r.solve?.[id];
    if (t == null) return 0;
    const arr = sample(`race:${r.game}`, (rng) => simulateSolveTime(r.game, 1, rng));
    return (arr.filter((x) => x > t).length + arr.filter((x) => x === t).length / 2) / arr.length;
  }
  const score = r.scores?.[id] ?? 0;
  const arr = sample(`${r.game}:${r.variant}`, (rng) => simulateScore(r.game, r.variant, 1, rng));
  return (arr.filter((x) => x < score).length + arr.filter((x) => x === score).length / 2) / arr.length;
}

/** 0..1: how you did against the others in that round. */
function standing(r, id) {
  const others = (r.players || []).filter((x) => x !== id);
  if (!others.length) return 1;
  if (r.kind === 'race') {
    // the order players got safe (board 1 = first)
    const order = Object.entries(r.safe || {}).map(([k, v]) => [Number(String(k).replace('b', '')), v]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
    const i = order.indexOf(id);
    if (i < 0) return 0;
    return (others.length - i) / others.length;
  }
  const mine = r.scores?.[id] ?? 0;
  const below = others.filter((o) => (r.scores?.[o] ?? 0) < mine).length;
  const same = others.filter((o) => (r.scores?.[o] ?? 0) === mine).length;
  return (below + same / 2) / others.length;
}

/** A player's performance for the whole run: 0–100, one decimal. */
export function runPerformance(run, id) {
  const rounds = Object.values(run.rounds || {}).filter((r) => r && (r.players || []).includes(id) && (r.kind === 'race' || r.scores));
  const per = rounds.map((r) => 0.5 * standing(r, id) + 0.5 * quality(r, id));
  const avg = per.length ? per.reduce((a, b) => a + b, 0) / per.length : 0;
  const total = run.total || 2;
  const place = run.players?.[id]?.place ?? total;
  const placeScore = total > 1 ? (total - place) / (total - 1) : 1;
  return Math.round(1000 * (PERFORMANCE.roundsWeight * avg + PERFORMANCE.placeWeight * placeScore)) / 10;
}
