// Leaderboards. Three categories (Endless, Competition, Minigame), each board
// kept twice: all-time and this week.
//
// Firestore: boards/{period~kind}/entries/{uid} = { uid, username, value, updatedAt }
//   period = 'all' or 'w' + the Monday that starts the week (e.g. w2026-11-16)
//   kind   = one of BOARDS below
// Rules (firestore.rules) make counters go up by exactly 1 and best scores only go up.
//
// What counts (decided with the user, 2026-11-18):
// - Only signed-in players are on the boards. Debug mode (?debug=1) never counts.
// - Minigame win (offline): passing a minigame played on its own, OR the top score
//   in a Competition round (ties for top count; tie-break replays don't). In Pictionary
//   and Equations races, top = first to solve the first board.
// - Competition win (offline): winning a run.
// - Offline Competition only counts with 3+ players at the table (you + 2 computers),
//   matching online's 3+ real players. Applies to both of the above.
// - Online (rooms with 3+ real people): wins, rounds with the top score, and the run
//   performance score (online/performance.js), stored x10 as an integer, shown /100 with one decimal.

import { scores, onScoreSaved } from './scores.js';
import { onAccount, loadFirebase, signedInHandles } from './account.js';
import { DEBUG } from './env.js';

export const LEADERBOARD = {
  weekTimeZone: 'America/Los_Angeles', // weeks start Monday 00:00 in this time zone
  minCompetitionSeats: 3,              // you + at least 2 computers (matches online's 3+ real players)
  showTop: 10,
};

export const CATEGORIES = [
  { id: 'endless', label: 'Endless', boards: ['endless-catch', 'endless-bullet', 'endless-cup', 'endless-rush', 'endless-streak'] },
  { id: 'fastest', label: 'Fastest', boards: ['fast-equations', 'fast-pictionary'] },
  { id: 'competition', label: 'Competition', boards: ['comp-wins', 'comp-wins-offline', 'comp-wins-online', 'comp-performance'] },
  { id: 'minigame', label: 'Minigames', boards: ['mini-wins', 'mini-wins-offline', 'mini-wins-online'] },
];

export const BOARDS = {
  'endless-catch': { v: 2, label: 'Endless Marker Catching', note: 'Best run', type: 'best', game: 'marker-catching', variant: 'endless', unit: 'caught' },
  'endless-bullet': { v: 2, label: 'Endless Bullet', note: 'Marker Catching, Bullet + Endless', type: 'best', game: 'marker-catching', variant: 'bullet-endless', unit: 'caught' },
  'endless-cup': { v: 3, label: 'Endless Cup Catching', note: 'Best run', type: 'best', game: 'cup-catching', variant: 'endless', unit: 'caught' },
  'endless-rush': { label: 'Equations Rush', note: 'Most problems solved in one run', type: 'best', game: 'equations', variant: 'rush', unit: 'solved' },
  'endless-streak': { label: 'Pictionary Streak', note: 'Most drawings guessed before 3 strikes', type: 'best', game: 'pictionary', variant: 'streak', unit: 'guessed' },
  'fast-equations': { label: 'Fastest Equations', note: 'Best average time in a game where you solved all 3', type: 'fastest', game: 'equations', scale: 10, decimals: 1, suffix: 's' },
  'fast-pictionary': { label: 'Fastest Pictionary', note: 'Best average time in a game where you guessed all 3 (built-in drawings)', type: 'fastest', game: 'pictionary', scale: 10, decimals: 1, suffix: 's' },
  'comp-wins': { label: 'Total wins', note: 'Offline + online', type: 'count', unit: 'wins' },
  'comp-wins-offline': { label: 'Offline wins', note: '3+ players at the table (you + 2 computers or more)', type: 'count', unit: 'wins' },
  'comp-wins-online': { label: 'Online wins', note: 'Online rooms with 3+ real players', type: 'count', unit: 'wins' },
  'comp-performance': { label: 'Best performance', note: 'Whole-run score out of 100 (one decimal), online rooms with 3+ real players', type: 'best', unit: '/100', decimals: 1, scale: 10 },
  'mini-wins': { label: 'Total minigame wins', note: 'Offline + online', type: 'count', unit: 'wins' },
  'mini-wins-offline': { label: 'Offline minigame wins', note: 'Passing a minigame, or top score in a Competition round (3+ players)', type: 'count', unit: 'wins' },
  'mini-wins-online': { label: 'Online minigame wins', note: 'Top score in a round (first to solve in races), online rooms with 3+ real players', type: 'count', unit: 'wins' },
};

// ---------- weeks ----------
/** 'w' + the Monday (yyyy-mm-dd) that starts the week containing `date`. */
export function weekKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: LEADERBOARD.weekTimeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(date).map((p) => [p.type, p.value]));
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday);
  const d = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day - dow));
  return `w${d.toISOString().slice(0, 10)}`;
}
// A board's `v` > 1 starts it fresh (the game changed): its id gets '.v2' etc.
const boardId = (period, kind) => `${period}${(BOARDS[kind]?.v ?? 1) > 1 ? `.v${BOARDS[kind].v}` : ''}~${kind}`;

