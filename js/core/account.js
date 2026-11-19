// Accounts: Google sign-in (Firebase Auth) + a public username + cloud scores.
//
// - Sign in with Google. The first time, you pick a username; that's the only
//   name other players and leaderboards ever see (never your Google name/email).
// - Scores are always saved on this device too. When signed in, your best
//   scores also go to your account and come back on any device you sign in on.
// - Firebase is loaded only when accounts are switched on (FIREBASE_CONFIG).
//
// Firestore layout (rules in /firestore.rules):
//   usernames/{lowercase name}  { uid }                       one per name, never changes
//   users/{uid}                 { username, usernameLower, createdAt }
//   users/{uid}/bests/{game:variant}  { gameId, variant, score, maxScore, passed, playedAt }
//   users/{uid}/history/{auto}        same fields, one per game played

import { FIREBASE_CONFIG } from './firebaseConfig.js';
import { scores, onScoreSaved, isCurrent } from './scores.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';

const state = { enabled: !!FIREBASE_CONFIG, ready: !FIREBASE_CONFIG, user: null, profile: null, error: null };
const listeners = new Set();
let fb = null;
let loading = null;

export function accountState() { return state; }
/** Firebase handles for other modules (leaderboards). Loads Firebase if needed. */
export function loadFirebase() { return load(); }
/** Signed in with a username? -> { db, F, uid, username }, else null. */
export function signedInHandles() {
  return fb && state.user && state.profile ? { db: fb.db, F: fb.F, uid: state.user.uid, username: state.profile.username } : null;
}
export function onAccount(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}
function emit() { for (const fn of listeners) { try { fn(state); } catch (e) { console.error(e); } } }

function load() {
  if (!FIREBASE_CONFIG) return Promise.reject(new Error('Accounts are switched off'));
  if (loading) return loading;
  loading = (async () => {
    const [appM, authM, fsM] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    const app = appM.initializeApp(FIREBASE_CONFIG);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    fb = { app, auth, db, A: authM, F: fsM };
    authM.onAuthStateChanged(auth, async (user) => {
      state.user = user ? { uid: user.uid } : null;
      state.profile = null;
      if (user) {
        try { state.profile = await fetchProfile(user.uid); } catch (e) { state.error = 'Could not load your account'; console.warn(e); }
      }
      state.ready = true;
      emit();
      if (user && state.profile) syncScores();
    });
    return fb;
  })();
  return loading;
}

/** Call once at startup. */
export async function initAccounts() {
  if (!FIREBASE_CONFIG) { emit(); return; }
  try { await load(); } catch (e) {
    console.warn('Accounts unavailable', e);
    state.ready = true;
    state.error = 'Accounts are unavailable right now (offline?)';
    emit();
  }
}

export async function signIn() {
  const { auth, A } = await load();
  const provider = new A.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await A.signInWithPopup(auth, provider);
  } catch (e) {
    if (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment') {
      await A.signInWithRedirect(auth, provider);
    } else if (e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

export async function signOutUser() {
  const { auth, A } = await load();
  await A.signOut(auth);
}

async function fetchProfile(uid) {
  const { db, F } = fb;
  const snap = await F.getDoc(F.doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

// ---------- usernames ----------
export const USERNAME_RULES = '3–16 characters: letters, numbers or _';
const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;
// Keeps the obvious stuff out of a public leaderboard. (Not perfect; can be extended.)
const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigg', 'fag', 'slut', 'whore', 'rape', 'nazi', 'hitler', 'porn', 'dick', 'pussy', 'cock', 'admin', 'moderator'];

/** Returns an error message, or null if the name is OK to try. */
export function checkUsername(name) {
  if (!USERNAME_RE.test(name)) return USERNAME_RULES;
  if (BLOCKED.some((b) => name.toLowerCase().includes(b))) return 'Please pick a different name';
  return null;
}

export async function isUsernameFree(name) {
  const { db, F } = await load();
  const snap = await F.getDoc(F.doc(db, 'usernames', name.toLowerCase()));
  return !snap.exists();
}

/** Claim a username for the signed-in player (once). Throws Error('taken') if someone has it. */
export async function claimUsername(name) {
  const problem = checkUsername(name);
  if (problem) throw new Error(problem);
  const { db, F } = await load();
  const uid = state.user?.uid;
  if (!uid) throw new Error('Not signed in');
  const lower = name.toLowerCase();
  await F.runTransaction(db, async (tx) => {
    const nameRef = F.doc(db, 'usernames', lower);
    if ((await tx.get(nameRef)).exists()) throw new Error('taken');
    tx.set(nameRef, { uid });
    tx.set(F.doc(db, 'users', uid), { username: name, usernameLower: lower, createdAt: F.serverTimestamp() });
  });
  state.profile = { username: name, usernameLower: lower };
  emit();
  syncScores();
}

// ---------- cloud scores ----------
const cloudFields = (r) => ({
  gameId: r.gameId,
  variant: r.variant,
  score: r.score,
  maxScore: r.maxScore ?? null,
  passed: !!r.passed,
  playedAt: r.playedAt,
  rv: r.rv ?? 1,
});

async function pushBest(rec) {
  const { db, F } = fb;
  const ref = F.doc(db, 'users', state.user.uid, 'bests', `${rec.gameId}:${rec.variant}`);
  const cur = await F.getDoc(ref);
  if (!cur.exists() || !isCurrent(cur.data()) || rec.score > cur.data().score) await F.setDoc(ref, cloudFields(rec));
}

// every new score: save it to your account too
onScoreSaved((record) => {
  if (!fb || !state.user || !state.profile) return;
  const { db, F } = fb;
  F.addDoc(F.collection(db, 'users', state.user.uid, 'history'), cloudFields(record)).catch((e) => console.warn('history sync', e));
  pushBest(record).catch((e) => console.warn('best sync', e));
});

/** Two-way merge of best scores between this device and your account. */
export async function syncScores() {
  if (!fb || !state.user || !state.profile) return;
  try {
    const { db, F } = fb;
    const snap = await F.getDocs(F.collection(db, 'users', state.user.uid, 'bests'));
    const cloud = {};
    snap.forEach((d) => { cloud[d.id] = d.data(); });
    // upload what this device has that's better
    const local = await scores.getBests();
    for (const [k, rec] of Object.entries(local)) {
      if (!cloud[k] || !isCurrent(cloud[k]) || rec.score > cloud[k].score) await F.setDoc(F.doc(db, 'users', state.user.uid, 'bests', k), cloudFields(rec));
    }
    // download what the account has that's better
    const changed = await scores.mergeBests(cloud);
    state.lastSync = new Date().toISOString();
    if (changed) emit();
  } catch (e) {
    console.warn('Score sync failed', e);
  }
}
