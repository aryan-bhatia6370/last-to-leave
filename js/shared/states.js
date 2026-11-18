// Foam puzzle-piece outlines for US states, traced from real borders.
// Units: x = east, y = SOUTH (down), roughly to scale. normalizeShape()
// centers a shape, flips it so +y is up, and scales its longest side to 1.

const RAW = {
  // Straight north/east/west borders, diagonal southwest border, Colorado River at the southern tip.
  nevada: [[0, 0], [4.63, 0], [4.63, 5.8], [4.45, 6.3], [4.3, 6.7], [4.2, 7.0], [0, 3.0]],
  // Basically a rectangle.
  wyoming: [[0, 0], [5.11, 0], [5.11, 4.0], [0, 4.0]],
  // Flat top, Long Island Sound coastline along the bottom, the little southwest panhandle.
  connecticut: [[0.18, 0], [1.445, 0.03], [1.4, 0.73], [1.0, 0.78], [0.62, 0.8], [0.4, 0.9], [0.05, 1.07], [0, 0.95], [0.135, 0.76]],
};

function normalizeShape(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const scale = 1 / Math.max(maxX - minX, maxY - minY);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return pts.map(([x, y]) => [(x - cx) * scale, -(y - cy) * scale]);
}

export const STATE_SHAPES = Object.fromEntries(Object.entries(RAW).map(([k, v]) => [k, normalizeShape(v)]));

/** Flat 2D drawing of a shape (for HUD icons). size = longest side in px. */
export function drawShape2D(ctx, shape, x, y, size, fill, stroke = 'rgba(0,0,0,0.35)') {
  ctx.beginPath();
  shape.forEach(([sx, sy], i) => {
    const px = x + sx * size;
    const py = y - sy * size;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}
