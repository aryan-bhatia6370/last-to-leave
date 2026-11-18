// Account UI: the #/account page, the small account chip on the home page,
// and the "pick a username" screen that every new account must get through.

import {
  onAccount, signIn, signOutUser, checkUsername, isUsernameFree, claimUsername, USERNAME_RULES,
} from '../core/account.js';
import { getPlayer, setPlayer } from '../core/scores.js';
import { escapeHtml } from '../core/env.js';

const GOOGLE_G = `<svg class="g-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`;

function friendlyError(e) {
  const code = e?.code || '';
  if (code === 'auth/unauthorized-domain') return 'This website address isn\'t allowed to sign in yet (add it under Authentication → Settings → Authorized domains).';
  if (code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
  if (code === 'auth/operation-not-allowed') return 'Google sign-in isn\'t switched on in Firebase yet.';
  if (code === 'permission-denied' || code === 'firestore/permission-denied') return 'The database refused that (security rules).';
  return e?.message || 'Something went wrong. Try again.';
}

async function doSignIn(btn, errEl) {
  btn.disabled = true;
  if (errEl) errEl.textContent = '';
  try { await signIn(); } catch (e) { console.warn(e); if (errEl) errEl.textContent = friendlyError(e); }
  btn.disabled = false;
}

// ---------- username form (used by the gate and the account page) ----------
function usernameForm(onDone) {
  const wrap = document.createElement('form');
  wrap.className = 'username-form';
  wrap.noValidate = true;
  wrap.innerHTML = `
    <label class="field">
      <span>Username</span>
      <input type="text" maxlength="16" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. marker_king" data-u>
    </label>
    <p class="hint" data-hint>${USERNAME_RULES}. This is the name everyone sees, and it can't be changed later.</p>
    <button class="btn btn-primary btn-big" type="submit" data-go>Save username</button>`;
  const input = wrap.querySelector('[data-u]');
  const hint = wrap.querySelector('[data-hint]');
  const go = wrap.querySelector('[data-go]');
  let checkTimer = 0;
  let seq = 0;
  const setHint = (text, kind = '') => { hint.textContent = text; hint.className = `hint ${kind}`; };

  input.addEventListener('input', () => {
    clearTimeout(checkTimer);
    const name = input.value.trim();
    const problem = name ? checkUsername(name) : null;
    if (!name) { setHint(`${USERNAME_RULES}. This is the name everyone sees, and it can't be changed later.`); return; }
    if (problem) { setHint(problem, 'bad'); return; }
    setHint('Checking…');
    const my = ++seq;
    checkTimer = setTimeout(async () => {
      try {
        const free = await isUsernameFree(name);
        if (my !== seq) return;
        setHint(free ? `${name} is available` : `${name} is taken`, free ? 'good' : 'bad');
      } catch { if (my === seq) setHint(''); }
    }, 350);
  });

  wrap.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = input.value.trim();
    const problem = checkUsername(name);
    if (problem) { setHint(problem, 'bad'); input.focus(); return; }
    go.disabled = true;
    setHint('Saving…');
    try {
      await claimUsername(name);
      setPlayer({ ...getPlayer(), name });
      onDone?.(name);
    } catch (e) {
      console.warn(e);
      setHint(e.message === 'taken' ? `${name} is taken. Try another.` : friendlyError(e), 'bad');
      go.disabled = false;
    }
  });
  setTimeout(() => input.focus(), 50);
  return wrap;
}

