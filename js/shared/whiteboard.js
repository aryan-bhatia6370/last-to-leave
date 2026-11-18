// Canvas drawing for whiteboards and the aluminum marker tray.

export function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Whiteboard with an aluminum frame and faint ghosting from old erasings.
 * Returns the inner writing-surface rect.
 */
export function drawBoard(ctx, x, y, w, h, { frame, rng } = {}) {
  frame = frame ?? Math.max(2, Math.min(w, h) * 0.035);
  const fg = ctx.createLinearGradient(x, y, x + w, y + h);
  fg.addColorStop(0, '#f3f4f6');
  fg.addColorStop(0.3, '#a6adb5');
  fg.addColorStop(0.55, '#eceef1');
  fg.addColorStop(1, '#7f868e');
  ctx.fillStyle = fg;
  roundRectPath(ctx, x, y, w, h, frame * 0.7);
  ctx.fill();

  const sx = x + frame, sy = y + frame, sw = w - frame * 2, sh = h - frame * 2;
  const sg = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
  sg.addColorStop(0, '#fdfdfb');
  sg.addColorStop(1, '#eef0ed');
  ctx.fillStyle = sg;
  ctx.fillRect(sx, sy, sw, sh);

  if (rng) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(sx, sy, sw, sh);
    ctx.clip();
    for (let i = 0; i < 6; i++) {
      const cx = sx + rng.next() * sw;
      const cy = sy + rng.next() * sh;
      const rx = sw * (0.12 + rng.next() * 0.2);
      const ry = sh * (0.06 + rng.next() * 0.12);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(125,135,160,0.09)');
      g.addColorStop(1, 'rgba(125,135,160,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx + 0.5, sy + 0.5, sw - 1, sh - 1);
  return { x: sx, y: sy, w: sw, h: sh };
}

/** Aluminum marker tray (a ledge with a channel the markers rest in). */
export function drawTray(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#f4f5f7');
  g.addColorStop(0.12, '#cfd3d8');
  g.addColorStop(0.5, '#b3b9c0');
  g.addColorStop(1, '#868d95');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);

  // the channel
  const cy = y + h * 0.2;
  const ch = h * 0.62;
  const c = ctx.createLinearGradient(0, cy, 0, cy + ch);
  c.addColorStop(0, 'rgba(0,0,0,0.16)');
  c.addColorStop(0.25, 'rgba(255,255,255,0.18)');
  c.addColorStop(1, 'rgba(0,0,0,0.06)');
  ctx.fillStyle = c;
  ctx.fillRect(x, cy, w, ch);

  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fillRect(x, y, w, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(x, y + h - 1, w, 1);
}
