import { GAMES } from '../games/registry.js';
import { COLOR_BY_ID } from '../shared/colors.js';
import { markerSVG } from '../shared/marker.js';
import { scores, formatScore } from '../core/scores.js';
import { escapeHtml } from '../core/env.js';
import { mountAccountChip } from './account.js';
import { accountState, onAccount } from '../core/account.js';

export async function renderHome(outlet) {
  const bests = await scores.getBests();

  const cards = GAMES.map((g, i) => {
    const hex = COLOR_BY_ID[g.color].hex;
    const best = bests[`${g.id}:regular`];
    const top = `
      <div class="card-top">
        <span class="card-num">Game ${i + 1}</span>
        ${markerSVG(hex, { length: 90 })}
      </div>
      <h3>${escapeHtml(g.name)}</h3>
      <p>${escapeHtml(g.blurb)}</p>`;
    if (g.load) {
      return `
        <a class="game-card" href="#/play/${g.id}" style="--c: var(--m-${g.color})">
          ${top}
          <div class="card-foot">
            <span class="card-best">${best ? `Best: ${formatScore(best.score, best.maxScore)}` : 'Not played yet'}</span>
            <span class="chip chip-play">Play</span>
          </div>
        </a>`;
    }
    return `
      <div class="game-card locked" aria-disabled="true" style="--c: var(--m-${g.color})">
        ${top}
        <div class="card-foot"><span></span><span class="chip">Phase ${g.phase}</span></div>
      </div>`;
  }).join('');

  outlet.innerHTML = `
    <main class="page home">
      <header class="hero">
        <img class="hero-shot" alt="" data-hero>
        <div class="hero-account" data-account hidden></div>
        <h1 class="logo">
          Last to Leave
          <svg class="logo-underline" viewBox="0 0 400 24" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength="1" d="M6 15 C 90 6, 190 20, 280 10 S 370 9, 394 13" />
          </svg>
        </h1>
        <p class="tagline">Minigames from the game show we ran at our school table. Survive every round and be the last one left.</p>
      </header>
      <section class="board home-cta">
        <div>
          <h2>Competition Mode</h2>
          <p>Sit at the table with up to 7 computer players. Paul runs a game each round, the lowest score leaves, and the last one sitting wins.</p>
        </div>
        <a class="btn btn-primary" href="#/compete">Play Last to Leave</a>
      </section>
      <section class="board">
        <div class="section-heading">
          <h2>Pick a game</h2>
          <span class="heading-links"><a href="#/leaderboards">Leaderboards</a> · <a href="#/records">My records →</a></span>
        </div>
        <div class="game-grid">${cards}</div>
      </section>
      <footer class="site-foot">
        <a href="#/draw">Draw your own Pictionary prompts</a> · <span data-acct-note>${accountState().enabled ? 'Sign in to keep your scores on every device.' : 'Scores are saved on this device only.'}</span>
      </footer>
    </main>`;
  loadHeroShot(outlet.querySelector('[data-hero]'));
  mountAccountChip(outlet.querySelector('[data-account]'));
  const note = outlet.querySelector('[data-acct-note]');
  const off = onAccount((s) => {
    if (!note.isConnected) { queueMicrotask(() => off()); return; }
    if (s.user && s.profile) note.textContent = 'Your best scores sync to your account.';
    else if (s.enabled) note.textContent = 'Sign in to keep your scores on every device.';
  });
}

// A real 3D render of the setting behind the logo. Rendered once, then kept
// for this browser session so going back to the menu is instant.
async function loadHeroShot(img) {
  if (!img) return;
  const show = (url) => { img.src = url; img.onload = () => img.classList.add('ready'); };
  // measure after layout (right after innerHTML the header can report a tiny width)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rect = img.parentElement.getBoundingClientRect();
  const w = Math.round(Math.min(1120, Math.max(640, rect.width)));
  const h = Math.round(Math.max(300, rect.height));
  const key = `ltl.hero.v1.${Math.round(w / 100)}x${Math.round(h / 50)}`;
  try { const cached = sessionStorage.getItem(key); if (cached) { show(cached); return; } } catch { /* ignore */ }
  try {
    const { renderHeroShot } = await import('../three/heroShot.js');
    const url = await renderHeroShot(w, h);
    if (!img.isConnected) return;
    show(url);
    try { sessionStorage.setItem(key, url); } catch { /* too big or blocked: fine */ }
  } catch {
    // no WebGL / offline: the gradient behind the logo is enough
  }
}
