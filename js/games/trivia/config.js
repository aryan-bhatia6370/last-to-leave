// ============================================================
// Trivia — every tunable number lives here. Plays exactly like Equations
// (board flip, timers, penalties, races, Rush), with typed trivia answers.
// ============================================================
export const CONFIG = {
  rounds: 3,
  passScore: 2,           // questions right (out of 3) to survive
  roundSeconds: 20,       // time per question (offline)
  wrongPenaltySec: 5,     // offline: each wrong answer eats this much of the clock
  raceLockoutSec: 5,      // Competition/online (no clock): wait this long after a wrong answer
  raceNewBoardSec: 60,    // Competition/online: nobody got it after this long -> a new question
  flipMs: 750,
  revealMs: 1900,

  tierWeights: { easy: 0.55, medium: 0.35, hard: 0.1 },

  // Trivia Rush (endless): questions keep coming and get harder; one wrong
  // answer or running out of time ends the run.
  rush: {
    startSeconds: 20,
    secondsPerSolve: -0.5,
    minSeconds: 10,
    passScore: 8,
    levels: [
      { from: 12, weights: { easy: 0.2, medium: 0.5, hard: 0.3 } },
      { from: 6, weights: { easy: 0.4, medium: 0.45, hard: 0.15 } },
      { from: 0, weights: { easy: 0.8, medium: 0.2 } },
    ],
  },
};
