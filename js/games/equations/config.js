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
};
