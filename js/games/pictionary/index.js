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
    `Type your guess any time and press <kbd>Enter</kbd>. The clock runs out ${CONFIG.afterDrawSec[0]}–${CONFIG.afterDrawSec[1]} seconds after Paul finishes drawing.`,
    `Every wrong guess costs ${CONFIG.wrongPenaltySec} seconds. Close spellings count.`,
    `In Competition and online there's no clock: first to guess it is safe, and a wrong guess makes you wait ${CONFIG.raceLockoutSec} seconds.`,
    `Guess ${CONFIG.passScore} of ${CONFIG.rounds} to survive.`,
    'Want to add your own? Draw them on <a href="#/draw">the drawing board</a> and turn on "My drawings".',
  ],
  options: [
    { id: 'mine', label: 'My drawings', desc: 'Mix in drawings you made on this device with the drawing board.' },
    { id: 'rush', label: 'Rush', desc: 'Endless: drawings keep coming and the time gets tighter. Miss one and it\'s over. (Built-in drawings only.)' },
  ],
  variants: GAMES.find((g) => g.id === 'pictionary').variants,
  statLabels: [
    ['guessed', 'Guessed'],
    ['wrong', 'Wrong guesses'],
    ['avgSeconds', 'Avg seconds to guess'],
  ],
  variant(opts) { return opts.rush ? 'rush' : opts.mine ? 'mine' : 'regular'; },
  create: createPictionary,
};
