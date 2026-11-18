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
    variants: g.variants.filter((v) => !v.id.includes('endless') && v.id !== 'mine'),
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
export function maxScoreFor(gameId) {
  return { 'marker-catching': 8, archery: 3, bowling: 9, 'cup-catching': 8, 'cup-throwing': 8 }[gameId] ?? null;
}

/**
 * A computer player's score for one turn. skill ~0.8 (weak) to 1.2 (strong).
 * Tuned to land near the games' design targets (e.g. ~4/8 Marker Catching, ~3/8 Cup Throwing).
 */
export function simulateScore(gameId, variant, skill, rng) {
  const has = (k) => variant.split('-').includes(k);
  switch (gameId) {
    case 'marker-catching': return binom(8, clampP((has('bullet') ? 0.48 : 0.53) * skill), rng);
    case 'archery': return binom(3, clampP((has('wind') ? 0.42 : 0.5) * skill), rng);
    case 'cup-catching': return binom(8, clampP(0.55 * skill), rng);
    case 'cup-throwing': return binom(8, clampP((has('moving') ? 0.32 : 0.37) * skill), rng);
    case 'bowling': {
      const windMul = has('wind') ? 0.86 : 1;
      let pts = 0;
      for (let t = 0; t < 3; t++) {
        if (has('hard')) {
          // go for one marker: purple (3) is hardest, black (1) easiest
          const r = rng.next();
          const [value, p] = r < 0.34 ? [3, 0.3] : r < 0.68 ? [2, 0.45] : [1, 0.62];
          if (rng.next() < clampP(p * skill * windMul)) pts += value;
        } else if (rng.next() < clampP(0.66 * skill * windMul)) {
          const r = rng.next();
          pts += r < 0.3 ? 1 : r < 0.62 ? 2 : 3;
        }
      }
      return Math.min(9, pts);
    }
    default: return binom(8, 0.5, rng);
  }
}

/** Seconds until a computer player solves a race board. */
export function simulateSolveTime(gameId, skill, rng) {
  const [lo, hi] = gameId === 'equations' ? [9, 38] : [6, 30];
  return Math.round(((lo + (hi - lo) * Math.pow(rng.next(), 1.25)) / skill) * 10) / 10;
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
