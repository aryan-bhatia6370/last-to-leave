// Draws handwritten-looking math on a canvas from a tiny markup:
//   x^2  or  x^(n+1)   superscript
//   {3/4}               stacked fraction (each part can contain math too)
//   √{144}              square root with the bar over the contents
//   ∫                   integral sign (hand-drawn)
// Uses the handwriting font (lowercase x is clearly not ×), thickened so
// it reads like black dry-erase marker.

const FONT_FAMILY = '"Patrick Hand", "Segoe Print", "Comic Sans MS", cursive';

function parse(src) {
  const tokens = [];
  let text = '';
  const flush = () => { if (text) { tokens.push({ t: 'text', s: text }); text = ''; } };
  const readGroup = (i, open, close) => {
    let depth = 0;
    let j = i;
    for (; j < src.length; j++) {
      if (src[j] === open) depth++;
      else if (src[j] === close) { depth--; if (depth === 0) break; }
    }
    return { inner: src.slice(i + 1, j), end: j + 1 };
  };
  for (let i = 0; i < src.length;) {
    const ch = src[i];
    if (ch === '^') {
      flush();
      if (src[i + 1] === '(') {
        const g = readGroup(i + 1, '(', ')');
        tokens.push({ t: 'sup', s: g.inner });
        i = g.end;
      } else {
        let j = i + 1;
        while (j < src.length && /[0-9a-z]/i.test(src[j])) j++;
        tokens.push({ t: 'sup', s: src.slice(i + 1, j) });
        i = j;
      }
    } else if (ch === '{') {
      flush();
      const g = readGroup(i, '{', '}');
      const k = g.inner.indexOf('/');
      tokens.push({ t: 'frac', num: parse(g.inner.slice(0, k)), den: parse(g.inner.slice(k + 1)) });
      i = g.end;
    } else if (ch === '√' && src[i + 1] === '{') {
      flush();
      const g = readGroup(i + 1, '{', '}');
      tokens.push({ t: 'sqrt', inner: parse(g.inner) });
      i = g.end;
    } else if (ch === '∫') {
      flush();
      tokens.push({ t: 'int' });
      i++;
    } else {
      text += ch;
      i++;
    }
  }
  flush();
  return tokens;
}

const font = (size) => `${Math.round(size)}px ${FONT_FAMILY}`;

function widthOf(ctx, tokens, size) {
  return tokens.reduce((w, tk) => w + tokenWidth(ctx, tk, size), 0);
}

function tokenWidth(ctx, tk, size) {
  switch (tk.t) {
    case 'text': ctx.font = font(size); return ctx.measureText(tk.s).width;
    case 'sup': ctx.font = font(size * 0.62); return ctx.measureText(tk.s).width + size * 0.06;
    case 'frac': return Math.max(widthOf(ctx, tk.num, size * 0.8), widthOf(ctx, tk.den, size * 0.8)) + size * 0.35;
    case 'sqrt': return widthOf(ctx, tk.inner, size) + size * 0.62;
    case 'int': return size * 0.6;
    default: return 0;
  }
}

function inkText(ctx, s, x, y, size) {
  ctx.font = font(size);
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.strokeText(s, x, y);
  ctx.fillText(s, x, y);
}

function drawTokens(ctx, tokens, x, cy, size) {
  for (const tk of tokens) {
    const w = tokenWidth(ctx, tk, size);
    if (tk.t === 'text') {
      inkText(ctx, tk.s, x, cy, size);
    } else if (tk.t === 'sup') {
      inkText(ctx, tk.s, x + size * 0.03, cy - size * 0.4, size * 0.62);
    } else if (tk.t === 'frac') {
      const fs = size * 0.8;
      const nw = widthOf(ctx, tk.num, fs);
      const dw = widthOf(ctx, tk.den, fs);
      drawTokens(ctx, tk.num, x + (w - nw) / 2, cy - size * 0.45, fs);
      drawTokens(ctx, tk.den, x + (w - dw) / 2, cy + size * 0.52, fs);
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.1, cy + size * 0.04);
      ctx.lineTo(x + w - size * 0.1, cy + size * 0.04);
      ctx.stroke();
    } else if (tk.t === 'sqrt') {
      ctx.lineWidth = Math.max(2, size * 0.07);
      const top = cy - size * 0.55;
      ctx.beginPath();
      ctx.moveTo(x + size * 0.04, cy + size * 0.05);
      ctx.lineTo(x + size * 0.17, cy - size * 0.02);
      ctx.lineTo(x + size * 0.31, cy + size * 0.45);
      ctx.lineTo(x + size * 0.5, top);
      ctx.lineTo(x + w, top);
      ctx.stroke();
      drawTokens(ctx, tk.inner, x + size * 0.56, cy + size * 0.03, size);
    } else if (tk.t === 'int') {
      ctx.lineWidth = Math.max(2, size * 0.07);
      ctx.beginPath();
      ctx.moveTo(x + size * 0.48, cy - size * 0.66);
      ctx.bezierCurveTo(x + size * 0.32, cy - size * 0.95, x + size * 0.27, cy - size * 0.35, x + size * 0.3, cy);
      ctx.bezierCurveTo(x + size * 0.33, cy + size * 0.35, x + size * 0.28, cy + size * 0.95, x + size * 0.1, cy + size * 0.66);
      ctx.stroke();
    }
    x += w;
  }
}

/** Width of a line at a given font size. */
export function measureMath(ctx, src, size) {
  return widthOf(ctx, parse(src), size);
}

/** Draw one line of math centered on (cx, cy). */
export function drawMath(ctx, src, cx, cy, size, color = '#1f1f22') {
  const tokens = parse(src);
  const total = widthOf(ctx, tokens, size);
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  drawTokens(ctx, tokens, cx - total / 2, cy, size);
  ctx.restore();
}
