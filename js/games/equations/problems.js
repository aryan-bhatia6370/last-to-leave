// Equations problem generator.
// Each generator returns { lines: [math markup...], answer: [num, den], reveal: string }.
// Markup: ^ for exponents, {a/b} for stacked fractions, √{n} for square roots (see shared/mathText.js).
//   common     — mental math with exponents, fractions, roots, percents, order of operations
//   easy       — 2 + 2 level, for reaction time (rare)
//   algebra    — fairly common
//   geometry   — uncommon
//   very rare  — calculus

const M = '−'; // a real minus sign (looks better than a hyphen)
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
const frac = (n, d = 1) => { const g = gcd(n, d); const s = d < 0 ? -1 : 1; return [(s * n) / g, (s * d) / g]; };
const show = ([n, d]) => (d === 1 ? `${n}` : `${n}/${d}`).replace('-', M);
const neg = (n) => (n < 0 ? `(${M}${-n})` : `${n}`);

const COMMON = [
  // a² − b × c + d
  (r) => {
    const a = r.int(4, 13), b = r.int(2, 9), c = r.int(3, 9), d = r.int(2, 20);
    return { lines: [`${a}^2 ${M} ${b} × ${c} + ${d}`], answer: frac(a * a - b * c + d) };
  },
  // (p + q)² ÷ k
  (r) => {
    const k = r.pick([2, 3, 4, 5, 6]);
    const s = k * r.int(2, Math.floor(16 / k));
    const p = r.int(1, s - 1);
    return { lines: [`(${p} + ${s - p})^2 ÷ ${k}`], answer: frac((s * s) / k) };
  },
  // 2ⁿ − 3ᵐ
  (r) => {
    const n = r.int(4, 8), m = r.int(2, 4);
    return { lines: [`2^${n} ${M} 3^${m}`], answer: frac(2 ** n - 3 ** m) };
  },
  // a ÷ (b + c) × d − e
  (r) => {
    const s = r.int(2, 9), b = r.int(1, s - 1), t = r.int(2, 9), d = r.int(2, 9), e = r.int(1, 20);
    return { lines: [`${s * t} ÷ (${b} + ${s - b}) × ${d} ${M} ${e}`], answer: frac(t * d - e) };
  },
  // p% of n + a²
  (r) => {
    const p = r.pick([10, 15, 20, 25, 30, 40, 50, 75]);
    const n = 20 * r.int(2, 15);
    const a = r.int(2, 9);
    return { lines: [`${p}% of ${n} + ${a}^2`], answer: frac((p * n) / 100 + a * a) };
  },
  // √x + √y × c
  (r) => {
    const a = r.int(4, 15), b = r.int(2, 12), c = r.int(2, 6);
    return { lines: [`√{${a * a}} + √{${b * b}} × ${c}`], answer: frac(a + b * c) };
  },
  // −a × b + c²
  (r) => {
    const a = r.int(3, 12), b = r.int(2, 9), c = r.int(3, 12);
    return { lines: [`${M}${a} × ${b} + ${c}^2`], answer: frac(-a * b + c * c) };
  },
  // a/b + c/d  (fraction answer)
  (r) => {
    const b = r.pick([2, 3, 4, 5, 6, 8]);
    let d = r.pick([3, 4, 5, 6, 8, 10, 12]);
    if (d === b) d = b * 2;
    const a = r.int(1, b - 1), c = r.int(1, d - 1);
    return { lines: [`{${a}/${b}} + {${c}/${d}}`], answer: frac(a * d + c * b, b * d) };
  },
  // (a/b) of n − c³
  (r) => {
    const b = r.pick([3, 4, 5, 6, 8]), a = r.int(1, b - 1), n = b * r.int(4, 12), c = r.int(2, 4);
    return { lines: [`{${a}/${b}} of ${n} ${M} ${c}^3`], answer: frac((a * n) / b - c ** 3) };
  },
  // a³ − b² + c
  (r) => {
    const a = r.int(2, 6), b = r.int(3, 12), c = r.int(1, 15);
    return { lines: [`${a}^3 ${M} ${b}^2 + ${c}`], answer: frac(a ** 3 - b * b + c) };
  },
  // a × (b − c)² ÷ d
  (r) => {
    const d = r.pick([2, 3, 4]), diff = d * r.int(1, 3), c = r.int(1, 9), a = r.int(2, 6);
    return { lines: [`${a} × (${c + diff} ${M} ${c})^2 ÷ ${d}`], answer: frac((a * diff * diff) / d) };
  },
];

