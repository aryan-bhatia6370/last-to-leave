// 3D object drawing shared by the throwing games: boxes (the eraser),
// rods (markers, standing or lying or flying), and the red solo cup.
import { add, sub, mul, dot, cross, norm, len } from './vec3.js';
import { fillPoly } from './scene3d.js';
import { drawMarker } from './marker.js';
import { shade } from './colors.js';

const LIGHT = norm([0.35, 0.85, -0.4]);

/**
 * Draw a box. axes = [ax, ay, az] unit vectors, half = [hx, hy, hz] half sizes.
 * colorFor(axisIndex, sign) returns a face's base color.
 */
export function drawBox(ctx, cam, c, axes, half, colorFor) {
  const faces = [];
  for (let i = 0; i < 3; i++) {
    for (const s of [1, -1]) {
      const nrm = mul(axes[i], s);
      const fc = add(c, mul(nrm, half[i]));
      if (dot(nrm, mul(fc, -1)) <= 0) continue; // facing away from the camera
      const j = (i + 1) % 3, k = (i + 2) % 3;
      const a = mul(axes[j], half[j]);
      const b = mul(axes[k], half[k]);
      const pts = [add(add(fc, a), b), add(sub(fc, a), b), sub(sub(fc, a), b), sub(add(fc, a), b)];
      if (pts.some((p) => p[2] < 0.08)) return;
      const light = 0.55 + 0.45 * Math.max(0, dot(nrm, LIGHT));
      faces.push({ pts: pts.map((p) => cam.project(p)), color: shade(colorFor(i, s), (light - 0.8) * 0.7) });
    }
  }
  for (const f of faces) fillPoly(ctx, f.pts, f.color, 'rgba(0,0,0,0.35)', 0.8);
}

/**
 * The classic yellow-and-black whiteboard eraser: black felt pad under a
 * yellow handle with a black label stripe. pose = { p, r, u, n }:
 * r runs along its length, u points out of the handle (up when it's lying felt-down).
 */
export function drawEraser(ctx, cam, pose, spec) {
  const { length, width, feltH, handleH } = spec;
  const H = feltH + handleH;
  const axes = [pose.r, pose.u, pose.n];
  const feltC = add(pose.p, mul(pose.u, -H / 2 + feltH / 2));
  const handleC = add(pose.p, mul(pose.u, H / 2 - handleH / 2));
  const parts = [
    { c: feltC, half: [length / 2, feltH / 2, width / 2], color: () => '#2b2b30' },
    { c: handleC, half: [length / 2 - 0.003, handleH / 2, width / 2 - 0.002], color: () => '#f2c230' },
  ];
  parts.sort((a, b) => len(b.c) - len(a.c));
  for (const part of parts) drawBox(ctx, cam, part.c, axes, part.half, part.color);

  // black label band across the top of the handle
  const top = add(handleC, mul(pose.u, handleH / 2 + 0.0005));
  if (dot(pose.u, mul(top, -1)) > 0) {
    const a = mul(pose.r, length * 0.17);
    const b = mul(pose.n, width / 2 - 0.004);
    const pts = [add(add(top, a), b), add(sub(top, a), b), sub(sub(top, a), b), sub(add(top, a), b)];
    if (pts.every((p) => p[2] > 0.08)) fillPoly(ctx, pts.map((p) => cam.project(p)), '#1f1f22');
  }
}

/** A marker drawn between two world points. capEnd is the cap end. */
export function drawRodMarker(ctx, cam, backEnd, capEnd, hex, widthM, opts = {}) {
  if (backEnd[2] < 0.1 || capEnd[2] < 0.1) return;
  const A = cam.project(capEnd);
  const B = cam.project(backEnd);
  const s = (A.s + B.s) / 2;
  drawMarker(ctx, (A.x + B.x) / 2, (A.y + B.y) / 2, Math.hypot(A.x - B.x, A.y - B.y), Math.atan2(A.y - B.y, A.x - B.x), hex, {
    width: widthM * s,
    ...opts,
  });
}

