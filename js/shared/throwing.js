// Shared flick-to-throw engine used by Archery, Bowling and Cup Throwing.
//
// The player presses, drags and releases. The speed of the drag in the
// moment before release is the throw's momentum:
//   - how fast you flick upward  -> how hard you throw (distance)
//   - which way the flick points -> left/right aim
// Every number is passed in from the game's config.js.

import { clamp, add, mul, len, norm, cross, rotateAround, lerp3 } from './vec3.js';
import { attachPointer } from '../core/input.js';

/**
 * Press-drag-flick control for throwing games. The held object follows your
 * finger/mouse a little while you drag, and a flick on release throws it.
 * opts: { canvas, cfg (game's throw config), getCam, canThrow(), onThrow(fl), onWeak() }
 */
export function createThrowControl({ canvas, cfg, getCam, canThrow, onThrow, onWeak }) {
  const flick = createFlickTracker(cfg.sampleMs);
  const held = { dragging: false, start: null, cur: null };
  const detach = attachPointer(canvas, {
    down(p) {
      if (!canThrow()) return;
      flick.begin(p);
      held.dragging = true;
      held.start = p;
      held.cur = p;
    },
    move(p) {
      if (!p || !held.dragging) return;
      flick.move(p);
      held.cur = p;
    },
    up(p) {
      if (!held.dragging) return;
      held.dragging = false;
      const f = flick.end(p);
      if (!canThrow()) return;
      const fl = flickToVelocity(f, getCam().H, cfg);
      if (fl) onThrow(fl); else onWeak?.();
    },
  });
  return {
    held,
    /** Where the held object should be this frame (base = its resting spot in your hand). */
    heldPos(base, current, dt, maxLift = 0.2) {
      const cam = getCam();
      if (held.dragging && held.cur) {
        const z = base[2];
        const dx = held.cur.x - held.start.x;
        const dy = held.cur.y - held.start.y;
        return [
          clamp(base[0] + (dx * z) / cam.f, -0.35, 0.35),
          clamp(base[1] - (dy * z) / cam.f, base[1] - 0.12, base[1] + maxLift),
          z,
        ];
      }
      return lerp3(current, base, Math.min(1, dt * 12));
    },
    cancel() { held.dragging = false; flick.cancel(); },
    destroy: detach,
  };
}

export function createFlickTracker(sampleMs = 90) {
  let samples = [];
  let start = null;
  let active = false;
  return {
    get active() { return active; },
    begin(p) {
      const t = performance.now();
      active = true;
      start = { x: p.x, y: p.y, t };
      samples = [start];
    },
    move(p) {
      if (!active) return;
      const t = performance.now();
      samples.push({ x: p.x, y: p.y, t });
      while (samples.length > 2 && t - samples[0].t > 300) samples.shift();
    },
    cancel() { active = false; },
    /** Returns { vx, vy (px/s, screen coords), dx, dy (total drag px), ms } */
    end(p) {
      if (!active) return null;
      active = false;
      const t = performance.now();
      samples.push({ x: p.x, y: p.y, t });
      let i = samples.length - 1;
      while (i > 0 && t - samples[i - 1].t <= sampleMs) i--;
      if (i === samples.length - 1 && i > 0) i--;
      const a = samples[i];
      const b = samples[samples.length - 1];
      const dt = Math.max((b.t - a.t) / 1000, 1 / 240);
      return { vx: (b.x - a.x) / dt, vy: (b.y - a.y) / dt, dx: b.x - start.x, dy: b.y - start.y, ms: t - start.t };
    },
  };
}

/**
 * Turn a flick into a 3D launch velocity, or null if it was too weak.
 * cfg: { minUpSpeed, minDragFrac, powerScale, powerExp, minSpeed, maxSpeed, aimGain, elevationDeg }
 * Power is measured in screen-heights per second, so it feels the same on any screen.
 */
export function flickToVelocity(f, screenH, cfg) {
  if (!f) return null;
  const upH = -f.vy / screenH;
  if (upH < cfg.minUpSpeed || -f.dy < cfg.minDragFrac * screenH) return null;
  const speed = clamp(cfg.powerScale * Math.pow(upH, cfg.powerExp), cfg.minSpeed, cfg.maxSpeed);
  const yawTan = clamp((f.vx / -f.vy) * cfg.aimGain, -0.9, 0.9);
  const el = (cfg.elevationDeg * Math.PI) / 180;
  const horiz = speed * Math.cos(el);
  const L = Math.hypot(1, yawTan);
  return { v: [(horiz * yawTan) / L, speed * Math.sin(el), horiz / L], speed, upH, yawTan };
}

/**
 * Advance a body one small step: gravity + air drag toward the wind.
 * body: { p, v } ; opts: { gravity, drag, wind:[x,y,z] }
 */
export function stepBody(body, h, { gravity, drag, wind = [0, 0, 0] }) {
  const v = body.v;
  body.v = [
    v[0] + drag * (wind[0] - v[0]) * h,
    v[1] + (-gravity + drag * (wind[1] - v[1])) * h,
    v[2] + drag * (wind[2] - v[2]) * h,
  ];
  body.p = add(body.p, mul(body.v, h));
}

/**
 * Spin an orientation basis { r, u, n } by angular velocity w (rad/s vector).
 * Keeps the basis orthonormal. n = cross(u, r) (faces the camera when r=+x, u=+y).
 */
export function spinBasis(b, w, h) {
  const wl = len(w);
  if (wl > 1e-4) {
    const ax = mul(w, 1 / wl);
    const a = wl * h;
    b.r = rotateAround(b.r, ax, a);
    b.u = rotateAround(b.u, ax, a);
  }
  b.r = norm(b.r);
  b.n = norm(cross(b.u, b.r));
  b.u = norm(cross(b.r, b.n));
}
