import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createArchery } from './game.js';

export default {
  id: 'archery',
  name: 'Archery',
  tagline: 'Three foam states. One whiteboard that will not hold still.',
  goText: 'Throw!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    '<strong>Press, flick up, and let go</strong> to throw. A faster flick throws farther.',
    'Flick a little left or right to aim.',
    'Hit the whiteboard anywhere for a point. It moves after every throw, sometimes angled, sometimes far.',
    'You throw Nevada (big), then Wyoming (medium), then Connecticut (small).',
    `Hit ${CONFIG.passScore} of 3 to survive.`,
  ],
  options: [
    { id: 'wind', label: 'Wind', desc: 'A new wind every throw nudges your piece. Watch the gauge in the corner.' },
  ],
  variants: GAMES.find((g) => g.id === 'archery').variants,
  statLabels: [
    ['hits', 'Hits'],
    ['short', 'Short'],
    ['high', 'High'],
    ['low', 'Low'],
    ['wide', 'Wide'],
  ],
  variant(opts) {
    return opts.wind ? 'wind' : 'regular';
  },
  create: createArchery,
};
