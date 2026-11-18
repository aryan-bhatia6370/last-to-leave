// Online performance score: each round 0–100 for how well you did *for that
// game* (compared with an average player), the run score is the average.
// Shown out of 100 with one decimal.
import { simulateScore, simulateSolveTime } from '../competition/engine.js';
import { createRng } from '../core/rng.js';

const SAMPLES = 2000;
const cache = new Map();
function sample(key, fn) {
  if (!cache.has(key)) {
    const rng = createRng(0x51ab1e);
    cache.set(key, Array.from({ length: SAMPLES }, () => fn(rng)));
  }
  return cache.get(key);
}

/** { kind:'scored', game, variant, score } or { kind:'race', game, t (seconds) | null } -> 0..100 */
export function roundPerformance(r) {
  if (r.kind === 'race') {
    if (r.t == null) return 0;
    const arr = sample(`race:${r.game}`, (rng) => simulateSolveTime(r.game, 1, rng));
    const slower = arr.filter((x) => x > r.t).length, same = arr.filter((x) => x === r.t).length;
    return (100 * (slower + same / 2)) / arr.length;
  }
  const arr = sample(`${r.game}:${r.variant}`, (rng) => simulateScore(r.game, r.variant, 1, rng));
  const below = arr.filter((x) => x < r.score).length, same = arr.filter((x) => x === r.score).length;
  return (100 * (below + same / 2)) / arr.length;
}

/** Average of the rounds, one decimal. */
export function runPerformance(rounds) {
  if (!rounds.length) return 0;
  return Math.round((rounds.reduce((s, r) => s + roundPerformance(r), 0) / rounds.length) * 10) / 10;
}
