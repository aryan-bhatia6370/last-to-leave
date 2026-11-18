// Shared canvas HUD helpers: text, popups, badges, hints.
// On the in-game HUD canvas (class "game-canvas") text is drawn in a clean
// broadcast style (white, bold sans, soft shadow) to sit over the realistic 3D
// scenes. On anything else, like writing on a whiteboard texture, it stays
// handwritten marker.
export const MARKER_FONT = '"Permanent Marker", "Marker Felt", cursive';
export const HUD_FONT = '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif';

// dark "ink" colors from the old style -> light colors for the dark-scene HUD
const ON_DARK = { '#1f1f22': '#ffffff', '#565a62': 'rgba(255,255,255,0.78)', '#555a63': 'rgba(255,255,255,0.82)', '#8a8f98': 'rgba(255,255,255,0.7)', '#7a3fc4': '#c9a8ff' };

function brighten(hex) {
  if (typeof hex !== 'string' || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * 0.22);
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

export function isHudCanvas(ctx) {
  return !!ctx.canvas?.classList?.contains('game-canvas');
}

export function drawLabel(ctx, text, x, y, size, color, align = 'left', stroke = true) {
  if (isHudCanvas(ctx)) {
    ctx.save();
    const fs = Math.round(size * 0.84);
    ctx.font = `800 ${fs}px ${HUD_FONT}`;
    if ('letterSpacing' in ctx) ctx.letterSpacing = fs < 18 ? '0.06em' : '-0.01em';
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = Math.max(4, fs * 0.35);
    ctx.shadowOffsetY = 2;
    ctx.fillStyle = ON_DARK[color] ?? brighten(color);
    ctx.fillText(text, x, y);
    ctx.restore();
    return;
  }
  ctx.font = `${size}px ${MARKER_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Small white circle with a green check (ok) or red X. */
export function drawBadge(ctx, x, y, r, ok) {
  ctx.save();
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(31,31,34,0.35)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = Math.max(2.5, r * 0.32);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ok ? '#1f9d4c' : '#d7263d';
  const m = r * 0.5;
  ctx.beginPath();
  if (ok) {
    ctx.moveTo(x - m, y); ctx.lineTo(x - m * 0.2, y + m * 0.75); ctx.lineTo(x + m, y - m * 0.7);
  } else {
    ctx.moveTo(x - m, y - m); ctx.lineTo(x + m, y + m);
    ctx.moveTo(x + m, y - m); ctx.lineTo(x - m, y + m);
  }
  ctx.stroke();
  ctx.restore();
}

/** "Press, flick up, let go!" arrow shown above the held object before the first throw. */
export function drawFlickHint(ctx, x, y, time, text = 'Press, flick up, let go!') {
  const bob = Math.sin(time * 4) * 8;
  const y0 = y + bob;
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(x, y0);
  ctx.lineTo(x, y0 - 70);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x, y0 - 88);
  ctx.lineTo(x - 13, y0 - 66);
  ctx.lineTo(x + 13, y0 - 66);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  drawLabel(ctx, text, x, y0 - 100, 24, '#1f1f22', 'center');
}

/** Debug readout box in the bottom-right corner. */
export function drawDebugBox(ctx, cam, lines, width = 470) {
  ctx.save();
  ctx.font = '12px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(cam.W - width - 10, cam.H - 16 * lines.length - 18, width, 16 * lines.length + 8);
  ctx.fillStyle = '#9ef0b5';
  ctx.textAlign = 'left';
  lines.forEach((l, i) => ctx.fillText(l, cam.W - width - 2, cam.H - 16 * (lines.length - i) - 6));
  ctx.restore();
}

/** Floating "HIT!" / "Missed" style text that rises and fades. */
export function createPopups() {
  let list = [];
  return {
    add(text, x, y, color, size = 28, max = 0.9) {
      list.push({ text, x, y, color, size, life: 0, max });
    },
    update(dt) {
      for (const p of list) p.life += dt;
      list = list.filter((p) => p.life < p.max);
    },
    draw(ctx) {
      for (const p of list) {
        const k = p.life / p.max;
        ctx.save();
        ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const scale = k < 0.15 ? 0.7 + (k / 0.15) * 0.3 : 1;
        drawLabel(ctx, p.text, p.x, p.y - k * 28, Math.round(p.size * scale), p.color, 'center');
        ctx.restore();
      }
    },
  };
}

/** Dark frosted bar (bottom tray / panels behind HUD items). */
export function drawGlassBar(ctx, x, y, w, h, radius = 0) {
  ctx.save();
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, 'rgba(20,14,28,0.55)');
  g.addColorStop(1, 'rgba(10,6,14,0.75)');
  ctx.fillStyle = g;
  ctx.beginPath();
  if (ctx.roundRect && radius) ctx.roundRect(x, y, w, h, radius); else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(x + radius, y, w - radius * 2, 1);
  ctx.restore();
}
