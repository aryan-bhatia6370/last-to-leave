import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createCupThrowing } from './game.js';

export default {
  id: 'cup-throwing',
  name: 'Cup Throwing',
  tagline: 'Eight markers. One red solo cup. Good luck.',
  goText: 'Toss!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    '<strong>Press where you want to throw from</strong> (the marker follows you), <strong>flick up, and let go</strong>. A faster flick throws farther; it goes where your flick points.',
    'Get it in the red solo cup. Close calls hit the rim and might rattle in… or out.',
    'Every marker stays where it lands, in the cup or on the floor.',
    `All 8 colors, one at a time. Land ${CONFIG.passScore} to survive. Still the hardest game here.`,
  ],
  options: [
    { id: 'moving', label: 'Moving Cup', desc: 'The cup moves to a new spot after every throw (markers inside go with it).' },
  ],
  variants: GAMES.find((g) => g.id === 'cup-throwing').variants,
  statLabels: [
    ['inCup', 'In the cup'],
    ['rattledIn', 'Rattled in'],
    ['rimOuts', 'Rimmed out'],
    ['short', 'Short'],
    ['long', 'Long'],
    ['wide', 'Wide'],
  ],
  variant(opts) {
    return opts.moving ? 'moving' : 'regular';
  },
  create: createCupThrowing,
};
