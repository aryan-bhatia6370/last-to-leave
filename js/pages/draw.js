// Drawing board (#/draw): draw your own Pictionary prompts.
// Drawings are saved on this device (Pictionary's "My drawings" option uses
// them) and can be copied as code to add to js/games/pictionary/drawings.js.
import { loadMyDrawings, saveMyDrawings, toPolylines } from '../games/pictionary/drawings.js';
import { escapeHtml } from '../core/env.js';

export function renderDraw(outlet) {
  outlet.innerHTML = `
    <main class="page draw-page">
      <nav class="topbar">
        <a class="btn btn-small" href="#/">← Menu</a>
        <a class="btn btn-small btn-ghost" href="#/play/pictionary">Play Pictionary</a>
      </nav>
      <section class="board">
        <h1>Drawing Board</h1>
        <p class="tagline" style="margin-top:0">Draw a Pictionary prompt the way you would on the real whiteboard: quick and bad. It gets replayed stroke by stroke, so draw in the order you'd actually draw it.</p>
        <div class="draw-layout">
          <div>
            <div class="draw-surface"><canvas aria-label="Drawing area"></canvas></div>
            <div class="draw-tools">
              <button class="btn btn-small" data-undo>Undo</button>
              <button class="btn btn-small" data-clear>Clear</button>
            </div>
          </div>
          <div>
            <label class="field"><span>What is it?</span><input data-answer maxlength="30" placeholder="e.g. paper airplane"></label>
            <label class="field"><span>Also accept</span><small>Other answers that should count, separated by commas.</small><input data-accept maxlength="120" placeholder="e.g. airplane, plane"></label>
            <button class="btn btn-primary" data-save>Save drawing</button>
            <p class="status-line" data-status></p>
            <h2 style="margin-top:18px">My drawings</h2>
            <ul class="saved-list" data-list></ul>
            <button class="btn btn-small" data-copy>Copy all as code</button>
            <p class="muted" style="font-size:.95rem">Turn on <strong>My drawings</strong> in Pictionary to play with these. They're saved on this device only.</p>
          </div>
        </div>
      </section>
    </main>`;

  const canvas = outlet.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const answerEl = outlet.querySelector('[data-answer]');
  const acceptEl = outlet.querySelector('[data-accept]');
  const statusEl = outlet.querySelector('[data-status]');
  const listEl = outlet.querySelector('[data-list]');
  let strokes = []; // each: [[x, y], ...] in 0–100 units
  let current = null;

  function fit() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  }

  function redraw() {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    const s = r.width / 100;
    ctx.strokeStyle = '#1f1f22';
    ctx.lineWidth = Math.max(2, 0.9 * s);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of strokes.concat(current ? [current] : [])) {
      ctx.beginPath();
      st.forEach(([x, y], i) => (i ? ctx.lineTo(x * s, y * s) : ctx.moveTo(x * s, y * s)));
      if (st.length === 1) ctx.lineTo(st[0][0] * s + 0.1, st[0][1] * s);
      ctx.stroke();
    }
  }

  const toUnits = (e) => {
    const r = canvas.getBoundingClientRect();
    const round = (v) => Math.round(Math.max(0, Math.min(100, v)) * 10) / 10;
    return [round(((e.clientX - r.left) / r.width) * 100), round(((e.clientY - r.top) / r.height) * 100)];
  };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    current = [toUnits(e)];
    redraw();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!current) return;
    const p = toUnits(e);
    const last = current[current.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.8) { current.push(p); redraw(); }
  });
  const finish = () => {
    if (!current) return;
    strokes.push(current);
    current = null;
    redraw();
  };
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);

  outlet.querySelector('[data-undo]').addEventListener('click', () => { strokes.pop(); redraw(); });
  outlet.querySelector('[data-clear]').addEventListener('click', () => { strokes = []; redraw(); });

  function say(msg, bad = false) {
    statusEl.textContent = msg;
    statusEl.style.color = bad ? 'var(--m-red)' : 'var(--m-green)';
  }

  function renderList() {
    const list = loadMyDrawings();
    listEl.innerHTML = list.length
      ? list.map((d, i) => `<li><span><strong>${escapeHtml(d.answer)}</strong> <span class="muted">${d.strokes.length} strokes</span></span><button class="btn btn-small btn-danger" data-del="${i}">Delete</button></li>`).join('')
      : '<li class="muted">None yet.</li>';
    listEl.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const all = loadMyDrawings();
      all.splice(Number(b.dataset.del), 1);
      saveMyDrawings(all);
      renderList();
    }));
  }

  outlet.querySelector('[data-save]').addEventListener('click', () => {
    const answer = answerEl.value.trim();
    if (!strokes.length) return say('Draw something first.', true);
    if (!answer) return say('Type what it is first.', true);
    const accept = acceptEl.value.split(',').map((s) => s.trim()).filter(Boolean);
    const all = loadMyDrawings();
    all.push({ answer, accept, strokes, createdAt: new Date().toISOString() });
    if (!saveMyDrawings(all)) return say("Couldn't save (storage is full or blocked).", true);
    strokes = [];
    answerEl.value = '';
    acceptEl.value = '';
    redraw();
    renderList();
    say(`Saved "${answer}"!`);
  });

  outlet.querySelector('[data-copy]').addEventListener('click', async () => {
    const list = loadMyDrawings();
    if (!list.length) return say('No drawings to copy yet.', true);
    const code = list.map((d) => `  ${JSON.stringify({ answer: d.answer, accept: d.accept, strokes: d.strokes })},`).join('\n');
    try {
      await navigator.clipboard.writeText(code);
      say('Copied! Paste it into the DRAWINGS list in js/games/pictionary/drawings.js.');
    } catch {
      say("Couldn't copy automatically.", true);
    }
  });

  const ro = new ResizeObserver(fit);
  ro.observe(canvas);
  renderList();
  void toPolylines; // (kept for parity with Pictionary's loader)
  return () => ro.disconnect();
}
