// #/leaderboards — three tabs (Endless, Competition, Minigames), each board
// with a This week / All time switch.

import { CATEGORIES, BOARDS, fetchBoard } from '../core/leaderboard.js';
import { accountState, onAccount } from '../core/account.js';
import { escapeHtml } from '../core/env.js';

const PREF_KEY = 'ltl.boards.v1';
function loadPrefs() { try { return { tab: 'endless', period: 'week', ...JSON.parse(localStorage.getItem(PREF_KEY)) }; } catch { return { tab: 'endless', period: 'week' }; } }
function savePrefs(p) { try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch { /* fine */ } }

const fmtValue = (b, v) => (b.scale ? (v / b.scale).toFixed(b.decimals ?? 1) : `${v}`);

export function renderLeaderboards(outlet, _params, { isCurrent }) {
  const prefs = loadPrefs();
  if (!CATEGORIES.some((c) => c.id === prefs.tab)) prefs.tab = 'endless';

  outlet.innerHTML = `
    <main class="page leaderboards">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a><a class="btn btn-small" href="#/records">My records</a></nav>
      <section class="board">
        <h1>Leaderboards</h1>
        <p class="sub" data-who></p>
        <div class="lb-controls">
          <div class="seg" role="tablist" aria-label="Category">
            ${CATEGORIES.map((c) => `<button role="tab" data-tab="${c.id}">${c.label}</button>`).join('')}
          </div>
          <div class="seg seg-small" aria-label="Time period">
            <button data-period="week">This week</button>
            <button data-period="all">All time</button>
          </div>
        </div>
        <div class="lb-grid" data-grid></div>
      </section>
    </main>`;

  const grid = outlet.querySelector('[data-grid]');
  const who = outlet.querySelector('[data-who]');
  let token = 0;

  function syncButtons() {
    outlet.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === prefs.tab)));
    outlet.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('on', b.dataset.period === prefs.period));
  }

  async function draw() {
    syncButtons();
    const s = accountState();
    if (!s.enabled) { grid.innerHTML = '<p class="muted">Leaderboards need accounts, which are switched off.</p>'; return; }
    const my = ++token;
    const cat = CATEGORIES.find((c) => c.id === prefs.tab);
    grid.innerHTML = cat.boards.map((k) => `<article class="lb-card" data-board="${k}">
      <header><h2>${escapeHtml(BOARDS[k].label)}</h2><p>${escapeHtml(BOARDS[k].note)}</p></header>
      <div class="lb-body">${BOARDS[k].soon ? '<p class="lb-empty">Coming with online rooms.</p>' : '<p class="lb-empty">Loading…</p>'}</div>
    </article>`).join('');
    await Promise.all(cat.boards.filter((k) => !BOARDS[k].soon).map(async (k) => {
      const body = grid.querySelector(`[data-board="${k}"] .lb-body`);
      try {
        const { top, me } = await fetchBoard(k, prefs.period);
        if (my !== token || !isCurrent()) return;
        body.innerHTML = renderList(BOARDS[k], top, me);
      } catch (e) {
        console.warn(e);
        if (my === token) body.innerHTML = '<p class="lb-empty">Couldn\'t load this board. Check your connection.</p>';
      }
    }));
  }

  function renderList(b, top, me) {
    if (!top.length) return `<p class="lb-empty">No one yet${prefs.period === 'week' ? ' this week' : ''}. Be the first.</p>`;
    // tied values share a rank
    const rows = top.map((e) => {
      const rank = 1 + top.filter((x) => x.value > e.value).length;
      const mine = me && e.uid === me.uid;
      return `<li class="${mine ? 'me' : ''}"><span class="rank">${rank}</span><span class="who">${escapeHtml(e.username)}</span><span class="val">${fmtValue(b, e.value)}</span></li>`;
    }).join('');
    const extra = me && !top.some((e) => e.uid === me.uid)
      ? `<li class="me gap"><span class="rank">${me.rank}</span><span class="who">${escapeHtml(me.username)} (you)</span><span class="val">${fmtValue(b, me.value)}</span></li>` : '';
    return `<ol class="lb-list">${rows}${extra}</ol>`;
  }

  function drawWho(s) {
    if (s.user && s.profile) who.innerHTML = `You're on the boards as <strong>${escapeHtml(s.profile.username)}</strong>. Weeks reset Monday at midnight (Pacific).`;
    else if (s.enabled) who.innerHTML = '<a href="#/account">Sign in</a> to get on the leaderboards. Weeks reset Monday at midnight (Pacific).';
    else who.textContent = '';
  }

  outlet.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { prefs.tab = b.dataset.tab; savePrefs(prefs); draw(); }));
  outlet.querySelectorAll('[data-period]').forEach((b) => b.addEventListener('click', () => { prefs.period = b.dataset.period; savePrefs(prefs); draw(); }));

  // redraw when the account finishes loading or signs in/out
  let seen = null;
  const off = onAccount((s) => {
    if (!isCurrent()) { queueMicrotask(() => off()); return; }
    drawWho(s);
    const key = `${s.ready}|${s.user?.uid}|${!!s.profile}`;
    if (key !== seen && s.ready) { seen = key; draw(); }
  });
}
