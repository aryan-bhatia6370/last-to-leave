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
    `Every wrong answer costs ${CONFIG.wrongPenaltySec} seconds. Fractions like <strong>7/4</strong> or decimals are fine.`,
    'Mostly mental math with exponents and fractions. Sometimes algebra or geometry. Very rarely… calculus.',
    `Solve ${CONFIG.passScore} of ${CONFIG.rounds} to survive.`,
  ],
  options: [],
  variants: GAMES.find((g) => g.id === 'equations').variants,
  statLabels: [
    ['solved', 'Solved'],
    ['wrong', 'Wrong guesses'],
    ['avgSeconds', 'Avg seconds to solve'],
  ],
  variant() { return 'regular'; },
  create: createEquations,
};
