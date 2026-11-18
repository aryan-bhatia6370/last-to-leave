// The "type your answer" bar for Equations and Pictionary.
import { escapeHtml } from '../core/env.js';

export function createAnswerBar(container, { placeholder = 'Your answer', onSubmit, onPass, inputMode = 'text' }) {
  const form = document.createElement('form');
  form.className = 'answer-bar';
  form.setAttribute('autocomplete', 'off');
  form.innerHTML = `
    <input type="text" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false"
      enterkeyhint="go" inputmode="${inputMode}" placeholder="${escapeHtml(placeholder)}" aria-label="Your answer" maxlength="40">
    <button class="btn btn-primary" type="submit">Guess</button>
    <button class="btn btn-small btn-ghost" type="button" data-pass>Pass</button>`;
  container.appendChild(form);
  const input = form.querySelector('input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim();
    if (!v || input.disabled) return;
    onSubmit(v);
  });
  form.querySelector('[data-pass]').addEventListener('click', () => onPass?.());
  return {
    input,
    focus() { try { input.focus({ preventScroll: true }); } catch { input.focus(); } },
    clear() { input.value = ''; },
    setEnabled(on) {
      input.disabled = !on;
      form.querySelectorAll('button').forEach((b) => { b.disabled = !on; });
    },
    shake() {
      form.classList.remove('shake');
      void form.offsetWidth;
      form.classList.add('shake');
    },
    height() { return form.getBoundingClientRect().height + 24; },
    destroy() { form.remove(); },
  };
}

/** Countdown clock for a round, with time penalties. */
export function createRoundClock(totalSec) {
  return {
    total: totalSec,
    left: totalSec,
    tick(dt) { this.left = Math.max(0, this.left - dt); },
    penalize(sec) { this.left = Math.max(0, this.left - sec); },
    get expired() { return this.left <= 0; },
  };
}
