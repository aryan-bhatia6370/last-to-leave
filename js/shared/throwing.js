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
      const fl = flickToVelocity(withReleasePoint(f, p), getCam().H, cfg, getCam());
      if (fl) onThrow(fl); else onWeak?.();
    },
  });
  return {
    held,
    /** Where the held object should be this frame (base = its resting spot in your hand). */
    heldPos(base, current, dt, maxLift = 0.2) {
      return heldFollow(getCam(), base, current, held, dt, maxLift);
    },
    cancel() { held.dragging = false; flick.cancel(); },
    destroy: detach,
  };
}

// On touch screens the object sits a little above your finger so you can see it.
export const TOUCH_LIFT_PX = 50;
const liftFor = (p) => (p?.type === 'touch' ? TOUCH_LIFT_PX : 0);

/**
 * While you hold the button/finger down, the object goes to where you're
 * pointing (anywhere in a wide area at hand depth), so you can throw from any
 * spot. Let go of a drag without a flick and it drifts back to your hand.
 */
export function heldFollow(cam, base, current, held, dt, maxLift = 0.2) {
  if (held.dragging && held.cur) {
    const z = base[2];
    const halfW = cam.halfWidthAt(z) * 0.88;
    const target = [
      clamp(((held.cur.x - cam.cx) * z) / cam.f, -halfW, halfW),
      clamp(((cam.cy - (held.cur.y - liftFor(held.cur))) * z) / cam.f, base[1] - 0.2, base[1] + maxLift * 1.6),
      z,
    ];
    return lerp3(current, target, Math.min(1, dt * 28));
  }
  return lerp3(current, base, Math.min(1, dt * 12));
}

/** Add where the object was let go (screen px) to a flick, for perspective aiming. */
export function withReleasePoint(f, p) {
  return f && p ? { ...f, hx: p.x, hy: p.y - liftFor(p) } : f;
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
export function flickToVelocity(f, screenH, cfg, cam = null) {
  if (!f) return null;
  const upH = -f.vy / screenH;
  if (upH < cfg.minUpSpeed || -f.dy < cfg.minDragFrac * screenH) return null;
  const speed = clamp(cfg.powerScale * Math.pow(upH, cfg.powerExp), cfg.minSpeed, cfg.maxSpeed);
  let yawTan;
  if (cam && f.hx != null) {
    // Aim where the flick points on screen: follow the flick's line from where you let
    // go up to the horizon; the throw heads toward that spot (so a straight-up flick
    // from the far left goes up the left side, like it looks like it should).
    const xh = f.hx + (f.hy - cam.cy) * (f.vx / -f.vy) * (cfg.aimGain / 0.5);
    yawTan = clamp((xh - cam.cx) / cam.f, -0.9, 0.9);
  } else {
    yawTan = clamp((f.vx / -f.vy) * cfg.aimGain, -0.9, 0.9);
  }
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

/**
 * Thrown things bounce off Paul instead of passing through him. He's a rough
 * upright capsule (narrower at the head). body: { p, v } in game coords.
 * paul: { x, z, floorY }. Returns true if it hit him this step.
 */
export const PAUL_BODY = { radius: 0.19, headRadius: 0.11, headFrom: 1.5, height: 1.8, restitution: 0.3 };
export function bounceOffPaul(b, paul) {
  const h = b.p[1] - paul.floorY;
  if (h < 0 || h > PAUL_BODY.height) return false;
  const r = h > PAUL_BODY.headFrom ? PAUL_BODY.headRadius : PAUL_BODY.radius;
  const dx = b.p[0] - paul.x, dz = b.p[2] - paul.z;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  const n = d > 1e-4 ? [dx / d, 0, dz / d] : [0, 0, -1];
  b.p = [paul.x + n[0] * (r + 0.004), b.p[1], paul.z + n[2] * (r + 0.004)];
  const vn = b.v[0] * n[0] + b.v[2] * n[2];
  if (vn < 0) {
    const k = 1 + PAUL_BODY.restitution;
    b.v = [b.v[0] - k * vn * n[0], b.v[1] * 0.6, b.v[2] - k * vn * n[2]];
  }
  return true;
}

/**
 * How far left/right (as a fraction of depth) is visible on ANY screen, phone
 * or PC. Targets are placed inside this so everyone gets the same spots in
 * online/Competition games, whatever their screen shape.
 */
export const SAFE_HALF_WIDTH = 0.38;
