import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createPictionary } from './game.js';

export default {
  id: 'pictionary',
  name: 'Pictionary',
  tagline: 'Guess the bad whiteboard sketch before time runs out.',
  goText: 'Draw!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'A black marker sketches something on the whiteboard, live.',
    `Type your guess any time and press <kbd>Enter</kbd>. You have ${CONFIG.roundSeconds} seconds per drawing.`,
    `Every wrong guess costs ${CONFIG.wrongPenaltySec} seconds. Close spellings count.`,
    `Guess ${CONFIG.passScore} of ${CONFIG.rounds} to survive.`,
    'Want to add your own? Draw them on <a href="#/draw">the drawing board</a> and turn on "My drawings".',
  ],
  options: [
    { id: 'mine', label: 'My drawings', desc: 'Mix in drawings you made on this device with the drawing board.' },
  ],
  variants: GAMES.find((g) => g.id === 'pictionary').variants,
  statLabels: [
    ['guessed', 'Guessed'],
    ['wrong', 'Wrong guesses'],
    ['avgSeconds', 'Avg seconds to guess'],
  ],
  variant(opts) { return opts.mine ? 'mine' : 'regular'; },
  create: createPictionary,
};
