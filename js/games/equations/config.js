// ============================================================
// Equations — every tunable number lives here.
// ============================================================
export const CONFIG = {
  rounds: 3,
  passScore: 2,           // rounds solved (out of 3) to survive
  roundSeconds: 20,       // time per problem (offline)
  wrongPenaltySec: 5,     // offline: each wrong answer eats this much of the clock
  raceLockoutSec: 5,      // Competition/online (no clock): wait this long after a wrong answer
  raceNewBoardSec: 60,    // Competition/online: nobody got it after this long -> a new problem
  flipMs: 750,            // the whiteboard flipping over
  revealMs: 1700,         // showing the answer before the next round

  // How often each kind of problem shows up.
  tierWeights: { easy: 0.03, common: 0.63, algebra: 0.25, geometry: 0.06, veryRare: 0.03 },

  // Equations Rush (endless): problems keep coming and get harder; one wrong
  // answer or running out of time ends the run. Score = problems solved.
  rush: {
    startSeconds: 20,
    secondsPerSolve: -0.5, // the clock gets shorter as you go...
    minSeconds: 10,        // ...down to this
    passScore: 8,
    // problem mix as you solve more (the first one that fits `from` is used)
    levels: [
      { from: 10, weights: { common: 0.4, algebra: 0.35, geometry: 0.15, veryRare: 0.1 } },
      { from: 6, weights: { common: 0.55, algebra: 0.35, geometry: 0.1 } },
      { from: 3, weights: { easy: 0.05, common: 0.75, algebra: 0.2 } },
      { from: 0, weights: { easy: 0.35, common: 0.65 } },
    ],
  },
};
