// Competition Mode rules (no drawing here — just the logic).
// See CLAUDE.md "Competition Mode + online rules".
//
// - 2–8 players around the table. Each round Paul picks a game + version.
// - Round 1 is always Marker Catching. The final (2 left) is never a race game.
// - Paul's Pocket isn't used. Endless versions are never used.
// - Versions: normal ~2/3 of the time unless the host overrides per game.
// - Lowest score leaves; tied lowest players replay until one is lower.
// - Pictionary/Equations are races: first correct is safe, a new board goes up
//   for the rest, until one player is left without one.

import { GAMES } from '../games/registry.js';

export const COMPETITION = {
  normalWeight: 2 / 3,             // chance the normal version is picked (when random)
  firstGame: 'marker-catching',
  excluded: ['pauls-pocket'],      // not in Competition Mode (yet)
  raceGames: ['pictionary', 'equations'],
  finalExcludes: ['pictionary', 'equations'],
  maxSeats: 8,
};

// Placeholder looks until the user sends pictures (polo color = their seat color).
export const CHARACTERS = [
  { id: 'aryan', name: 'Aryan', shirt: 0x6d3fd0 },
  { id: 'nate', name: 'Nate', shirt: 0x1f6fd1 },
  { id: 'jayden', name: 'Jayden', shirt: 0x1f9d4c },
  { id: 'jardel', name: 'Jardel', shirt: 0xd7263d },
  { id: 'aldrich', name: 'Aldrich', shirt: 0xf2851d },
  { id: 'andres', name: 'Andres', shirt: 0x2b2b30 },
  { id: 'nevin', name: 'Nevin', shirt: 0xec5fa6 },
  { id: 'ivan', name: 'Ivan', shirt: 0x7b4a26 },
];

/** Games that can show up in Competition Mode, with their usable versions. */
export function competitionGames() {
  return GAMES.filter((g) => g.load && !COMPETITION.excluded.includes(g.id)).map((g) => ({
    id: g.id,
    name: g.name,
    color: g.color,
    variants: g.variants.filter((v) => !v.endless && !v.id.includes('endless') && v.id !== 'mine'),
  }));
}

/** 'hard-wind' -> { hard: true, wind: true }; 'regular' -> {} */
export function variantToOptions(variantId) {
  if (!variantId || variantId === 'regular') return {};
  return Object.fromEntries(variantId.split('-').map((k) => [k, true]));
}

/**
 * settings[gameId] = 'random' (default) | 'normal' | a specific variant id
 */
export function chooseVariant(game, settings, rng) {
  const pick = settings?.[game.id] || 'random';
  if (pick === 'normal') return 'regular';
  if (pick !== 'random' && game.variants.some((v) => v.id === pick)) return pick;
  const alts = game.variants.filter((v) => v.id !== 'regular');
  if (!alts.length || rng.next() < COMPETITION.normalWeight) return 'regular';
  return rng.pick(alts).id;
}

/** Paul picks the next game. */
export function chooseGame(roundIndex, aliveCount, history, rng) {
  const all = competitionGames();
  if (roundIndex === 0) return all.find((g) => g.id === COMPETITION.firstGame);
  let pool = all;
  if (aliveCount <= 2) pool = pool.filter((g) => !COMPETITION.finalExcludes.includes(g.id));
  const last = history[history.length - 1];
  const fresh = pool.filter((g) => g.id !== last);
  return rng.pick(fresh.length ? fresh : pool);
}

export const isRaceGame = (gameId) => COMPETITION.raceGames.includes(gameId);

// ---------- computer players ----------
function binom(n, p, rng) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}
const clampP = (p) => Math.max(0.03, Math.min(0.95, p));

/** Max score for a game/version (for display). */
export function maxScoreFor(gameId, variant = 'regular') {
  if (gameId === 'archery' && variant.split('-').includes('zones')) return 6;
  return { 'marker-catching': 8, archery: 3, bowling: 9, 'cup-catching': 8, 'cup-throwing': 8 }[gameId] ?? null;
}