// ---------- the gate: signed in but no username yet -> must pick one ----------
let gateEl = null;
export function startUsernameGate() {
  onAccount((s) => {
    const need = s.ready && s.user && !s.profile && !s.error;
    if (need && !gateEl) {
      gateEl = document.createElement('div');
      gateEl.className = 'overlay gate';
      gateEl.innerHTML = `
        <div class="panel board">
          <p class="kicker">Welcome to the table</p>
          <h2>Pick your username</h2>
          <p class="sub">Other players and the leaderboards only ever see this name, never your Google name or email.</p>
          <div data-form></div>
          <button class="btn btn-small btn-ghost" type="button" data-out>Sign out instead</button>
        </div>`;
      gateEl.querySelector('[data-form]').append(usernameForm(() => {}));
      gateEl.querySelector('[data-out]').addEventListener('click', () => signOutUser());
      document.body.append(gateEl);
    } else if (!need && gateEl) {
      gateEl.remove();
      gateEl = null;
    }
    // keep the local player name in step with the account
    if (s.profile?.username && getPlayer().name !== s.profile.username) setPlayer({ ...getPlayer(), name: s.profile.username });
  });
}

// ---------- the chip on the home page ----------
export function mountAccountChip(el) {
  if (!el) return;
  const off = onAccount((s) => {
    if (!el.isConnected) { queueMicrotask(() => off()); return; }
    if (!s.enabled) { el.hidden = true; return; }
    el.hidden = false;
    if (!s.ready) { el.innerHTML = '<span class="account-chip muted">…</span>'; return; }
    if (s.user && s.profile) {
      el.innerHTML = `<a class="account-chip" href="#/account"><span class="avatar">${escapeHtml(s.profile.username[0].toUpperCase())}</span>${escapeHtml(s.profile.username)}</a>`;
    } else {
      el.innerHTML = `<a class="account-chip" href="#/account">${GOOGLE_G}Sign in</a>`;
    }
  });
}

// ---------- #/account ----------
export function renderAccount(outlet, _params, { isCurrent }) {
  outlet.innerHTML = `
    <main class="page account">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a></nav>
      <section class="board account-board" data-body></section>
    </main>`;
  const body = outlet.querySelector('[data-body]');
  const off = onAccount((s) => {
    if (!isCurrent() || !body.isConnected) { queueMicrotask(() => off()); return; }
    if (!s.enabled) {
      body.innerHTML = `<h1>Account</h1><p class="sub">Accounts aren't switched on yet. Your scores are saved on this device.</p>`;
      return;
    }
    if (!s.ready) { body.innerHTML = '<h1>Account</h1><p class="sub">Loading…</p>'; return; }
    if (!s.user) {
      body.innerHTML = `
        <h1>Sign in</h1>
        <p class="sub">Sign in with Google to keep your best scores on any device, show up on the leaderboards, and (soon) join rooms with friends.
        You'll pick a username the first time. Nobody else sees your Google name or email.</p>
        <button class="btn btn-primary btn-big google-btn" data-in>${GOOGLE_G}Sign in with Google</button>
        <p class="hint">Use a personal Google account. Most school accounts are blocked from signing in to outside sites.</p>
        <p class="hint bad" data-err>${escapeHtml(s.error || '')}</p>`;
      const btn = body.querySelector('[data-in]');
      btn.addEventListener('click', () => doSignIn(btn, body.querySelector('[data-err]')));
      return;
    }
    if (!s.profile) {
      body.innerHTML = `<h1>Pick your username</h1><p class="sub">${escapeHtml(s.error || 'Almost done.')}</p>`;
      return; // the gate overlay handles it
    }
    body.innerHTML = `
      <p class="kicker">Signed in as</p>
      <h1 class="account-name"><span class="avatar big">${escapeHtml(s.profile.username[0].toUpperCase())}</span>${escapeHtml(s.profile.username)}</h1>
      <p class="sub">Your best scores are saved to your account and come back on any device where you sign in.
      ${s.lastSync ? `Last synced ${new Date(s.lastSync).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.` : ''}</p>
      <div class="btn-row left">
        <a class="btn" href="#/records">My records</a>
        <button class="btn btn-danger" data-out>Sign out</button>
      </div>`;
    body.querySelector('[data-out]').addEventListener('click', () => signOutUser());
  });
}