const RARE = [
  // ax + b = c
  (r) => {
    const x = r.int(2, 15), a = r.int(2, 9), b = r.int(1, 30);
    return { lines: [`${a}x + ${b} = ${a * x + b}`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
  // a(x − b) = c
  (r) => {
    const x = r.int(5, 20), a = r.int(2, 7), b = r.int(1, x - 1);
    return { lines: [`${a}(x ${M} ${b}) = ${a * (x - b)}`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
  // Pythagorean triple
  (r) => {
    const [a, b, c] = r.pick([[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]]);
    return { lines: ['Right triangle,', `legs ${a} and ${b}.`, 'Hypotenuse = ?'], answer: frac(c) };
  },
  // triangle area
  (r) => {
    const base = 2 * r.int(3, 12), h = r.int(3, 15);
    return { lines: ['Triangle:', `base ${base}, height ${h}.`, 'Area = ?'], answer: frac((base * h) / 2) };
  },
  // third angle
  (r) => {
    const a = r.int(25, 80), b = r.int(25, 150 - a);
    return { lines: [`A triangle has angles`, `${a}° and ${b}°.`, 'Third angle = ?°'], answer: frac(180 - a - b), reveal: `${180 - a - b}°` };
  },
  // circle area in terms of π
  (r) => {
    const rad = r.int(3, 12);
    return { lines: [`Circle, radius ${rad}.`, 'Area = ?π'], answer: frac(rad * rad), reveal: `${rad * rad}π` };
  },
  // system of equations
  (r) => {
    const x = r.int(5, 20), y = r.int(1, x - 1);
    return { lines: [`x + y = ${x + y}`, `x ${M} y = ${x - y}`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
  // x² = n
  (r) => {
    const x = r.int(11, 19);
    return { lines: [`x^2 = ${x * x},  x > 0`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
];

const VERY_RARE = [
  // derivative of a·xⁿ at a point
  (r) => {
    const a = r.int(2, 5), n = r.int(2, 3), x0 = r.int(1, 4);
    return { lines: [`d/dx ( ${a}x^${n} )`, `at x = ${x0}`], answer: frac(a * n * x0 ** (n - 1)) };
  },
  // definite integral of a·x from 0 to b
  (r) => {
    const b = 2 * r.int(1, 4), a = r.int(1, 6);
    return { lines: [`∫ ${a}x dx`, `from 0 to ${b}`], answer: frac((a * b * b) / 2) };
  },
  // a removable-discontinuity limit
  (r) => {
    const a = r.int(2, 9);
    return { lines: [`lim (x → ${a})`, `{x^2 ${M} ${a * a}/x ${M} ${a}}`], answer: frac(2 * a) };
  },
];

// quick reaction-time ones, 2 + 2 level
const EASY = [
  (r) => { const a = r.int(1, 9), b = r.int(1, 9); return { lines: [`${a} + ${b}`], answer: frac(a + b) }; },
  (r) => { const b = r.int(1, 9), a = b + r.int(0, 9); return { lines: [`${a} ${M} ${b}`], answer: frac(a - b) }; },
  (r) => { const a = r.int(2, 9), b = r.int(2, 5); return { lines: [`${a} × ${b}`], answer: frac(a * b) }; },
  (r) => { const b = r.int(2, 5), q = r.int(1, 9); return { lines: [`${b * q} ÷ ${b}`], answer: frac(q) }; },
];

const MORE_ALGEBRA = [
  // x/a + b = c
  (r) => {
    const a = r.int(2, 6), x = a * r.int(2, 9), b = r.int(1, 12);
    return { lines: [`x/${a} + ${b} = ${x / a + b}`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
  // ax − b = cx + d
  (r) => {
    const c = r.int(1, 4), a = c + r.int(1, 4), x = r.int(2, 9), b = r.int(1, 15);
    const d = (a - c) * x - b;
    return { lines: [`${a}x ${M} ${b} = ${c === 1 ? '' : c}x ${d < 0 ? M : '+'} ${Math.abs(d)}`, 'x = ?'], answer: frac(x), reveal: `x = ${x}` };
  },
];

// RARE = 4 algebra + 4 geometry kinds (see the comments above)
const ALGEBRA = [RARE[0], RARE[1], RARE[6], RARE[7], ...MORE_ALGEBRA];
const GEOMETRY = [RARE[2], RARE[3], RARE[4], RARE[5]];

export const TIERS = { easy: EASY, common: COMMON, algebra: ALGEBRA, geometry: GEOMETRY, veryRare: VERY_RARE };

/** Make `count` problems, never repeating a template within a game. */
export function makeProblems(rng, count, weights) {
  const used = new Set();
  const out = [];
  let guard = 0;
  while (out.length < count && guard++ < 200) {
    const tier = rng.weighted(weights);
    const list = TIERS[tier];
    const idx = rng.int(0, list.length - 1);
    const key = `${tier}:${idx}`;
    if (used.has(key)) continue;
    used.add(key);
    const p = list[idx](rng);
    p.tier = tier;
    p.reveal = p.reveal || show(p.answer);
    out.push(p);
  }
  return out;
}

/** One problem (Rush): picks a tier by weight, never the same template twice in a row. Returns { p, key }. */
export function makeProblem(rng, weights, avoidKey = null) {
  for (let i = 0; i < 50; i++) {
    const tier = rng.weighted(weights);
    const list = TIERS[tier];
    const idx = rng.int(0, list.length - 1);
    const key = `${tier}:${idx}`;
    if (key === avoidKey) continue;
    const p = list[idx](rng);
    p.tier = tier;
    p.reveal = p.reveal || show(p.answer);
    return { p, key };
  }
  return makeProblem(rng, { common: 1 });
}

/** Parse a typed answer into a number. Accepts 12, -3, 7/4, 1.75, "x = 9", "65°", "25π". */
export function parseAnswer(input) {
  let s = String(input).toLowerCase().trim();
  s = s.replace(/[−–—]/g, '-').replace(/\s+/g, '');
  s = s.replace(/^[a-z]=/, '').replace(/°|degrees?|π|pi|units?/g, '');
  const m = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const d = parseFloat(m[2]);
    return d === 0 ? NaN : parseFloat(m[1]) / d;
  }
  if (/^-?\d*\.?\d+$/.test(s)) return parseFloat(s);
  return NaN;
}

export function isCorrect(input, [n, d]) {
  const v = parseAnswer(input);
  if (!Number.isFinite(v)) return false;
  const target = n / d;
  // exact, or a rounded decimal for fraction answers (e.g. 1.58 for 19/12)
  return Math.abs(v - target) < 1e-9 || (d !== 1 && Math.abs(v - target) < 0.006);
}
