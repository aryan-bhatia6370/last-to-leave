import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createCupCatching } from './game.js';

export default {
  id: 'cup-catching',
  name: 'Cup Catching',
  tagline: 'Hold the red solo cup. Get under the markers. Catch them all.',
  goText: 'Catch!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'You\'re holding a red solo cup out in front of you. It <strong>follows your mouse or finger</strong>, left/right and up/down.',
    'Paul lobs markers up high. Get the cup under them so they drop in through the top. Right before one arrives, a <strong>soft ring</strong> shows roughly where it\'s coming down.',
    'Too high and they smack the side; off-center and they bounce off the rim.',
    `Have ${CONFIG.passScore}+ of the 8 in the cup at the end to survive.`,
  ],
  options: [
    { id: 'endless', label: 'Endless', desc: `Markers keep coming. At ${CONFIG.endless.capacity} Paul empties your cup (they still count). ${CONFIG.endless.missesInARow} misses in a row and the run's over.` },
  ],
  variants: GAMES.find((g) => g.id === 'cup-catching').variants,
  statLabels: [
    ['caught', 'Caught'],
    ['rimOuts', 'Bounced out'],
    ['hitSide', 'Hit the side'],
    ['missed', 'Missed'],
    ['bestStreak', 'Best streak'],
  ],
  variant(opts) {
    return opts.endless ? 'endless' : 'regular';
  },
  create: createCupCatching,
};
