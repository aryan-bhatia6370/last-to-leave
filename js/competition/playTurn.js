// Run one minigame turn on top of the table (full screen), with the same
// countdown and pause as single games, and resolve with its result.
// Competition turns don't save single-game records.

import { GAMES } from '../games/registry.js';
import { variantToOptions } from './engine.js';
import { DEBUG, escapeHtml, ensureFonts } from '../core/env.js';

export async function playTurn(root, { gameId, variant, seed, extra = {}, banner = '' }) {
  const entry = GAMES.find((g) => g.id === gameId);
  const [mod] = await Promise.all([entry.load(), ensureFonts()]);
  const def = mod.default;
  const options = { ...variantToOptions(variant), ...extra };

  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'stage comp-turn';
    wrap.innerHTML = `
      <div class="stage-canvas"></div>
      ${banner ? `<div class="turn-banner">${escapeHtml(banner)}</div>` : ''}
      <button class="btn btn-small stage-pause" aria-label="Pause" data-pause><span class="pause-icon" aria-hidden="true"></span></button>
      <div class="overlay" hidden></div>`;
    root.appendChild(wrap);
    const overlay = wrap.querySelector('.overlay');
    let state = 'countdown';
    const timers = [];
    let done = false;

    const instance = def.create(wrap.querySelector('.stage-canvas'), {
      options, seed, debug: DEBUG,
      onFinish: (result) => {
        if (done) return;
        done = true;
        state = 'done';
        timers.push(setTimeout(() => cleanup(result), 500));
      },
    });

    const show = (html, cls = '') => { overlay.className = `overlay ${cls}`.trim(); overlay.innerHTML = html; overlay.hidden = false; };
    const hide = () => { overlay.hidden = true; overlay.innerHTML = ''; };

    function countdown() {
      const steps = ['3', '2', '1', def.goText || 'Go!'];
      steps.forEach((s, i) => timers.push(setTimeout(() => show(`<div class="countdown-num">${escapeHtml(s)}</div>`, 'countdown'), i * 520)));
      timers.push(setTimeout(() => { hide(); state = 'playing'; instance.start(); }, steps.length * 520 - 120));
    }

    function pause() {
      if (state !== 'playing') return;
      state = 'paused';
      instance.pause();
      show(`<div class="board panel"><h2>Paused</h2><p class="kicker">${escapeHtml(def.name)}</p>
        <div class="btn-row" style="margin-top:16px"><button class="btn btn-primary" data-resume>Resume</button></div></div>`);
      overlay.querySelector('[data-resume]').addEventListener('click', resume);
    }
    function resume() {
      if (state !== 'paused') return;
      hide();
      state = 'playing';
      instance.resume();
    }
    const onKey = (e) => { if (e.key === 'Escape') (state === 'paused' ? resume() : pause()); };
    const onVis = () => { if (document.hidden) pause(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', pause);
    wrap.querySelector('[data-pause]').addEventListener('click', pause);

    function cleanup(result) {
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', pause);
      instance.destroy();
      wrap.remove();
      resolve(result);
    }

    if (DEBUG) window.__turn = { instance, def, finish: (r) => { if (!done) { done = true; cleanup(r); } } };
    countdown();
  });
}
