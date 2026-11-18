// Add ?debug=1 before the # in the URL to show hitboxes, catch windows and FPS.
// Example: http://localhost:8000/?debug=1#/play/marker-catching
export const DEBUG = new URLSearchParams(location.search).has('debug');

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export async function ensureFonts() {
  if (!document.fonts) return;
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('32px "Permanent Marker"'),
        document.fonts.load('20px "Patrick Hand"'),
        document.fonts.load('800 20px "Inter"'),
        document.fonts.load('700 20px "Inter"'),
      ]),
      new Promise((r) => setTimeout(r, 1500)),
    ]);
  } catch { /* fall back to system fonts */ }
}
