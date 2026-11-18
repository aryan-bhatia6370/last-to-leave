// ============================================================
// Equations — every tunable number lives here.
// ============================================================
export const CONFIG = {
  rounds: 3,
  passScore: 2,           // rounds solved (out of 3) to survive
  roundSeconds: 45,       // time per problem
  wrongPenaltySec: 5,     // each wrong answer eats this much of the clock
  flipMs: 750,            // the whiteboard flipping over
  revealMs: 1700,         // showing the answer before the next round

  // How often each kind of problem shows up.
  tierWeights: { common: 0.8, rare: 0.17, veryRare: 0.03 },
};