// ---------- writing ----------
async function addWin(kinds) {
  const h = signedInHandles();
  if (!h || DEBUG) return;
  const { db, F, uid, username } = h;
  const batch = F.writeBatch(db);
  for (const kind of kinds) {
    for (const period of ['all', weekKey()]) {
      batch.set(F.doc(db, 'boards', boardId(period, kind), 'entries', uid),
        { uid, username, value: F.increment(1), updatedAt: F.serverTimestamp() }, { merge: true });
    }
  }
  await batch.commit();
}

/** Best score: higher wins, except 'fastest' boards (lower time wins). */
async function submitBest(kind, value, periods) {
  const lower = BOARDS[kind]?.type === 'fastest';
  const h = signedInHandles();
  if (!h || DEBUG) return;
  const { db, F, uid, username } = h;
  for (const period of periods) {
    const ref = F.doc(db, 'boards', boardId(period, kind), 'entries', uid);
    const cur = await F.getDoc(ref);
    if (cur.exists() && (lower ? cur.data().value <= value : cur.data().value >= value)) continue;
    await F.setDoc(ref, { uid, username, value, updatedAt: F.serverTimestamp() });
  }
}

const warn = (what) => (e) => console.warn(`leaderboard: ${what}`, e);

/** A minigame win inside an offline Competition run (top score in a round). */
export function recordCompetitionRoundWin(tableSize) {
  if (tableSize < LEADERBOARD.minCompetitionSeats) return;
  addWin(['mini-wins', 'mini-wins-offline']).catch(warn('round win'));
}

/**
 * End of an online run with 3+ real players (the caller checks that):
 * a win, the rounds where you had the top score, and your performance (/100, one decimal).
 */
export async function recordOnlineRun({ won, roundWins, performance }) {
  if (won) await addWin(['comp-wins', 'comp-wins-online']).catch(warn('online win'));
  for (let i = 0; i < roundWins; i++) await addWin(['mini-wins', 'mini-wins-online']).catch(warn('online round win'));
  if (performance != null) await submitBest('comp-performance', Math.round(performance * 10), ['all', weekKey()]).catch(warn('performance'));
}

const endlessKind = (gameId, variant) =>
  Object.keys(BOARDS).find((k) => BOARDS[k].type === 'best' && BOARDS[k].game === gameId && BOARDS[k].variant === variant);

// every saved result: solo passes, Competition wins, endless scores
onScoreSaved((record) => {
  if (!signedInHandles() || DEBUG) return;
  if (record.stats?.online) return; // online runs are counted by recordOnlineRun
  if (record.gameId === 'competition') {
    if (record.passed && (record.stats?.players ?? 0) >= LEADERBOARD.minCompetitionSeats) {
      addWin(['comp-wins', 'comp-wins-offline']).catch(warn('competition win'));
    }
    return;
  }
  if (record.passed) addWin(['mini-wins', 'mini-wins-offline']).catch(warn('minigame win'));
  // Fastest solver: a full regular game with every round solved
  const fast = Object.keys(BOARDS).find((k) => BOARDS[k].type === 'fastest' && BOARDS[k].game === record.gameId);
  if (fast && record.variant === 'regular' && record.score === record.maxScore && record.stats?.avgSeconds != null) {
    submitBest(fast, Math.max(5, Math.round(record.stats.avgSeconds * 10)), ['all', weekKey()]).catch(warn('fastest'));
  }
  const kind = endlessKind(record.gameId, record.variant);
  if (kind) submitBest(kind, record.score, ['all', weekKey()]).catch(warn('endless best'));
});

// on sign-in: put this device's endless bests on the boards (scores from before signing in)
let syncedFor = null;
onAccount((s) => {
  if (!s.user || !s.profile || syncedFor === s.user.uid) return;
  syncedFor = s.user.uid;
  (async () => {
    const bests = await scores.getBests();
    const thisWeek = weekKey();
    for (const [kind, b] of Object.entries(BOARDS)) {
      if (b.type !== 'best' || !b.game) continue;
      const rec = bests[`${b.game}:${b.variant}`];
      if (!rec) continue;
      const periods = ['all'];
      if (rec.playedAt && weekKey(new Date(rec.playedAt)) === thisWeek) periods.push(thisWeek);
      await submitBest(kind, rec.score, periods);
    }
  })().catch(warn('sign-in sync'));
});

// ---------- reading ----------
/** Top entries for a board, plus the signed-in player's own rank. */
export async function fetchBoard(kind, period = 'all', limit = LEADERBOARD.showTop) {
  const { db, F } = await loadFirebase();
  const id = boardId(period === 'week' ? weekKey() : 'all', kind);
  const coll = F.collection(db, 'boards', id, 'entries');
  const asc = BOARDS[kind]?.type === 'fastest';
  const snap = await F.getDocs(F.query(coll, F.orderBy('value', asc ? 'asc' : 'desc'), F.limit(limit)));
  const top = [];
  snap.forEach((d) => top.push(d.data()));
  let me = null;
  const h = signedInHandles();
  if (h) {
    const mine = top.find((e) => e.uid === h.uid);
    if (mine) {
      me = { ...mine, rank: top.indexOf(mine) + 1 };
    } else {
      const own = await F.getDoc(F.doc(db, 'boards', id, 'entries', h.uid));
      if (own.exists()) {
        const above = await F.getCountFromServer(F.query(coll, F.where('value', asc ? '<' : '>', own.data().value)));
        me = { ...own.data(), rank: above.data().count + 1 };
      }
    }
  }
  return { top, me };
}
