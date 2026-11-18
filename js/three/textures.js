// Procedural textures (drawn with canvas at load time, so there are no image files to host).
import * as THREE from 'three';

function canvasTex(w, h, draw, { repeat = [1, 1], color = true } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g, w, h, n, colors, rMax, rnd) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    g.globalAlpha = 0.05 + rnd() * 0.2;
    const r = 0.5 + rnd() * rMax;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Sun-bleached school concrete with expansion joints. One tile = 3 m. */
export function concreteTexture(repeat) {
  const rnd = seeded(5);
  return canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#b8b1a5';
    g.fillRect(0, 0, w, h);
    // soft blotches
    for (let i = 0; i < 60; i++) {
      const x = rnd() * w, y = rnd() * h, r = 40 + rnd() * 160;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.5;
      gr.addColorStop(0, dark ? 'rgba(90,80,65,0.10)' : 'rgba(255,250,240,0.10)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    speckle(g, w, h, 9000, ['#7d766b', '#d9d3c7', '#9a9284', '#cfc6b6'], 1.6, rnd);
    // expansion joints at the tile edges
    g.strokeStyle = 'rgba(60,52,42,0.55)';
    g.lineWidth = 4;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.strokeStyle = 'rgba(255,255,255,0.12)';
    g.lineWidth = 2;
    g.strokeRect(6, 6, w - 12, h - 12);
  }, { repeat });
}

/** Desert-school stucco. */
export function stuccoTexture(repeat) {
  const rnd = seeded(9);
  return canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d8c6a4';
    g.fillRect(0, 0, w, h);
    speckle(g, w, h, 12000, ['#b9a582', '#efe2c6', '#c9b590'], 1.3, rnd);
  }, { repeat });
}

/**
 * Expanded/perforated metal: white = solid, black = hole (use as alphaMap).
 * One texture tile = one diamond pattern cell.
 */
export function perforatedAlpha(repeat) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#000';
    const hole = (x, y) => { g.beginPath(); g.ellipse(x, y, 11, 7.5, 0, 0, Math.PI * 2); g.fill(); };
    hole(16, 16); hole(48, 48); hole(-16, 48); hole(80, 16); hole(16, 80); hole(48, -16);
  }, { repeat, color: false });
}

/** Slight fabric weave for khakis / polo (used as a bump map). */
export function weaveBump(repeat) {
  return canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#808080';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) {
      g.fillStyle = y % 8 ? '#909090' : '#707070';
      g.fillRect(0, y, w, 2);
    }
    for (let x = 0; x < w; x += 4) {
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x, 0, 1, h);
    }
  }, { repeat, color: false });
}
