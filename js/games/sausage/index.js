import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createSausageGame } from './game.js';

export default {
  id: 'sausage',
  name: 'The Sausage Game',
  tagline: 'Flick the ink sausage up the whiteboard. Not too hard.',
  goText: 'Flick!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'A whiteboard lies flat on the table, split into bands worth <strong>−2 to +5</strong>. The "sausage" is a marker\'s ink refill.',
    '<strong>Press on the sausage, drag back, and let go</strong> to flick it up the board. The farther you drag, the harder it goes (watch the power meter).',
    'Where you grab it matters: grab it off-center and it spins and veers.',
    'It scores the band it stops in. Too hard and it slides off the board for 0. Negative bands take points away.',
    `${CONFIG.flicks} flicks. Score ${CONFIG.passScore}+ to survive.`,
  ],
  options: [],
  variants: GAMES.find((g) => g.id === 'sausage').variants,
  statLabels: [
    ['total', 'Total'],
    ['flicks', 'Flicks'],
  ],
  variant() { return 'regular'; },
  create: createSausageGame,
};
