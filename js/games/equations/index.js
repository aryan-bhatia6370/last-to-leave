import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createEquations } from './game.js';

export default {
  id: 'equations',
  name: 'Equations',
  tagline: 'The board flips. Do the math in your head. Fast.',
  goText: 'Flip!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'The whiteboard flips over to show a math problem.',
    `Type the answer and press <kbd>Enter</kbd>. You have ${CONFIG.roundSeconds} seconds.`,
    `In Competition and online there's no clock: first right answer is safe, and a wrong one makes you wait ${CONFIG.raceLockoutSec} seconds.`,
    `Every wrong answer costs ${CONFIG.wrongPenaltySec} seconds. Fractions like <strong>7/4</strong> or decimals are fine.`,
    'Mostly mental math with exponents and fractions. Algebra fairly often, geometry sometimes. Rarely a super quick one… or calculus.',
    `Solve ${CONFIG.passScore} of ${CONFIG.rounds} to survive.`,
  ],
  options: [
    { id: 'rush', label: 'Rush', desc: `Endless: problems keep coming and get harder, and the clock shrinks from ${CONFIG.rush.startSeconds}s to ${CONFIG.rush.minSeconds}s. One wrong answer or time-out ends it.` },
  ],
  variants: GAMES.find((g) => g.id === 'equations').variants,
  statLabels: [
    ['solved', 'Solved'],
    ['wrong', 'Wrong guesses'],
    ['avgSeconds', 'Avg seconds to solve'],
  ],
  variant(opts) { return opts.rush ? 'rush' : 'regular'; },
  create: createEquations,
};
