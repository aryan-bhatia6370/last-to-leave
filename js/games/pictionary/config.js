// ============================================================
// Pictionary — every tunable number lives here.
// ============================================================
export const CONFIG = {
  rounds: 3,
  passScore: 2,            // drawings guessed (out of 3) to survive
  afterDrawSec: [5, 10],   // offline: the clock runs out this long after Paul finishes the sketch
  wrongPenaltySec: 5,      // offline: each wrong guess eats this much of the clock
  raceLockoutSec: 5,       // Competition/online (no clock): wait this long after a wrong guess
  raceNewBoardSec: 30,

  // Pictionary Streak (endless): drawings keep coming. A drawing you don't get
  // (time runs out or you pass) is a strike; 3 strikes ends it. The time after
  // the sketch finishes shrinks a little with every one you get.
  streak: {
    strikes: 3,
    passScore: 6,
    shrinkPerGuess: 0.25,  // seconds off the after-sketch time per drawing guessed...
    minAfterDrawSec: [2, 4], // ...down to this
  },     // Competition/online: nobody got it this long after the sketch is done -> new drawing
  penSpeed: 30,            // drawing speed, in board units (the board is 100 across) per second
  minDrawSec: 9,           // even simple sketches take at least this long...
  maxDrawSec: 20,          // ...and big ones never take longer than this
  penLiftMs: 160,          // pause between strokes
  revealMs: 1900,
  eraseMs: 600,
  strokeWidth: 1.15,       // in board units
};
