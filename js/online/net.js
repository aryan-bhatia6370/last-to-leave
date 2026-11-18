// Firebase Realtime Database (rooms, live turns). Loaded only when online play is used.
import { loadFirebase } from '../core/account.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.14.1';
let rt = null;

/** { db, D (the SDK module), ref(path), now() server-synced ms } */
export async function rtdb() {
  if (rt) return rt;
  const { app } = await loadFirebase();
  const D = await import(`${SDK}/firebase-database.js`);
  const db = D.getDatabase(app);
  let offset = 0;
  D.onValue(D.ref(db, '.info/serverTimeOffset'), (s) => { offset = s.val() || 0; });
  rt = { db, D, ref: (p) => D.ref(db, p), now: () => Date.now() + offset };
  return rt;
}