// Computer players. Each turn a bot gets its own "form" for that turn (skill +
// a random good/bad day), then its throws/catches are rolled. Targets (playtest notes):
//   Marker Catching: average a bit over half, perfect games not rare, bad ones possible
//   Archery: 1, 2 or 3 hits about equally often, 0 is rarer. Hotspots: 0–6, ~2.5 average
//   Bowling: ~3.5 average, most games a bit under half
//   Cup Catching: ~3 average, lots of low games, high ones rare
//   Cup Throwing: ~2–3 average, over 5 is rare
export const BOTS = {
  markerCatching: { p: 0.66, bulletP: 0.6, formSd: 0.15 },
  archery: { pmf: [0.1, 0.3, 0.3, 0.3], windShift: 0.06, hotspotHitP: 0.64, hotspotBonusP: 0.32 },
  bowling: { hitP: 0.6, pts: [0.35, 0.35, 0.3], windMul: 0.88, hardTiers: [[3, 0.28], [2, 0.42], [1, 0.6]] },
  cupCatching: { p: 0.37, formSd: 0.15 },
  cupThrowing: { p: 0.31, movingP: 0.28, formSd: 0.08 },
  // race games: seconds to solve. Fast enough that an average person can lose to them.
  solve: { equations: [4.5, 20], pictionary: [5, 22], curve: 1.35 },
};

function gauss(rng) {
  let u = 0;
  while (!u) u = rng.next();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}
const form = (base, skill, sd, rng) => clampP(base * skill + gauss(rng) * sd);

/**
 * A computer player's score for one turn. skill ~0.82 (weak) to 1.18 (strong).
 */
export function simulateScore(gameId, variant, skill, rng) {
  const has = (k) => variant.split('-').includes(k);
  const B = BOTS;
  switch (gameId) {
    case 'marker-catching': {
      const m = B.markerCatching;
      return binom(8, form(has('bullet') ? m.bulletP : m.p, skill, m.formSd, rng), rng);
    }
    case 'archery': {
      const a = B.archery;
      if (has('zones')) {
        let pts = 0;
        const hitP = clampP(a.hotspotHitP * skill - (has('wind') ? a.windShift : 0));
        for (let t = 0; t < 3; t++) if (rng.next() < hitP) pts += rng.next() < a.hotspotBonusP * skill ? 2 : 1;
        return pts;
      }
      // shift the 0/1/2/3 chances toward better or worse with skill (and down a bit in wind)
      const shift = (skill - 1) * 0.5 - (has('wind') ? a.windShift : 0);
      const w = a.pmf.map((p, k) => Math.max(0.01, p * (1 + shift * (k - 1.5))));
      let r = rng.next() * w.reduce((x, y) => x + y, 0);
      for (let k = 0; k < 4; k++) { r -= w[k]; if (r <= 0) return k; }
      return 3;
    }
    case 'cup-catching': return binom(8, form(B.cupCatching.p, skill, B.cupCatching.formSd, rng), rng);
    case 'cup-throwing': {
      const c = B.cupThrowing;
      return binom(8, form(has('moving') ? c.movingP : c.p, skill, c.formSd, rng), rng);
    }
    case 'bowling': {
      const b = B.bowling;
      const windMul = has('wind') ? b.windMul : 1;
      let pts = 0;
      for (let t = 0; t < 3; t++) {
        if (has('hard')) {
          const [value, p] = rng.pick(b.hardTiers);
          if (rng.next() < clampP(p * skill * windMul)) pts += value;
        } else if (rng.next() < clampP(b.hitP * skill * windMul)) {
          const r = rng.next();
          pts += r < b.pts[0] ? 1 : r < b.pts[0] + b.pts[1] ? 2 : 3;
        }
      }
      return Math.min(9, pts);
    }
    default: return binom(8, 0.5, rng);
  }
}

/** Seconds until a computer player solves a race board. */
export function simulateSolveTime(gameId, skill, rng) {
  const [lo, hi] = gameId === 'equations' ? BOTS.solve.equations : BOTS.solve.pictionary;
  return Math.round(((lo + (hi - lo) * Math.pow(rng.next(), BOTS.solve.curve)) / skill) * 10) / 10;
}

export function randomSkill(rng) {
  return 0.82 + rng.next() * 0.36;
}

/** Ids of the players with the lowest score (ties included). */
export function lowestScorers(scores) {
  const vals = Object.values(scores);
  const min = Math.min(...vals);
  return Object.keys(scores).filter((id) => scores[id] === min);
}
