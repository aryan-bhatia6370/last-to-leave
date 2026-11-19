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
  raceGames: ['pictionary', 'equations', 'trivia'],
  finalExcludes: ['pictionary', 'equations', 'trivia'],
  sausageMaxPlayers: 3,            // the Sausage Game only shows up with 3 or fewer left at the table
  maxSeats: 8,
};

// Placeholder looks until the user sends pictures (polo color = their seat color).
// When someone's out, Paul leads them from the table. This is the chance a
// computer refuses to get up and Paul has to yank them off the bench.
export const YANK_CHANCE = 0.05;

export const CHARACTERS = [
  // Aryan's look (for now): shirtless, six pack, huge arms, ~5 in taller, sigma face
  { id: 'aryan', name: 'Aryan', shirt: 0x6d3fd0, look: { shirtless: true, muscle: 1.6, heightScale: 1.073, sigma: true } },
  // Members' looks from their reference photos (stylized; no photos are stored).
  // Clothing color = their marker color so they're easy to tell apart.
  { id: 'nate', name: 'Nate', shirt: 0x1f6fd1, look: { skin: 0xf0cdb4, hair: 0x2a1c14, hairStyle: 'curly', top: 'polo', shorts: true, pants: 0xcdb48c, width: 0.94 } },
  { id: 'jayden', name: 'Jayden', shirt: 0x1f9d4c, look: { skin: 0xddb08a, hair: 0x4a3222, hairStyle: 'fringe', top: 'zipHoodie', backpack: 0x3a3a40 } },
  { id: 'jardel', name: 'Jardel', shirt: 0xd7263d, look: { skin: 0xecc8ae, hair: 0x3d2a1c, hairStyle: 'curtain', top: 'openHoodie', inner: 0x1c1c20, glasses: true, width: 1.12, pants: 0xd8ccb4 } },
  { id: 'aldrich', name: 'Aldrich', shirt: 0xf2851d, look: { skin: 0xc28c63, hair: 0x141210, hairStyle: 'spiky', top: 'hoodie', mustache: true, goatee: true, pants: 0xeee6d6, lanyard: true, lanyardColor: 0xf2c230, idCard: false } },
  { id: 'andres', name: 'Andres', shirt: 0x2b2b30, look: { skin: 0xdcae88, hair: 0x241812, hairStyle: 'shaggy', top: 'polo' } },
  { id: 'nevin', name: 'Nevin', shirt: 0xec5fa6, look: { skin: 0xf3d2bf, hair: 0x9c7446, hairStyle: 'messy', top: 'polo', glasses: true, heightScale: 1.035, width: 0.96 } },
  { id: 'ivan', name: 'Ivan', shirt: 0x7b4a26, look: { skin: 0xd8a882, hair: 0x3b2a1e, hairStyle: 'mop', top: 'hoodie', mustache: true } },
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

/**
 * Paul picks the next game AND version together.
 * - Round 1 is always Marker Catching (any allowed non-endless version).
 * - A game+version that's already been played this run can't come back
 *   (Marker Catching can repeat). If everything allowed is used up, repeats are allowed again.
 * - versions: the host's per-game setting ('random' | 'normal' | a version id).
 * - opts.allowed: game ids the host left in the pool (null = all).
 * - opts.canUse(gameId): extra per-game rules (e.g. the Sausage Game only late in a run).
 * used: ['gameId:variant', ...] played so far. Returns { game, variant }.
 */
/** Game ids the host left in the pool (null = all). settingsOff = { gameId: true } for left-out games. */
export function poolFrom(settingsOff) {
  const ids = competitionGames().map((g) => g.id).filter((id) => !settingsOff?.[id]);
  return ids.length ? ids : null; // nothing left = use everything
}

export function chooseRound(roundIndex, aliveCount, used, versions, rng, { allowed = null, canUse = null, pointsMode = false } = {}) {
  const all = competitionGames();
  const first = all.find((g) => g.id === COMPETITION.firstGame);
  const settingVariants = (g) => {
    const pick = versions?.[g.id] || 'random';
    if (pick === 'normal') return ['regular'];
    if (pick !== 'random' && g.variants.some((v) => v.id === pick)) return [pick];
    return g.variants.map((v) => v.id);
  };
  const open = (g, allowRepeat = false) => settingVariants(g).filter((v) => allowRepeat || g.id === COMPETITION.firstGame || !used.includes(`${g.id}:${v}`));
  const weighted = (g, ids) => {
    if (ids.length === 1) return ids[0];
    const alts = ids.filter((v) => v !== 'regular');
    if (ids.includes('regular') && (!alts.length || rng.next() < COMPETITION.normalWeight)) return 'regular';
    return rng.pick(alts.length ? alts : ids);
  };
  if (roundIndex === 0 && first && (!allowed || allowed.includes(first.id))) return { game: first, variant: weighted(first, open(first)) };
  let pool = all.filter((g) => (!allowed || allowed.includes(g.id)) && (!canUse || canUse(g.id))
    && (pointsMode || g.id !== 'sausage' || aliveCount <= COMPETITION.sausageMaxPlayers));
  if (aliveCount <= 2) pool = pool.filter((g) => !COMPETITION.finalExcludes.includes(g.id));
  if (!pool.length) pool = all.filter((g) => !COMPETITION.finalExcludes.includes(g.id) || aliveCount > 2);
  let fresh = pool.filter((g) => open(g).length);
  const allowRepeat = !fresh.length;
  if (allowRepeat) fresh = pool;
  const lastGame = (used[used.length - 1] || '').split(':')[0];
  const notLast = fresh.filter((g) => g.id !== lastGame);
  const game = rng.pick(notLast.length ? notLast : fresh);
  return { game, variant: weighted(game, open(game, allowRepeat)) };
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
  return { 'marker-catching': 8, archery: 3, bowling: 9, 'cup-catching': 8, 'cup-throwing': 8, sausage: 15 }[gameId] ?? null;
}

// Computer players. Each turn a bot gets its own "form" for that turn (skill +
// a random good/bad day), then its throws/catches are rolled. Targets (playtest notes):
//   Marker Catching: ~4.5 average (Bullet a bit lower), perfect games possible, bad ones too
//   Archery: 1, 2 or 3 hits about equally often, 0 is rarer. Hotspots: 0–6, ~2.5 average
//   Bowling: ~3.5 average, most games a bit under half
//   Cup Catching: ~4 average, wide spread
//   Cup Throwing: ~2–3 average, over 5 is rare
export const BOTS = {
  markerCatching: { p: 0.57, bulletP: 0.52, formSd: 0.15 }, // ~4.5 avg (Bullet ~4.1): playtest said bots were too good
  archery: { pmf: [0.1, 0.3, 0.3, 0.3], windShift: 0.06, hotspotHitP: 0.64, hotspotBonusP: 0.32 },
  bowling: { hitP: 0.6, pts: [0.35, 0.35, 0.3], windMul: 0.88, hardTiers: [[3, 0.28], [2, 0.42], [1, 0.6]] },
  cupCatching: { p: 0.52, formSd: 0.15 },     // ~4.1 avg: playtest said too low (and spilling is gone)
  cupThrowing: { p: 0.31, movingP: 0.28, formSd: 0.08 },
  sausage: { 5: 0.13, 4: 0.14, 3: 0.16, 2: 0.16, 1: 0.14, 0: 0.15, '-1': 0.07, '-2': 0.05 },
  // race games: seconds to solve. Fast enough that an average person can lose to them.
  solve: { equations: [4.5, 20], pictionary: [5, 22], trivia: [3.5, 16], curve: 1.35 },
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
      const p = form(has('bullet') ? m.bulletP : m.p, skill, m.formSd, rng);
      if (!has('memory')) return binom(8, p, rng);
      // Memory: 2 bonus (+2), 2 to dodge (−1), 4 normal; bots remember the dodges ~75% of the time
      let pts = 0;
      for (let i = 0; i < 2; i++) if (rng.next() < p) pts += 2;
      for (let i = 0; i < 4; i++) if (rng.next() < p) pts += 1;
      for (let i = 0; i < 2; i++) if (rng.next() > 0.75 && rng.next() < p) pts -= 1;
      return Math.max(0, pts);
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
    case 'sausage': {
      // 3 flicks; each lands in a band (or off). Better players land the big bands more.
      let pts = 0;
      const pmf = Object.entries(B.sausage);
      for (let t = 0; t < 3; t++) {
        const w = pmf.map(([v, p]) => p * (1 + (skill - 1) * 1.5 * Math.sign(Number(v) - 1.5)));
        let r = rng.next() * w.reduce((a, b) => a + b, 0);
        for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) { pts += Number(pmf[i][0]); break; } }
      }
      return Math.max(0, pts);
    }
    default: return binom(8, 0.5, rng);
  }
}

/** Seconds until a computer player solves a race board. */
export function simulateSolveTime(gameId, skill, rng) {
  const [lo, hi] = BOTS.solve[gameId] || BOTS.solve.pictionary;
  return Math.round(((lo + (hi - lo) * Math.pow(rng.next(), BOTS.solve.curve)) / skill) * 10) / 10;
}

/**
 * When a computer guesses wrong before it gets a race board (seconds into the board).
 * Each wrong guess locks it out for 5 s, so its solve time is always after the last one.
 */
export function simulateWrongTimes(solveAt, rng) {
  const r = rng.next();
  const n = r < 0.5 ? 0 : r < 0.85 ? 1 : 2;
  const out = [];
  let from = 1.5;
  for (let i = 0; i < n; i++) {
    const latest = solveAt - 5 - (n - 1 - i) * 5;
    if (latest <= from) break;
    const t = Math.round((from + rng.next() * (latest - from)) * 10) / 10;
    out.push(t);
    from = t + 5;
  }
  return out;
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
