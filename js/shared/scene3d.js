// Shared first-person 3D helpers: a perspective camera and a simple room
// (wall + tiled floor). The camera sits at the origin looking toward +z;
// x is right, y is up.

/**
 * @param size {w, h}
 * @param opts { fovYDeg, cyFrac (horizon height as a fraction of the play area),
 *               reserveBottom (px kept for a HUD strip), maxFocalW (zoom limit on narrow screens) }
 */
export function createCamera(size, { fovYDeg = 60, cyFrac = 0.45, reserveBottom = 0, maxFocalW = 1.3 } = {}) {
  const playH = size.h - reserveBottom;
  const fov = (fovYDeg * Math.PI) / 180;
  const f = Math.min(playH / 2 / Math.tan(fov / 2), size.w * maxFocalW);
  const cx = size.w / 2;
  const cy = playH * cyFrac;
  return {
    W: size.w,
    H: size.h,
    playH,
    f,
    cx,
    cy,
    project(p) {
      const z = Math.max(p[2], 0.05);
      return { x: cx + (f * p[0]) / z, y: cy - (f * p[1]) / z, s: f / z, z: p[2] };
    },
    unproject(sx, sy, z) {
      return [((sx - cx) * z) / f, ((cy - sy) * z) / f, z];
    },
    /** half the visible width (meters) at depth z */
    halfWidthAt(z) {
      return (size.w / 2 / f) * z;
    },
  };
}

/** Fill a polygon of already-projected points. */
export function fillPoly(ctx, pts, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

/** Projected thick line between two world points (width in meters). */
export function line3(ctx, cam, a, b, widthM, color) {
  const A = cam.project(a);
  const B = cam.project(b);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, widthM * (A.s + B.s) * 0.5);
  ctx.beginPath();
  ctx.moveTo(A.x, A.y);
  ctx.lineTo(B.x, B.y);
  ctx.stroke();
}

/**
 * Render a classroom-ish room to an offscreen canvas (cache it; redraw on resize).
 * @param opts { eyeHeight, backWallZ, wallTop, wallBottom, floorNear, floorFar }
 */
export function renderRoom(cam, size, {
  eyeHeight = 1.6,
  backWallZ = 10,
  wallTop = '#e9e2d2',
  wallBottom = '#d6ccb7',
  floorFar = '#cbc1ab',
  floorNear = '#b3a78d',
  tile = 0.6,
} = {}) {
  const c = document.createElement('canvas');
  c.width = Math.round(size.w * size.dpr);
  c.height = Math.round(size.h * size.dpr);
  const g = c.getContext('2d');
  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  const { w, h } = size;
  const floorY = -eyeHeight;
  const seam = cam.project([0, floorY, backWallZ]).y;

  let gr = g.createLinearGradient(0, 0, 0, seam);
  gr.addColorStop(0, wallTop);
  gr.addColorStop(1, wallBottom);
  g.fillStyle = gr;
  g.fillRect(0, 0, w, seam);

  const bbH = (cam.f * 0.1) / backWallZ;
  g.fillStyle = '#9a8b72';
  g.fillRect(0, seam - bbH, w, bbH);

  gr = g.createLinearGradient(0, seam, 0, h);
  gr.addColorStop(0, floorFar);
  gr.addColorStop(1, floorNear);
  g.fillStyle = gr;
  g.fillRect(0, seam, w, h - seam);

  g.save();
  g.beginPath();
  g.rect(0, seam, w, h - seam);
  g.clip();
  g.strokeStyle = 'rgba(70,58,35,0.12)';
  g.lineWidth = 1;
  g.beginPath();
  for (let x = -20; x <= 20; x += tile) {
    const a = cam.project([x, floorY, backWallZ]);
    const b = cam.project([x, floorY, 0.3]);
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
  }
  for (let z = tile; z < backWallZ; z += tile) {
    const y = cam.project([0, floorY, z]).y;
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();
  g.restore();

  const vg = g.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,30,10,0.18)');
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  return c;
}
