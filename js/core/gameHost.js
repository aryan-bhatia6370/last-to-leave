// The shared game shell: setup screen (options + best score) -> countdown
// -> play -> pause -> results. Every minigame plugs into this with the same
// contract, so Competition Mode can later run games back to back.
//
// A game module's default export looks like:
// {
//   id, name, tagline, howTo: [..], goText,
//   options: [{ id, label, desc }],          // on/off toggles (e.g. Bullet, Endless)
//   variants: [{ id, label }],               // every combination, for Records
//   variant(opts) -> variant id string,
//   create(container, { options, seed, debug, onFinish }) -> { start, pause, resume, destroy }
// }
// The instance calls onFinish(result) exactly once with
//   { gameId, variant, score, maxScore, passed, durationMs, stats, seed }

import { scores, formatScore } from './scores.js';
import { DEBUG, escapeHtml, ensureFonts } from './env.js';
import { newSeed } from './rng.js';
import { GAMES } from '../games/registry.js';

const optionsKey = (id) => `ltl.options.${id}`;

function loadOptions(def) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(optionsKey(def.id)) || '{}') || {}; } catch { /* ignore */ }
  return Object.fromEntries(def.options.map((o) => [o.id, !!saved[o.id]]));
}
function saveOptions(def, opts) {
  try { localStorage.setItem(optionsKey(def.id), JSON.stringify(opts)); } catch { /* ignore */ }
}

export async function renderGamePage(outlet, params, { isCurrent }) {
  const entry = GAMES.find((g) => g.id === params.id);
  if (!entry) { location.hash = '#/'; return; }
  if (!entry.load) return renderComingSoon(outlet, entry);

  outlet.innerHTML = '<main class="page"><p class="loading">Uncapping markers…</p></main>';
  const [mod] = await Promise.all([entry.load(), ensureFonts()]);
  if (!isCurrent()) return;
  const session = new GameSession(outlet, mod.default, entry);
  return () => session.destroy();
}

function renderComingSoon(outlet, entry) {
  outlet.innerHTML = `
    <main class="page">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a></nav>
      <section class="board coming-soon" style="--c: var(--m-${entry.color})">
        <h1>${escapeHtml(entry.name)}</h1>
        <p>${escapeHtml(entry.blurb)}</p>
        <p><span class="chip">Coming in Phase ${entry.phase}</span></p>
      </section>
    </main>`;
}

