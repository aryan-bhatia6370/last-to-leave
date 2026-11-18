// Shared look for the whiteboard games (Equations, Pictionary): a classroom
// wall, one big whiteboard, a countdown clock and round markers.
import { drawBoard, drawTray, roundRectPath } from './whiteboard.js';
import { drawLabel, drawBadge, MARKER_FONT } from './hud.js';
import { createRng } from '../core/rng.js';

export function renderWall(size) {
  const c = document.createElement('canvas');
  c.width = Math.round(size.w * size.dpr);
  c.height = Math.round(size.h * size.dpr);
  const g = c.getContext('2d');
  g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
  const gr = g.createLinearGradient(0, 0, 0, size.h);
  gr.addColorStop(0, '#ebe4d4');
  gr.addColorStop(1, '#d4cab4');
  g.fillStyle = gr;
  g.fillRect(0, 0, size.w, size.h);
  const vg = g.createRadialGradient(size.w / 2, size.h * 0.45, Math.min(size.w, size.h) * 0.3, size.w / 2, size.h * 0.45, Math.max(size.w, size.h) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(40,30,10,0.16)');
  g.fillStyle = vg;
  g.fillRect(0, 0, size.w, size.h);
  return c;
}

/** Biggest board (aspect w/h) that fits between the HUD at the top and the answer bar at the bottom. */
export function boardRect(size, { top = 84, bottom = 96, aspect = 4 / 3, side = 16 } = {}) {
  const availW = size.w - side * 2;
  const availH = size.h - top - bottom;
  let w = Math.min(availW, availH * aspect, 980);
  let h = w / aspect;
  return { x: (size.w - w) / 2, y: top + (availH - h) / 2, w, h };
}

const ghostRng = () => createRng(23);

/** The whiteboard (with tray). Returns the writing surface rect. */
export function drawWhiteboard(ctx, r) {
  const surf = drawBoard(ctx, r.x, r.y, r.w, r.h, { frame: Math.max(6, r.w * 0.018), rng: ghostRng() });
  drawTray(ctx, r.x + r.w * 0.06, r.y + r.h - 2, r.w * 0.88, Math.max(8, r.h * 0.03));
  return surf;
}

/** Countdown in the top-right: big seconds + a shrinking bar. */
export function drawClock(ctx, size, left, total, flash = 0) {
  const pad = Math.max(14, Math.min(size.w, size.h) * 0.025);
  const secs = Math.ceil(left);
  const low = left <= 10;
  const color = low ? '#ff5a6e' : '#1f1f22';
  const fs = Math.round(Math.min(56, Math.max(30, size.h * 0.065)));
  const right = size.w - pad - 56; // leave room for the pause button
  drawLabel(ctx, 'TIME', right, pad + fs * 0.42, Math.round(fs * 0.42), '#565a62', 'right');
  ctx.save();
  if (flash > 0) {
    const s = 1 + flash * 0.25;
    ctx.translate(right, pad + fs * 1.3);
    ctx.scale(s, s);
    ctx.translate(-right, -(pad + fs * 1.3));
  }
  drawLabel(ctx, `${secs}`, right, pad + fs * 1.4, fs, color, 'right');
  ctx.restore();
  const bw = Math.min(160, size.w * 0.3);
  const by = pad + fs * 1.65;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRectPath(ctx, right - bw, by, bw, 8, 4);
  ctx.fill();
  ctx.fillStyle = low ? '#ff5a6e' : '#ffffff';
  roundRectPath(ctx, right - bw, by, bw * Math.max(0, left / total), 8, 4);
  ctx.fill();
  ctx.restore();
}

/** Score + round markers in the top-left. results: array of 'win' | 'lose'. */
export function drawRounds(ctx, size, label, solved, rounds, results, current) {
  const pad = Math.max(14, Math.min(size.w, size.h) * 0.025);
  const fs = Math.round(Math.min(56, Math.max(30, size.h * 0.065)));
  drawLabel(ctx, label, pad, pad + fs * 0.42, Math.round(fs * 0.42), '#565a62');
  drawLabel(ctx, `${solved} / ${rounds}`, pad, pad + fs * 1.4, fs, '#1f1f22');
  const r = Math.max(9, fs * 0.2);
  for (let i = 0; i < rounds; i++) {
    const x = pad + r + i * r * 2.6;
    const y = pad + fs * 1.65 + r;
    if (results[i]) drawBadge(ctx, x, y, r, results[i] === 'win');
    else {
      ctx.save();
      ctx.strokeStyle = i === current ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export { MARKER_FONT };
