import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createTrivia } from './game.js';

export default {
  id: 'trivia',
  name: 'Trivia',
  tagline: 'The board flips. Know it? Type it. Fast.',
  goText: 'Flip!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'The whiteboard flips over to show a trivia question.',
    `Type the answer and press <kbd>Enter</kbd>. You have ${CONFIG.roundSeconds} seconds. Close spellings count.`,
    `Every wrong answer costs ${CONFIG.wrongPenaltySec} seconds.`,
    `In Competition and online there's no clock: first right answer is safe, and a wrong one makes you wait ${CONFIG.raceLockoutSec} seconds.`,
    `Get ${CONFIG.passScore} of ${CONFIG.rounds} to survive.`,
  ],
  options: [
    { id: 'rush', label: 'Rush', desc: `Endless: questions keep coming and get harder, and the clock shrinks from ${CONFIG.rush.startSeconds}s to ${CONFIG.rush.minSeconds}s. One wrong answer or time-out ends it.` },
  ],
  variants: GAMES.find((g) => g.id === 'trivia').variants,
  statLabels: [
    ['solved', 'Right'],
    ['wrong', 'Wrong guesses'],
    ['avgSeconds', 'Avg seconds to answer'],
  ],
  variant(opts) { return opts.rush ? 'rush' : 'regular'; },
  create: createTrivia,
};