class GameSession {
  constructor(outlet, def, entry) {
    this.outlet = outlet;
    this.def = def;
    this.entry = entry;
    this.opts = loadOptions(def);
    this.instance = null;
    this.state = 'setup'; // setup | countdown | playing | paused | results
    this.timers = [];
    this.renderSetup();

    this.onKey = (e) => this.handleKey(e);
    this.onVisibility = () => { if (document.hidden) this.pause(); };
    this.onBlur = () => this.pause();
    window.addEventListener('keydown', this.onKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
  }

  // ---------- Setup screen ----------
  renderSetup() {
    const def = this.def;
    this.outlet.innerHTML = `
      <main class="page game-page">
        <nav class="topbar">
          <a class="btn btn-small" href="#/">← Menu</a>
          <a class="btn btn-small btn-ghost" href="#/records">Records</a>
        </nav>
        <section class="board setup" style="--c: var(--m-${this.entry.color})">
          <h1 class="game-title">${escapeHtml(def.name)}</h1>
          <p class="tagline">${escapeHtml(def.tagline)}</p>
          <div class="setup-grid">
            <div class="howto">
              <h2>How to play</h2>
              <ul>${def.howTo.map((li) => `<li>${li}</li>`).join('')}</ul>
            </div>
            <div class="setup-side">
              ${def.options.length ? '<h2>Options</h2>' : ''}
              <div class="options">
                ${def.options.map((o) => `
                  <label class="toggle">
                    <input type="checkbox" data-opt="${o.id}" ${this.opts[o.id] ? 'checked' : ''}>
                    <span class="box" aria-hidden="true"></span>
                    <span class="toggle-text"><strong>${escapeHtml(o.label)}</strong><small>${escapeHtml(o.desc)}</small></span>
                  </label>`).join('')}
              </div>
              <p class="variant-line">Mode: <strong data-variant></strong></p>
              <p class="best-line" data-best>&nbsp;</p>
              <button class="btn btn-primary btn-big" data-start>Start</button>
              <p class="hint">Press <kbd>Enter</kbd> to start · <kbd>Esc</kbd> pauses</p>
            </div>
          </div>
        </section>
      </main>
      <div class="stage" hidden>
        <div class="stage-canvas"></div>
        <button class="btn btn-small stage-pause" aria-label="Pause" data-pause><span class="pause-icon" aria-hidden="true"></span></button>
        <div class="overlay" hidden></div>
      </div>`;

    this.stage = this.outlet.querySelector('.stage');
    this.canvasHost = this.outlet.querySelector('.stage-canvas');
    this.overlay = this.outlet.querySelector('.overlay');

    this.outlet.querySelectorAll('[data-opt]').forEach((input) => {
      input.addEventListener('change', () => {
        this.opts[input.dataset.opt] = input.checked;
        saveOptions(this.def, this.opts);
        this.updateSetupInfo();
      });
    });
    this.outlet.querySelector('[data-start]').addEventListener('click', () => this.start());
    this.outlet.querySelector('[data-pause]').addEventListener('click', () => this.pause());
    this.updateSetupInfo();
  }

  variantLabel(variantId) {
    return this.def.variants.find((v) => v.id === variantId)?.label ?? variantId;
  }

  async updateSetupInfo() {
    const variant = this.def.variant(this.opts);
    const vEl = this.outlet.querySelector('[data-variant]');
    if (vEl) vEl.textContent = this.variantLabel(variant);
    const best = await scores.getBest(this.def.id, variant);
    const bEl = this.outlet.querySelector('[data-best]');
    if (!bEl) return;
    bEl.innerHTML = best
      ? `Your best: <strong>${formatScore(best.score, best.maxScore)}</strong>`
      : 'No score yet in this mode.';
  }

  // ---------- Flow ----------
  async start() {
    this.teardownInstance();
    saveOptions(this.def, this.opts);
    document.body.classList.add('playing');
    this.stage.hidden = false;
    this.hideOverlay();
    this.outlet.querySelector('[data-pause]').hidden = false;

    const seed = newSeed();
    this.instance = this.def.create(this.canvasHost, {
      options: { ...this.opts },
      seed,
      debug: DEBUG,
      onFinish: (result) => this.finish(result),
    });
    this.state = 'countdown';
    const ok = await this.countdown();
    if (!ok || this.state !== 'countdown') return;
    this.state = 'playing';
    this.instance.start();
  }

  countdown() {
    const steps = ['3', '2', '1', this.def.goText || 'Go!'];
    const stepMs = 520;
    this.clearTimers();
    return new Promise((resolve) => {
      this.cancelCountdown = () => resolve(false);
      steps.forEach((s, i) => {
        this.timers.push(setTimeout(() => {
          this.showOverlay(`<div class="countdown-num">${escapeHtml(s)}</div>`, 'countdown');
        }, i * stepMs));
      });
      this.timers.push(setTimeout(() => {
        this.hideOverlay();
        this.cancelCountdown = null;
        resolve(true);
      }, steps.length * stepMs - 120));
    });
  }

  pause() {
    if (this.state === 'countdown') {
      // Pausing during the countdown just restarts it on resume.
      this.clearTimers();
      this.cancelCountdown?.();
      this.state = 'paused';
      this.pausedFromCountdown = true;
      this.showPausePanel();
      return;
    }
    if (this.state !== 'playing') return;
    this.instance?.pause();
    this.state = 'paused';
    this.pausedFromCountdown = false;
    this.showPausePanel();
  }

  async resume() {
    if (this.state !== 'paused') return;
    this.hideOverlay();
    if (this.pausedFromCountdown) {
      this.state = 'countdown';
      const ok = await this.countdown();
      if (!ok || this.state !== 'countdown') return;
      this.state = 'playing';
      this.instance.start();
      return;
    }
    this.state = 'playing';
    this.instance?.resume();
  }

  quitToSetup() {
    this.teardownInstance();
    this.clearTimers();
    this.hideOverlay();
    this.stage.hidden = true;
    document.body.classList.remove('playing');
    this.state = 'setup';
    this.updateSetupInfo();
    this.outlet.querySelector('[data-start]')?.focus();
  }

  async finish(result) {
    if (this.state !== 'playing' && this.state !== 'paused') return;
    this.state = 'results';
    this.outlet.querySelector('[data-pause]').hidden = true;
    const { isBest, previousBest } = await scores.submit(result);
    this.showResults(result, isBest, previousBest);
  }

  // ---------- Overlays ----------
  showPausePanel() {
    this.showOverlay(`
      <div class="board panel" style="--c: var(--m-${this.entry.color})">
        <h2>Paused</h2>
        <p class="kicker">${escapeHtml(this.def.name)} · ${escapeHtml(this.variantLabel(this.def.variant(this.opts)))}</p>
        <div class="btn-row" style="margin-top:18px">
          <button class="btn btn-primary" data-act="resume">Resume</button>
          <button class="btn" data-act="restart">Restart</button>
          <button class="btn" data-act="quit">Quit</button>
        </div>
      </div>`);
    this.overlay.querySelector('[data-act="resume"]').focus();
  }

  showResults(result, isBest, previousBest) {
    const def = this.def;
    const verdict = result.passed ? def.passText || 'Still at the table!' : def.failText || 'You left the table.';
    const scoreHtml = result.maxScore != null
      ? `${result.score}<small> / ${result.maxScore}</small>`
      : `${result.score}`;
    let bestHtml;
    if (isBest && previousBest) bestHtml = `<span class="new-best">New best!</span> <span class="muted">(was ${formatScore(previousBest.score, previousBest.maxScore)})</span>`;
    else if (isBest) bestHtml = '<span class="muted">First score in this mode, saved.</span>';
    else bestHtml = `<span class="muted">Your best: ${formatScore(previousBest.score, previousBest.maxScore)}</span>`;

    const statItems = (def.statLabels || [])
      // always show the first stat; hide the rest when they're zero
      .filter(([key], i) => result.stats?.[key] != null && (i === 0 || result.stats[key] !== 0))
      .map(([key, label]) => `<li>${escapeHtml(label)} <strong>${result.stats[key]}</strong></li>`)
      .join('');

    this.showOverlay(`
      <div class="board panel" style="--c: var(--m-${this.entry.color})">
        <p class="kicker">${escapeHtml(def.name)} · ${escapeHtml(this.variantLabel(result.variant))}</p>
        <h2 class="verdict ${result.passed ? 'pass' : 'fail'}">${escapeHtml(verdict)}</h2>
        <div class="big-score">${scoreHtml}</div>
        <p>${bestHtml}</p>
        <ul class="stats">${statItems}</ul>
        <div class="btn-row">
          <button class="btn btn-primary" data-act="restart">Play again</button>
          <button class="btn" data-act="quit">Change mode</button>
          <a class="btn" href="#/">Menu</a>
        </div>
      </div>`);
    this.overlay.querySelector('[data-act="restart"]').focus();
  }

  showOverlay(html, extraClass = '') {
    this.overlay.className = `overlay ${extraClass}`.trim();
    this.overlay.innerHTML = html;
    this.overlay.hidden = false;
    this.overlay.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.act;
        if (act === 'resume') this.resume();
        else if (act === 'restart') this.start();
        else if (act === 'quit') this.quitToSetup();
      });
    });
  }

  hideOverlay() {
    this.overlay.hidden = true;
    this.overlay.innerHTML = '';
  }

  handleKey(e) {
    const tag = e.target?.tagName;
    if (e.key === 'Escape') {
      if (this.state === 'playing' || this.state === 'countdown') this.pause();
      else if (this.state === 'paused') this.resume();
      return;
    }
    if (e.key === 'Enter' && this.state === 'setup' && tag !== 'A' && tag !== 'BUTTON') {
      e.preventDefault();
      this.start();
    }
  }

  // ---------- Cleanup ----------
  clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  teardownInstance() {
    this.clearTimers();
    this.cancelCountdown = null;
    if (this.instance) {
      this.instance.destroy();
      this.instance = null;
    }
  }

  destroy() {
    this.teardownInstance();
    window.removeEventListener('keydown', this.onKey);
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    document.body.classList.remove('playing');
  }
}
