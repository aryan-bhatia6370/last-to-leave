// Pictionary sketches: quick "30 seconds with a black marker" drawings.
// Coordinates are in a 0–100 box (x right, y down). Stroke helpers:
//   P(...points)   straight polyline
//   S(...points)   smooth curve through the points
//   C(x, y, r)     circle,  E(x, y, rx, ry) ellipse
// `accept` lists other answers that count. Drawings made with the drawing
// recorder (#/draw) can be pasted into this list.

import { MORE_DRAWINGS } from './drawings2.js';

const P = (...pts) => ({ t: 'p', pts });
const S = (...pts) => ({ t: 's', pts });
const C = (x, y, r) => ({ t: 'e', x, y, rx: r, ry: r });
const E = (x, y, rx, ry) => ({ t: 'e', x, y, rx, ry });

const BASE_DRAWINGS = [
  { answer: 'house', accept: ['home', 'hut', 'cabin'], strokes: [
    P([20, 85], [20, 45], [80, 45], [80, 85], [20, 85]), P([14, 49], [50, 15], [86, 49]),
    P([42, 85], [42, 62], [58, 62], [58, 85]), P([28, 52], [36, 52], [36, 60], [28, 60], [28, 52])] },
  { answer: 'sun', accept: ['the sun', 'sunshine'], strokes: [
    C(50, 50, 18), P([50, 26], [50, 10]), P([50, 74], [50, 90]), P([26, 50], [10, 50]), P([74, 50], [90, 50]),
    P([33, 33], [22, 22]), P([67, 33], [78, 22]), P([33, 67], [22, 78]), P([67, 67], [78, 78])] },
  { answer: 'tree', accept: ['trees', 'oak', 'oak tree'], strokes: [
    P([44, 92], [44, 62]), P([56, 92], [56, 62]),
    S([44, 62], [30, 60], [20, 46], [28, 30], [42, 20], [58, 20], [72, 30], [80, 46], [70, 60], [56, 62])] },
  { answer: 'cat', accept: ['kitten', 'kitty'], strokes: [
    C(50, 56, 20), P([35, 44], [33, 24], [46, 37]), P([54, 37], [67, 24], [65, 44]),
    C(43, 52, 2.5), C(57, 52, 2.5), P([48, 61], [52, 61], [50, 64], [48, 61]),
    P([44, 63], [28, 59]), P([44, 65], [28, 68]), P([56, 63], [72, 59]), P([56, 65], [72, 68])] },
  { answer: 'fish', accept: ['goldfish'], strokes: [
    S([18, 50], [34, 34], [58, 34], [74, 50], [58, 66], [34, 66], [18, 50]), P([74, 50], [90, 36], [90, 64], [74, 50]),
    C(32, 47, 2.5), S([46, 40], [50, 50], [46, 60])] },
  { answer: 'car', accept: ['automobile', 'vehicle'], strokes: [
    P([10, 66], [10, 53], [27, 50], [36, 38], [64, 38], [74, 50], [90, 53], [90, 66], [10, 66]),
    C(30, 67, 8), C(70, 67, 8), P([39, 49], [43, 42], [62, 42], [68, 49], [39, 49])] },
  { answer: 'cloud', accept: ['clouds'], strokes: [
    S([20, 62], [16, 50], [28, 42], [34, 30], [52, 26], [62, 34], [76, 32], [86, 46], [80, 62], [20, 62])] },
  { answer: 'umbrella', accept: ['parasol'], strokes: [
    S([14, 46], [28, 26], [50, 18], [72, 26], [86, 46]),
    S([14, 46], [22, 40], [32, 46]), S([32, 46], [41, 40], [50, 46]), S([50, 46], [59, 40], [68, 46]), S([68, 46], [77, 40], [86, 46]),
    P([50, 46], [50, 82]), S([50, 82], [49, 88], [43, 89], [40, 84])] },
  { answer: 'star', accept: ['stars'], strokes: [
    P([50, 10], [60, 40], [91, 40], [66, 58], [76, 89], [50, 70], [24, 89], [34, 58], [9, 40], [40, 40], [50, 10])] },
  { answer: 'heart', accept: ['love'], strokes: [
    S([50, 86], [30, 66], [15, 46], [19, 28], [34, 21], [50, 34]), S([50, 34], [66, 21], [81, 28], [85, 46], [70, 66], [50, 86])] },
  { answer: 'snowman', accept: ['snow man', 'frosty'], strokes: [
    C(50, 73, 16), C(50, 46, 12), C(50, 25, 9), C(47, 23, 1.2), C(53, 23, 1.2),
    P([38, 46], [20, 34]), P([62, 46], [80, 34]), P([50, 26], [58, 28])] },
  { answer: 'ice cream', accept: ['ice cream cone', 'icecream', 'cone'], strokes: [
    P([37, 50], [50, 92], [63, 50]), S([36, 50], [33, 38], [42, 27], [50, 25], [58, 27], [67, 38], [64, 50]),
    P([36, 50], [64, 50]), P([42, 58], [58, 70]), P([58, 58], [45, 78])] },
  { answer: 'apple', accept: ['apples'], strokes: [
    S([50, 30], [37, 23], [23, 32], [21, 52], [31, 74], [44, 81], [50, 77], [56, 81], [69, 74], [79, 52], [77, 32], [63, 23], [50, 30]),
    P([50, 30], [52, 15]), S([52, 20], [60, 11], [69, 15], [60, 22], [52, 20])] },
  { answer: 'flower', accept: ['flowers', 'daisy', 'rose'], strokes: [
    C(50, 36, 7), C(50, 22, 7), C(64, 36, 7), C(50, 50, 7), C(36, 36, 7),
    S([50, 43], [52, 66], [50, 92]), S([51, 72], [62, 63], [71, 65], [61, 73], [51, 73])] },
  { answer: 'moon', accept: ['crescent', 'crescent moon'], strokes: [
    S([62, 12], [40, 20], [29, 46], [38, 73], [63, 86]), S([63, 86], [50, 70], [46, 48], [50, 28], [62, 12])] },
  { answer: 'boat', accept: ['sailboat', 'sail boat', 'ship'], strokes: [
    P([10, 60], [90, 60], [75, 78], [25, 78], [10, 60]), P([50, 60], [50, 14]), P([50, 17], [79, 53], [50, 53]),
    S([6, 86], [16, 82], [26, 86], [36, 82], [46, 86])] },
  { answer: 'rocket', accept: ['rocket ship', 'rocketship', 'spaceship'], strokes: [
    S([50, 8], [62, 27], [62, 70], [38, 70], [38, 27], [50, 8]), P([38, 56], [27, 76], [38, 70]), P([62, 56], [73, 76], [62, 70]),
    C(50, 40, 6), P([42, 72], [46, 89], [50, 77], [54, 91], [58, 72])] },
  { answer: 'pizza', accept: ['pizza slice', 'slice of pizza', 'slice'], strokes: [
    P([19, 26], [81, 26], [50, 90], [19, 26]), S([19, 26], [50, 16], [81, 26]), C(41, 39, 5), C(59, 41, 5), C(50, 60, 4.5)] },
  { answer: 'clock', accept: ['watch', 'time'], strokes: [
    C(50, 50, 33), P([50, 50], [50, 29]), P([50, 50], [65, 58]),
    P([50, 18], [50, 23]), P([82, 50], [77, 50]), P([50, 82], [50, 77]), P([18, 50], [23, 50])] },
  { answer: 'key', accept: ['keys'], strokes: [
    C(26, 50, 13), C(26, 50, 4), P([39, 50], [89, 50]), P([75, 50], [75, 62]), P([85, 50], [85, 60])] },
  { answer: 'glasses', accept: ['eyeglasses', 'sunglasses', 'spectacles'], strokes: [
    C(32, 52, 13), C(68, 52, 13), S([45, 50], [50, 45], [55, 50]), P([19, 48], [7, 40]), P([81, 48], [93, 40])] },
  { answer: 'spider', accept: ['spiders', 'tarantula'], strokes: [
    C(50, 56, 10), C(50, 39, 6),
    P([42, 51], [30, 38], [17, 44]), P([41, 56], [25, 52], [13, 60]), P([42, 61], [30, 67], [20, 79]), P([45, 64], [37, 77], [31, 91]),
    P([58, 51], [70, 38], [83, 44]), P([59, 56], [75, 52], [87, 60]), P([58, 61], [70, 67], [80, 79]), P([55, 64], [63, 77], [69, 91])] },
  { answer: 'snake', accept: ['snakes', 'serpent'], strokes: [
    S([8, 72], [21, 58], [34, 71], [46, 83], [58, 70], [70, 57], [80, 51]), E(85, 49, 6, 4),
    P([91, 49], [97, 45]), P([91, 49], [97, 53]), C(86, 47, 0.8)] },
  { answer: 'mushroom', accept: ['mushrooms', 'toadstool', 'shroom'], strokes: [
    S([17, 56], [23, 30], [50, 17], [77, 30], [83, 56], [17, 56]), P([40, 56], [38, 86], [62, 86], [60, 56]),
    C(37, 38, 4), C(57, 31, 4), C(67, 45, 3)] },
  { answer: 'balloon', accept: ['balloons'], strokes: [
    S([50, 13], [69, 21], [73, 42], [61, 60], [50, 64], [39, 60], [27, 42], [31, 21], [50, 13]),
    P([47, 64], [50, 69], [53, 64]), S([50, 69], [45, 78], [55, 86], [50, 96])] },
  { answer: 'light bulb', accept: ['lightbulb', 'bulb', 'idea'], strokes: [
    S([40, 66], [29, 50], [27, 31], [38, 15], [50, 12], [62, 15], [73, 31], [71, 50], [60, 66]),
    P([40, 66], [60, 66]), P([41, 72], [59, 72]), P([43, 78], [57, 78]), P([44, 50], [48, 40], [52, 50], [56, 40])] },
  { answer: 'envelope', accept: ['letter', 'mail', 'email'], strokes: [
    P([14, 30], [86, 30], [86, 76], [14, 76], [14, 30]), P([14, 30], [50, 57], [86, 30])] },
  { answer: 'bell', accept: ['bells'], strokes: [
    S([29, 72], [31, 40], [40, 23], [50, 19], [60, 23], [69, 40], [71, 72]), P([21, 72], [79, 72]), C(50, 79, 4), P([50, 19], [50, 12])] },
  { answer: 'cactus', accept: ['cacti'], strokes: [
    S([42, 88], [42, 24], [50, 17], [58, 24], [58, 88]), P([42, 59], [27, 59], [27, 40]), P([58, 50], [73, 50], [73, 31]),
    P([22, 88], [78, 88])] },
  { answer: 'ghost', accept: ['ghosts', 'spirit', 'boo'], strokes: [
    S([29, 86], [27, 40], [36, 19], [50, 14], [64, 19], [73, 40], [71, 86]),
    P([29, 86], [36, 79], [43, 86], [50, 79], [57, 86], [64, 79], [71, 86]), E(43, 40, 3, 5), E(57, 40, 3, 5), C(50, 57, 4)] },
  { answer: 'crown', accept: ['crowns', 'king', 'queen'], strokes: [
    P([17, 76], [17, 34], [34, 55], [50, 23], [66, 55], [83, 34], [83, 76], [17, 76]), C(34, 67, 3), C(50, 65, 3), C(66, 67, 3)] },
  { answer: 'door', accept: ['doors', 'doorway'], strokes: [
    P([29, 92], [29, 13], [71, 13], [71, 92]), C(62, 55, 3), P([18, 92], [82, 92])] },
  { answer: 'guitar', accept: ['guitars', 'ukulele', 'bass'], strokes: [
    S([50, 52], [35, 50], [27, 63], [31, 79], [50, 88], [69, 79], [73, 63], [65, 50], [50, 52]),
    C(50, 67, 6), P([46, 52], [46, 10], [54, 10], [54, 52]), P([44, 80], [56, 80])] },
  { answer: 'eye', accept: ['eyes', 'eyeball'], strokes: [
    S([10, 50], [30, 29], [50, 25], [70, 29], [90, 50], [70, 71], [50, 75], [30, 71], [10, 50]), C(50, 50, 13), C(50, 50, 4)] },
  { answer: 'sword', accept: ['swords', 'knife', 'dagger'], strokes: [
    P([48, 8], [52, 8], [55, 62], [45, 62], [48, 8]), P([33, 62], [67, 62]), P([50, 62], [50, 83]), C(50, 87, 4)] },
  { answer: 'mug', accept: ['cup', 'coffee', 'coffee mug', 'tea', 'tea cup'], strokes: [
    P([29, 32], [29, 82], [66, 82], [66, 32]), S([66, 43], [81, 45], [81, 63], [66, 67]),
    S([41, 24], [37, 15], [43, 6]), S([54, 24], [50, 15], [56, 6])] },
  { answer: 'pencil', accept: ['pencils', 'pen'], strokes: [
    P([22, 80], [70, 32], [80, 42], [32, 90], [22, 80]), P([22, 80], [12, 96], [32, 90]), P([65, 37], [75, 47])] },
  { answer: 'fire', accept: ['flame', 'flames', 'campfire'], strokes: [
    S([50, 90], [30, 80], [26, 60], [38, 40], [42, 20], [52, 40], [58, 28], [70, 48], [74, 70], [66, 84], [50, 90]),
    S([50, 86], [42, 76], [44, 62], [50, 52], [56, 64], [58, 78], [50, 86])] },
  // a few from the show itself
  { answer: 'marker', accept: ['dry erase marker', 'expo marker', 'expo', 'markers'], strokes: [
    P([18, 72], [62, 28], [74, 40], [30, 84], [18, 72]), P([56, 34], [70, 20], [84, 34], [70, 48]), P([22, 80], [12, 90])] },
  { answer: 'solo cup', accept: ['cup', 'red solo cup', 'red cup', 'plastic cup'], strokes: [
    E(50, 24, 22, 6), P([28, 24], [36, 88]), P([72, 24], [64, 88]), S([36, 88], [50, 91], [64, 88]),
    S([31, 46], [50, 50], [69, 46]), S([33, 62], [50, 66], [67, 62])] },
];

