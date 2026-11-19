// Online rooms (Firebase Realtime Database).
//
// rooms/{CODE}/
//   meta      { host uid, status 'lobby'|'playing'|'done', createdAt, cpus, versions }
//   members   {uid}: { username, char, ready, joinedAt } everyone in the room
//   requests  {uid}: 'fast' | 'skip'                    when only computers are left
//   presence  {uid}: true while connected (removed automatically on disconnect)
//   chars     {charId}: uid                            each character taken by one player
//   run       the game itself, written only by the host (see referee.js)
//   results   {turnKey}/{uid}: { score }               each player writes their own turn result
//   race      {raceKey}/{uid}: { solved, t }            each player's race outcome
//   live      {turnKey}: { ts, j }                      the current player's live game state

import { rtdb } from './net.js';

export const ONLINE = {
  codeChars: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789',
  codeLength: 5,
  maxSeats: 8,
  minRealForBoards: 3, // online leaderboards need 3+ real people in the room
};

export const isCode = (c) => new RegExp(`^[${ONLINE.codeChars}]{${ONLINE.codeLength}}$`).test(c);

export async function createRoom(uid) {
  const { D, ref } = await rtdb();
  for (let tries = 0; tries < 10; tries++) {
    let code = '';
    for (let i = 0; i < ONLINE.codeLength; i++) code += ONLINE.codeChars[Math.floor(Math.random() * ONLINE.codeChars.length)];
    const res = await D.runTransaction(ref(`rooms/${code}/meta`), (cur) => (cur ? undefined : {
      host: uid, status: 'lobby', createdAt: Date.now(), cpus: 0,
    }));
    if (res.committed) return code;
  }
  throw new Error('Could not make a room code. Try again.');
}

export async function roomExists(code) {
  const { D, ref } = await rtdb();
  return (await D.get(ref(`rooms/${code}/meta`))).exists();
}

/**
 * Join (or rejoin) a room and keep presence up to date. While the room is in
 * the lobby, leaving (or losing connection) also gives up your seat.
 * Returns { leave(), lockSeat() }.
 */
export async function joinRoom(code, { uid, username }) {
  const { D, ref } = await rtdb();
  const memberRef = ref(`rooms/${code}/members/${uid}`);
  const presRef = ref(`rooms/${code}/presence/${uid}`);
  await D.update(memberRef, { username, joinedAt: D.serverTimestamp() });
  const offConn = D.onValue(ref('.info/connected'), async (snap) => {
    if (snap.val() !== true) return;
    await D.onDisconnect(presRef).remove();
    await D.set(presRef, true);
  });
  let lobbyCleanup = true;
  const status = (await D.get(ref(`rooms/${code}/meta/status`))).val();
  if (status === 'lobby') await D.onDisconnect(memberRef).remove();
  else lobbyCleanup = false;
  return {
    /** game started: don't drop membership/seat on disconnect any more */
    async lockSeat() {
      if (!lobbyCleanup) return;
      lobbyCleanup = false;
      await D.onDisconnect(memberRef).cancel();
      const ch = (await D.get(ref(`rooms/${code}/members/${uid}/char`))).val();
      if (ch) await D.onDisconnect(ref(`rooms/${code}/chars/${ch}`)).cancel();
    },
    async leave({ inLobby }) {
      offConn();
      await D.onDisconnect(presRef).cancel();
      await D.remove(presRef);
      if (inLobby) {
        const ch = (await D.get(ref(`rooms/${code}/members/${uid}/char`))).val();
        if (ch) await D.remove(ref(`rooms/${code}/chars/${ch}`)).catch(() => {});
        await D.remove(memberRef);
      }
    },
  };
}

/** Take a character (if nobody has it). Gives back your previous one. */
export async function claimChar(code, uid, charId, prev) {
  const { D, ref } = await rtdb();
  const res = await D.runTransaction(ref(`rooms/${code}/chars/${charId}`), (cur) => (cur == null || cur === uid ? uid : undefined));
  if (!res.committed) return false;
  if (prev && prev !== charId) {
    await D.onDisconnect(ref(`rooms/${code}/chars/${prev}`)).cancel();
    await D.remove(ref(`rooms/${code}/chars/${prev}`));
  }
  await D.onDisconnect(ref(`rooms/${code}/chars/${charId}`)).remove();
  await D.update(ref(`rooms/${code}/members/${uid}`), { char: charId, ready: false }); // new seat: ready again
  return true;
}

export async function setReady(code, uid, ready) {
  const { D, ref } = await rtdb();
  await D.update(ref(`rooms/${code}/members/${uid}`), { ready: !!ready });
}

/** 'fast' or 'skip' once only computers are left at the table. */
export async function sendRequest(code, uid, what) {
  const { D, ref } = await rtdb();
  await D.set(ref(`rooms/${code}/requests/${uid}`), what);
}

export async function setMeta(code, patch) {
  const { D, ref } = await rtdb();
  await D.update(ref(`rooms/${code}/meta`), patch);
}

/** Watch the whole room (except the live feed). cb(room) on every change. */
export async function subscribeRoom(code, cb) {
  const { D, ref } = await rtdb();
  const room = {};
  let queued = false;
  const emit = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; cb(room); }); };
  const offs = ['meta', 'members', 'presence', 'chars', 'run', 'results', 'race', 'requests'].map((k) =>
    D.onValue(ref(`rooms/${code}/${k}`), (s) => { room[k] = s.val(); emit(); }, (e) => { room.error = e; emit(); }));
  return () => offs.forEach((off) => off());
}

/** The effective host: the stored host if connected, else the earliest-joined connected member. */
export function effectiveHost(room) {
  const pres = room.presence || {};
  if (room.meta?.host && pres[room.meta.host]) return room.meta.host;
  const here = Object.entries(room.members || {}).filter(([uid]) => pres[uid]).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  return here[0]?.[0] || null;
}
