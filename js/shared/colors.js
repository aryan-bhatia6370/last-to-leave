// The 8 marker colors — the single source of truth for every game.
// (css/base.css has matching --m-* variables for page styling.)
export const MARKER_COLORS = [
  { id: 'black', name: 'Black', hex: '#1f1f22' },
  { id: 'red', name: 'Red', hex: '#d7263d' },
  { id: 'blue', name: 'Blue', hex: '#1d5fd1' },
  { id: 'green', name: 'Green', hex: '#1f9d4c' },
  { id: 'orange', name: 'Orange', hex: '#f2851d' },
  { id: 'brown', name: 'Brown', hex: '#7b4a26' },
  { id: 'purple', name: 'Purple', hex: '#7a3fc4' },
  { id: 'pink', name: 'Pink', hex: '#ec5fa6' },
];

export const COLOR_BY_ID = Object.fromEntries(MARKER_COLORS.map((c) => [c.id, c]));

/** The logo is always written in purple marker. */
export const LOGO_COLOR = COLOR_BY_ID.purple.hex;

/** Mix a hex color toward white (amt > 0) or black (amt < 0). amt in [-1, 1]. */
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const target = amt > 0 ? 255 : 0;
  const k = Math.abs(amt);
  r = Math.round(r + (target - r) * k);
  g = Math.round(g + (target - g) * k);
  b = Math.round(b + (target - b) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