export const DRAWINGS = [...BASE_DRAWINGS, ...MORE_DRAWINGS];

// ---------- turning strokes into points ----------
function catmull(pts, perSeg = 8) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg, t2 = t * t, t3 = t2 * t;
      out.push([
        0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function densify(pts, step = 2.5) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}

/** Strokes -> arrays of [x, y] points, with a little hand wobble. Custom drawings are already point arrays. */
export function toPolylines(drawing, rng) {
  const wob = () => (rng ? rng.range(-0.5, 0.5) : 0);
  return drawing.strokes.map((s) => {
    if (Array.isArray(s)) return densify(s);
    let pts;
    if (s.t === 'p') pts = densify(s.pts);
    else if (s.t === 's') pts = densify(catmull(s.pts));
    else {
      pts = [];
      const n = Math.max(16, Math.round((s.rx + s.ry) * 1.6));
      const start = rng ? rng.range(0, Math.PI * 2) : 0;
      for (let i = 0; i <= n; i++) {
        const a = start + (i / n) * Math.PI * 2 * 1.03; // overshoot a touch, like a real hand
        pts.push([s.x + Math.cos(a) * s.rx, s.y + Math.sin(a) * s.ry]);
      }
    }
    let dx = wob(), dy = wob();
    return pts.map(([x, y], i) => {
      if (i % 6 === 0) { dx = dx * 0.6 + wob(); dy = dy * 0.6 + wob(); }
      return [x + dx, y + dy];
    });
  });
}

// ---------- answer matching ----------
function lev(a, b) {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[m][n];
}

export function normalizeGuess(s) {
  let t = String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^(a|an|the|its|it s|it is|is it) /, '');
  return t.replace(/ /g, '');
}

/** The word as typed plus its singular forms ("boxes" -> box, "cats" -> cat). */
function forms(s) {
  const t = normalizeGuess(s);
  const out = new Set([t]);
  if (t.length > 3 && t.endsWith('es')) out.add(t.slice(0, -2));
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) out.add(t.slice(0, -1));
  return [...out];
}

/** 'yes' | 'close' | 'no' */
export function judgeGuess(guess, drawing) {
  const gs = forms(guess);
  if (!gs[0]) return 'no';
  let best = Infinity;
  for (const a of [drawing.answer, ...(drawing.accept || [])]) {
    for (const n of forms(a)) {
      const allowed = n.length >= 8 ? 2 : n.length >= 4 ? 1 : 0;
      for (const g of gs) {
        const d = lev(g, n);
        if (d <= allowed) return 'yes';
        best = Math.min(best, d);
      }
    }
  }
  return best <= 2 ? 'close' : 'no';
}

// ---------- your own drawings (saved on this device) ----------
const MY_KEY = 'ltl.drawings.v1';
export function loadMyDrawings() {
  try { return JSON.parse(localStorage.getItem(MY_KEY) || '[]') || []; } catch { return []; }
}
export function saveMyDrawings(list) {
  try { localStorage.setItem(MY_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
