// Live spectating: the player's game state is sent ~10x a second; watchers
// redraw the same game from it, smoothly blended between updates.
// Games keep everything they draw in one plain `st` object, so any game can be
// mirrored by copying `st` (see each game's `options.spectate` hook).

export const MIRROR = { hz: 8, delayMs: 260, buffer: 40 }; // 8/s keeps the player's own game smooth

const round4 = (_k, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v);
/** JSON text (kept as a string: the database drops empty arrays and nulls). */
export const encodeState = (st) => JSON.stringify(st, round4);

function blend(a, b, t) {
  if (typeof a === 'number' && typeof b === 'number') return Number.isInteger(a) && Number.isInteger(b) ? b : a + (b - a) * t;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length ? b.map((x, i) => blend(a[i], x, t)) : b;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const o = {};
    for (const k of Object.keys(b)) o[k] = k in a ? blend(a[k], b[k], t) : b[k];
    return o;
  }
  return b;
}

/** Watcher side: push(frame) as frames arrive, frame() each animation frame. */
export function createReceiver() {
  const buf = [];
  let offset = null; // local clock - sender clock (smallest seen = least delayed frame)
  return {
    push(f) {
      if (!f || typeof f.j !== 'string') return;
      if (buf.length && f.ts <= buf[buf.length - 1].ts) return;
      const off = performance.now() - f.ts;
      offset = offset == null ? off : Math.min(offset, off);
      buf.push({ ts: f.ts, s: JSON.parse(f.j) });
      if (buf.length > MIRROR.buffer) buf.shift();
    },
    frame() {
      if (!buf.length) return null;
      const at = performance.now() - offset - MIRROR.delayMs;
      const i = buf.findIndex((f) => f.ts > at);
      if (i === -1) return buf[buf.length - 1].s;
      if (i === 0) return buf[0].s;
      const a = buf[i - 1], b = buf[i];
      return blend(a.s, b.s, (at - a.ts) / (b.ts - a.ts));
    },
    get hasFrames() { return buf.length > 0; },
  };
}

/** Player side: send the state on a timer. Returns stop(). */
export function startPublisher(getState, write) {
  const t0 = performance.now();
  let last = '';
  let busy = false;
  const id = setInterval(() => {
    if (busy) return; // previous send still going: skip a beat rather than pile up
    const st = getState();
    if (!st) return;
    const j = encodeState(st);
    if (j === last) return; // nothing moved
    last = j;
    busy = true;
    Promise.resolve(write({ ts: Math.round(performance.now() - t0), j })).finally(() => { busy = false; });
  }, 1000 / MIRROR.hz);
  return () => clearInterval(id);
}
