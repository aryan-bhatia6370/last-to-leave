import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createBowling } from './game.js';

export default {
  id: 'bowling',
  name: 'Bowling',
  tagline: 'One eraser. Three markers. Three throws.',
  goText: 'Bowl!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    '<strong>Press where you want to throw from</strong> (the eraser follows you), <strong>flick up, and let go</strong>. A faster flick throws farther; it goes where your flick points.',
    'Tap <strong>Eraser: flat / on its side</strong> (or press <kbd>F</kbd>) before a throw to stand it up on its end. Just for fun… mostly.',
    'It can hit the markers in the air, or hop and slide into them along the floor.',
    'Every marker you knock down is a point. The markers move after every throw. Max 9.',
    '<strong>Hard:</strong> the markers stand apart. Black = 1, orange = 2, purple = 3 (farthest). Knocked markers move; standing ones stay put. Each throw scores at most 3.',
    `Score ${CONFIG.passScore}+ (Hard: ${CONFIG.hardPassScore}+) to survive.`,
  ],
  options: [
    { id: 'hard', label: 'Hard', desc: 'Markers in separate spots, worth 1, 2 and 3 points.' },
    { id: 'wind', label: 'Wind', desc: 'A new wind every throw pushes the eraser. Watch the gauge in the corner.' },
  ],
  variants: GAMES.find((g) => g.id === 'bowling').variants,
  statLabels: [
    ['knocked', 'Markers knocked'],
    ['strikes', 'Strikes'],
    ['gutters', 'Gutter balls'],
  ],
  variant(opts) {
    return ['hard', 'wind'].filter((k) => opts[k]).join('-') || 'regular';
  },
  create: createBowling,
};
