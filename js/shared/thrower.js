// Paul, across the room, throwing markers at you (Marker Catching,
// Cup Catching). The figure itself is drawn by shared/paul.js.
//
// A thrower state is { x, z, fromX, fromZ, toX, toZ, walk, moving, hand }.

import { add, sub, norm, lerp, lerp3, clamp, easeInOut, easeIn } from './vec3.js';
import { drawPaul } from './paul.js';

// Hand positions relative to the thrower's feet (x, z). y is world height.
export const THROW_STYLES = {
  overhand: { back: [0.32, 0.62, 0.28], release: [0.24, 0.5, -0.38], follow: [0.02, -0.15, -0.4] },
  sidearm: { back: [0.64, 0.08, 0.22], release: [0.42, 0.12, -0.38], follow: [-0.22, 0.02, -0.3] },
  underhand: { back: [0.3, -0.58, 0.3], release: [0.22, -0.28, -0.38], follow: [0.16, 0.38, -0.3] },
};

export function createThrowerState(z) {
  return { x: 0, z, fromX: 0, fromZ: z, toX: 0, toZ: z, walk: 0, moving: 0, hand: [0.27, -0.1, z - 0.15] };
}

export function restHand(t, time) {
  return [t.x + 0.27, -0.1 + Math.sin(time * 2.2) * 0.015, t.z - 0.15];
}

export function styleHand(t, style, key) {
  const o = THROW_STYLES[style][key];
  return [t.x + o[0], o[1], t.z + o[2]];
}

/** Wind-up path: rest -> back -> release, k in 0..1. */
export function windupHand(t, style, k, time) {
  const rest = restHand(t, time);
  const back = styleHand(t, style, 'back');
  const rel = styleHand(t, style, 'release');
  if (k < 0.6) return lerp3(rest, back, easeInOut(k / 0.6));
  return lerp3(back, rel, easeIn((k - 0.6) / 0.4));
}

/** Which way a marker held in the throwing hand points. */
export function heldOrientation(t) {
  const shoulder = [t.x + 0.19, 0.3, t.z];
  const d = norm(sub(t.hand, shoulder));
  return norm([-d[1], d[0], 0.35]);
}

/** Walk from (fromX, fromZ) to (toX, toZ); k in 0..1 is how far along the walk is. */
export function walkThrower(t, k, dt, time) {
  const e = easeInOut(k);
  t.x = lerp(t.fromX, t.toX, e);
  t.z = lerp(t.fromZ, t.toZ, e);
  const moving = Math.abs(t.toX - t.fromX) + Math.abs(t.toZ - t.fromZ) > 0.05 && k < 1;
  t.moving = lerp(t.moving, moving ? 1 : 0, Math.min(1, dt * 10));
  t.walk += dt * 11 * t.moving;
  t.hand = restHand(t, time);
}

/**
 * Solve a throw from p0 that reaches `target` after T seconds, with an arc
 * that rises `rise` meters above the straight line (rise = g*T^2/8). If the
 * arc would leave the top of the screen, flatten it. Returns { g, v }.
 */
export function solveThrow(p0, target, T, rise, cam, topLimitPx) {
  let g = 0;
  let v = null;
  for (let i = 0; i < 6; i++) {
    g = (8 * rise) / (T * T);
    v = [(target[0] - p0[0]) / T, (target[1] - p0[1]) / T + 0.5 * g * T, (target[2] - p0[2]) / T];
    let minY = Infinity;
    for (let k = 1; k <= 24; k++) {
      const t = (k / 24) * T;
      const y = cam.project([p0[0] + v[0] * t, p0[1] + v[1] * t - 0.5 * g * t * t, p0[2] + v[2] * t]).y;
      minY = Math.min(minY, y);
    }
    if (minY >= topLimitPx) break;
    rise *= 0.65;
  }
  return { g, v };
}

export function throwPosition(p0, v, g, t) {
  return [p0[0] + v[0] * t, p0[1] + v[1] * t - 0.5 * g * t * t, p0[2] + v[2] * t];
}


/** Paul throwing. His throwing hand is t.hand (his +x side). */
export function drawThrower(ctx, cam, t, floorY) {
  drawPaul(ctx, cam, { x: t.x, z: t.z, floorY, yaw: 0, walk: t.walk, moving: t.moving, rightHand: t.hand });
}

/** Pick the thrower's next spot: random depth, and left/right within what's visible. */
export function planThrowerMove(t, rng, cam, zRange, spreadX) {
  t.fromX = t.x;
  t.fromZ = t.z;
  t.toZ = rng.range(zRange);
  const halfWidthAt = ((cam.W / 2) / cam.f) * t.toZ;
  t.toX = clamp(rng.range(-1, 1) * spreadX * halfWidthAt * 0.8, -2.2, 2.2);
}
