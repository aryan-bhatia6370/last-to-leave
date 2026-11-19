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
    '<strong>Press where you want to throw from</strong> (the piece follows you), <strong>flick up, and let go</strong>. A faster flick throws farther.',
    'It flies the way your flick points on screen, so aim the flick at the board.',
    'Hit the whiteboard anywhere for a point. It moves after every throw, sometimes angled, sometimes far.',
    'You throw Nevada (big), then Wyoming (medium), then Connecticut (small).',
    `Hit ${CONFIG.passScore} of 3 to survive.`,
  ],
  options: [
    { id: 'wind', label: 'Wind', desc: 'A new wind every throw pushes your piece. Watch the gauge in the corner.' },
    { id: 'zones', label: 'Hotspots', desc: `Each throw the board shows an orange bonus zone. Board = 1 point, zone = ${CONFIG.hotspots.zonePoints}. Score ${CONFIG.hotspots.passScore} of ${3 * CONFIG.hotspots.zonePoints} to survive.` },
  ],
  variants: GAMES.find((g) => g.id === 'archery').variants,
  statLabels: [
    ['hits', 'Hits'],
    ['hotspots', 'Hotspot hits'],
    ['short', 'Short'],
    ['high', 'High'],
    ['low', 'Low'],
    ['wide', 'Wide'],
  ],
  variant(opts) {
    return ['zones', 'wind'].filter((k) => opts[k]).join('-') || 'regular';
  },
  create: createArchery,
};
