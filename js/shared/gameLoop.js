// requestAnimationFrame loop with pause, a dt cap and an FPS estimate.
export function startLoop({ update, render }) {
  let raf = 0;
  let last = performance.now();
  let paused = false;
  let fps = 60;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const raw = (now - last) / 1000;
    last = now;
    const dt = Math.min(raw, 1 / 30);
    if (raw > 0) fps += (1 / raw - fps) * 0.05;
    if (!paused) update(dt);
    render();
  }
  raf = requestAnimationFrame(frame);
  return {
    pause() { paused = true; },
    resume() { paused = false; last = performance.now(); },
    stop() { cancelAnimationFrame(raf); },
    get paused() { return paused; },
    get fps() { return fps; },
  };
}
