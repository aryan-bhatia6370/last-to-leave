// Full-size, high-DPI canvas that tracks its container's size.
export function createCanvas(container, onResize) {
  const canvas = document.createElement('canvas');
  canvas.className = 'game-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const size = { w: 1, h: 1, dpr: 1 };

  function fit() {
    const r = container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5, Math.sqrt(6e6 / Math.max(1, r.width * r.height)));
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === size.w && h === size.h && dpr === size.dpr) return;
    size.w = w; size.h = h; size.dpr = dpr;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize?.(size);
  }

  const ro = new ResizeObserver(fit);
  ro.observe(container);
  fit();

  return {
    canvas,
    ctx,
    size,
    destroy() { ro.disconnect(); canvas.remove(); },
  };
}
