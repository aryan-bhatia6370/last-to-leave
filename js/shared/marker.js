// The dry-erase marker, drawn the same way everywhere: light barrel with a
// colored label band and end plug, a colored cap with a clip. The cap end
// points toward +x (angle 0 = cap on the right).
import { shade } from './colors.js';
import { roundRectPath } from './whiteboard.js';

export const MARKER_SPEC = {
  widthFrac: 0.13,   // barrel thickness / length
  capFrac: 0.34,     // cap length / length
  capWiden: 1.12,    // cap is slightly fatter than the barrel
  plugFrac: 0.06,    // colored end plug
  bandStart: 0.3,    // label band position (from the back end)
  bandLen: 0.17,
};

/**
 * Draw a marker centered on (x, y).
 * @param length on-screen length in px
 * @param angle  radians; cap points along +angle
 * @param opts   { width (px, default from spec), alpha, shadow }
 */
export function drawMarker(ctx, x, y, length, angle, hex, opts = {}) {
  const S = MARKER_SPEC;
  const W = Math.max(1, opts.width ?? length * S.widthFrac);
  const L = Math.max(length, W * 1.15);
  const h = L / 2;
  const r = W / 2;
  const cr = r * S.capWiden;
  const capX = h - L * S.capFrac;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  if (opts.alpha != null) ctx.globalAlpha *= opts.alpha;

  if (opts.uncapped) {
    // cap off, felt tip showing at the +x end (for drawing on the board)
    const tip = W * 1.1;
    const barrelLen = L - tip;
    const bg = ctx.createLinearGradient(0, -r, 0, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(0.45, '#eeefec');
    bg.addColorStop(1, '#b4b8b8');
    ctx.fillStyle = bg;
    roundRectPath(ctx, -h, -r, barrelLen, W, r * 0.7);
    ctx.fill();
    ctx.fillStyle = hex;
    ctx.fillRect(-h + L * S.bandStart, -r, L * S.bandLen, W);
    roundRectPath(ctx, -h, -r, L * S.plugFrac + r * 0.3, W, r * 0.7);
    ctx.fill();
    ctx.fillRect(-h + barrelLen - W * 0.35, -r * 1.02, W * 0.35, W * 1.04); // collar
    ctx.fillStyle = '#2a2a2e';
    ctx.beginPath();
    ctx.moveTo(-h + barrelLen, -r * 0.6);
    ctx.lineTo(h, -r * 0.18);
    ctx.lineTo(h, r * 0.18);
    ctx.lineTo(-h + barrelLen, r * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(0.6, W * 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    roundRectPath(ctx, -h, -r, barrelLen, W, r * 0.7);
    ctx.stroke();
    ctx.restore();
    return;
  }

  if (opts.shadow) {
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    roundRectPath(ctx, -h + W * 0.2, -r + W * 0.35, L, W, r);
    ctx.fill();
  }

  // Barrel
  const barrel = ctx.createLinearGradient(0, -r, 0, r);
  barrel.addColorStop(0, '#ffffff');
  barrel.addColorStop(0.45, '#eeefec');
  barrel.addColorStop(1, '#b4b8b8');
  ctx.fillStyle = barrel;
  roundRectPath(ctx, -h, -r, L - L * S.capFrac * 0.5, W, r * 0.7);
  ctx.fill();

  // Label band + end plug
  ctx.fillStyle = hex;
  ctx.fillRect(-h + L * S.bandStart, -r, L * S.bandLen, W);
  roundRectPath(ctx, -h, -r, L * S.plugFrac + r * 0.3, W, r * 0.7);
  ctx.fill();

  // Shade the barrel
  const shadeGrad = ctx.createLinearGradient(0, -r, 0, r);
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
  shadeGrad.addColorStop(0.35, 'rgba(255,255,255,0)');
  shadeGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(-h + L * S.plugFrac * 0.5, -r, L * S.bandStart + L * S.bandLen, W);

  // Cap
  const cap = ctx.createLinearGradient(0, -cr, 0, cr);
  cap.addColorStop(0, shade(hex, 0.35));
  cap.addColorStop(0.4, hex);
  cap.addColorStop(1, shade(hex, -0.35));
  ctx.fillStyle = cap;
  roundRectPath(ctx, capX, -cr, L * S.capFrac, cr * 2, cr * 0.9);
  ctx.fill();

  // Cap clip
  if (W > 3) {
    ctx.fillStyle = shade(hex, -0.3);
    roundRectPath(ctx, capX + L * S.capFrac * 0.1, -cr - W * 0.18, L * S.capFrac * 0.68, W * 0.28, W * 0.12);
    ctx.fill();
  }

  // Outline
  if (W > 2.5) {
    ctx.lineWidth = Math.max(0.6, W * 0.06);
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    roundRectPath(ctx, -h, -r, L - L * S.capFrac * 0.5, W, r * 0.7);
    ctx.stroke();
    roundRectPath(ctx, capX, -cr, L * S.capFrac, cr * 2, cr * 0.9);
    ctx.stroke();
  }

  ctx.restore();
}

let svgId = 0;
/** Same marker as an inline SVG string, for menus and DOM pages. */
export function markerSVG(hex, { length = 120, title = '' } = {}) {
  const S = MARKER_SPEC;
  const L = length;
  const W = L * S.widthFrac;
  const r = W / 2;
  const cr = r * S.capWiden;
  const pad = W * 0.35;
  const H = cr * 2 + pad * 2;
  const cy = H / 2;
  const capX = L - L * S.capFrac;
  const id = `mk${++svgId}`;
  const f = (n) => n.toFixed(2);
  return `<svg class="marker-svg" viewBox="0 0 ${f(L + 2)} ${f(H)}" width="${f(L + 2)}" height="${f(H)}" ${title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"'}>
    <defs>
      <linearGradient id="${id}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#eeefec"/><stop offset="1" stop-color="#b4b8b8"/></linearGradient>
      <linearGradient id="${id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(hex, 0.35)}"/><stop offset=".4" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.35)}"/></linearGradient>
    </defs>
    <rect x="1" y="${f(cy - r)}" width="${f(L - L * S.capFrac * 0.5)}" height="${f(W)}" rx="${f(r * 0.7)}" fill="url(#${id}b)" stroke="rgba(0,0,0,.3)" stroke-width="${f(Math.max(0.6, W * 0.06))}"/>
    <rect x="${f(1 + L * S.bandStart)}" y="${f(cy - r)}" width="${f(L * S.bandLen)}" height="${f(W)}" fill="${hex}"/>
    <rect x="1" y="${f(cy - r)}" width="${f(L * S.plugFrac + r * 0.3)}" height="${f(W)}" rx="${f(r * 0.7)}" fill="${hex}"/>
    <rect x="${f(capX)}" y="${f(cy - cr)}" width="${f(L * S.capFrac)}" height="${f(cr * 2)}" rx="${f(cr * 0.9)}" fill="url(#${id}c)" stroke="rgba(0,0,0,.3)" stroke-width="${f(Math.max(0.6, W * 0.06))}"/>
    <rect x="${f(capX + L * S.capFrac * 0.1)}" y="${f(cy - cr - W * 0.18)}" width="${f(L * S.capFrac * 0.68)}" height="${f(W * 0.28)}" rx="${f(W * 0.12)}" fill="${shade(hex, -0.3)}"/>
  </svg>`;
}
