// Score service. Every game hands its result object to scores.submit().
// Today scores live in this browser's localStorage (LocalScoreAdapter).
// Later, write a FirebaseScoreAdapter with the same load/save shape (or
// override submit/getBests) and call setScoreAdapter() — the games and
// pages don't need to change. The API is async for that reason.
//
// Result shape every game reports (see CLAUDE.md "Game contract"):
//   { gameId, variant, score, maxScore, passed, durationMs, stats, seed }

const SCORES_KEY = 'ltl.scores.v1';
const PLAYER_KEY = 'ltl.player.v1';
const MAX_HISTORY = 300;

function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } }
function empty() { return { version: 1, bests: {}, history: [] }; }

export const LocalScoreAdapter = {
  async load() {
    const raw = safeGet(SCORES_KEY);
    if (!raw) return empty();
    try {
      const data = JSON.parse(raw);
      return data && data.version === 1 ? data : empty();
    } catch { return empty(); }
  },
  async save(data) { safeSet(SCORES_KEY, JSON.stringify(data)); },
};

let adapter = LocalScoreAdapter;
export function setScoreAdapter(a) { adapter = a; }

// Scores are always kept on this device. When you're signed in, the account
// module listens here and also saves them to your account (cloud sync).
const saveListeners = new Set();
export function onScoreSaved(fn) { saveListeners.add(fn); return () => saveListeners.delete(fn); }

const bestKey = (gameId, variant) => `${gameId}:${variant}`;
const makeId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const scores = {
  /** Save a result. Returns { record, isBest, previousBest }. */
  async submit(result, { higherIsBetter = true } = {}) {
    const data = await adapter.load();
    const record = {
      id: makeId(),
      ...result,
      player: getPlayer().name || '',
      playedAt: new Date().toISOString(),
    };
    const k = bestKey(result.gameId, result.variant);
    const previousBest = data.bests[k] || null;
    const isBest = !previousBest || (higherIsBetter ? record.score > previousBest.score : record.score < previousBest.score);
    if (isBest) data.bests[k] = record;
    data.history.unshift(record);
    if (data.history.length > MAX_HISTORY) data.history.length = MAX_HISTORY;
    await adapter.save(data);
    for (const fn of saveListeners) { try { fn(record, isBest); } catch { /* never block a save */ } }
    return { record, isBest, previousBest };
  },
  /** Bring in bests from elsewhere (your account); keeps whichever is higher. Returns how many changed. */
  async mergeBests(incoming) {
    const data = await adapter.load();
    let changed = 0;
    for (const [k, rec] of Object.entries(incoming)) {
      const cur = data.bests[k];
      if (!cur || rec.score > cur.score) { data.bests[k] = rec; changed++; }
    }
    if (changed) await adapter.save(data);
    return changed;
  },
  async getBest(gameId, variant) { return (await adapter.load()).bests[bestKey(gameId, variant)] || null; },
  async getBests() { return (await adapter.load()).bests; },
  async getHistory({ gameId, variant, limit = 20 } = {}) {
    return (await adapter.load()).history
      .filter((r) => (!gameId || r.gameId === gameId) && (!variant || r.variant === variant))
      .slice(0, limit);
  },
  async clear() { await adapter.save(empty()); },
};

export function formatScore(score, maxScore) {
  return maxScore != null ? `${score} / ${maxScore}` : `${score}`;
}

export function getPlayer() {
  try { return { name: '', ...(JSON.parse(safeGet(PLAYER_KEY)) || {}) }; } catch { return { name: '' }; }
}
export function setPlayer(player) { safeSet(PLAYER_KEY, JSON.stringify(player)); }