/** Soft shadow ellipse on the floor under a point. */
export function drawFloorShadow(ctx, cam, x, floorY, z, radiusM, alpha = 0.18) {
  const fp = cam.project([x, floorY, z]);
  ctx.fillStyle = `rgba(40,30,15,${alpha.toFixed(3)})`;
  ctx.beginPath();
  ctx.ellipse(fp.x, fp.y, radiusM * fp.s, radiusM * 0.3 * fp.s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const crossZ = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossZ(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossZ(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

/**
 * Red solo cup. base = bottom center [x, y, z]. axis = which way is "up" for
 * the cup (tilt it for sloshing); defaults to straight up.
 * Returns { hull, opening, rim } (projected outlines + rim center) so markers inside can be clipped.
 */
export function drawCup(ctx, cam, base, { rimRadius, bottomRadius, height, axis = [0, 1, 0], shadowY = null }) {
  const N = 32;
  const a = norm(axis);
  const e1 = norm(cross(a, [0, 0, 1]));
  const e2 = cross(a, e1);
  const pointAt = (r, h, ang) => add(add(base, mul(a, h)), add(mul(e1, Math.cos(ang) * r), mul(e2, Math.sin(ang) * r)));
  const ring = (r, h) => {
    const out = [];
    for (let i = 0; i < N; i++) out.push(cam.project(pointAt(r, h, (i / N) * Math.PI * 2)));
    return out;
  };
  const bot = ring(bottomRadius, 0);
  const top = ring(rimRadius, height);
  const hull = convexHull(bot.concat(top));

  if (shadowY !== null) drawFloorShadow(ctx, cam, base[0], shadowY, base[2] + 0.01, rimRadius * 1.3, 0.2);

  // body: red with a bright stripe down the middle
  const xs = hull.map((p) => p.x);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const g = ctx.createLinearGradient(minX, 0, maxX, 0);
  g.addColorStop(0, '#8e1414');
  g.addColorStop(0.35, '#e0262b');
  g.addColorStop(0.5, '#f24a4a');
  g.addColorStop(0.7, '#cf1f24');
  g.addColorStop(1, '#7a1010');
  fillPoly(ctx, hull, g, 'rgba(60,0,0,0.5)', 1);

  // the ridges (only the side facing you)
  const center = add(base, mul(a, height / 2));
  const toCam = norm(mul(center, -1));
  ctx.save();
  ctx.strokeStyle = 'rgba(80,0,0,0.35)';
  ctx.lineWidth = 1;
  for (const f of [0.22, 0.62, 0.86]) {
    const r = bottomRadius + (rimRadius - bottomRadius) * f;
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i <= N; i++) {
      const ang = (i / N) * Math.PI * 2;
      const facing = dot(add(mul(e1, Math.cos(ang)), mul(e2, Math.sin(ang))), toCam) > 0;
      if (!facing) { drawing = false; continue; }
      const p = cam.project(pointAt(r, height * f, ang));
      if (!drawing) { ctx.moveTo(p.x, p.y); drawing = true; } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.restore();

  // the opening: white inside, darker toward the near rim
  const ys = top.map((p) => p.y);
  const og = ctx.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  og.addColorStop(0, '#f7f1ee');
  og.addColorStop(1, '#c9bcb7');
  fillPoly(ctx, top, og);
  ctx.save();
  ctx.lineJoin = 'round';
  fillPoly(ctx, top, null, '#fbf7f5', Math.max(1.5, rimRadius * 0.12 * top[0].s));
  fillPoly(ctx, top, null, 'rgba(90,20,20,0.35)', 0.8);
  ctx.restore();

  return { hull, opening: top, rim: add(base, mul(a, height)) };
}

/** Clip so only what's outside the cup body, or inside its opening, gets drawn. */
export function clipToCupOpening(ctx, cam, cupShape) {
  ctx.beginPath();
  ctx.rect(0, 0, cam.W, cam.H);
  const addPath = (pts) => {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
  };
  addPath(cupShape.hull);
  addPath(cupShape.opening);
  ctx.clip('evenodd');
}
