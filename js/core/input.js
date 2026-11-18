// One pointer API for mouse, touch and pen. Coordinates are CSS pixels
// relative to the element.
export function attachPointer(el, { down, move, up } = {}) {
  const pos = (e) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, type: e.pointerType || 'mouse', id: e.pointerId };
  };
  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    // Keep receiving move/up events even if the drag leaves the element.
    try { el.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    down?.(pos(e), e);
  };
  const onMove = (e) => move?.(pos(e), e);
  const onUp = (e) => up?.(pos(e), e);
  const onLeave = (e) => { if (e.pointerType === 'mouse') move?.(null, e); };
  const onContext = (e) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onLeave);
  el.addEventListener('contextmenu', onContext);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    el.removeEventListener('pointerleave', onLeave);
    el.removeEventListener('contextmenu', onContext);
  };
}
