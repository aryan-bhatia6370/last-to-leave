// ============================================================
// Pictionary — every tunable number lives here.
// ============================================================
export const CONFIG = {
  rounds: 3,
  passScore: 2,            // drawings guessed (out of 3) to survive
  roundSeconds: 40,        // time per drawing (the sketch keeps being drawn while you guess)
  wrongPenaltySec: 4,      // each wrong guess eats this much of the clock
  penSpeed: 30,            // drawing speed, in board units (the board is 100 across) per second
  minDrawSec: 9,           // even simple sketches take at least this long...
  maxDrawSec: 20,          // ...and big ones never take longer than this
  penLiftMs: 160,          // pause between strokes
  revealMs: 1900,
  eraseMs: 600,
  strokeWidth: 1.15,       // in board units
};
