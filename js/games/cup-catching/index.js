import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createCupCatching } from './game.js';

export default {
  id: 'cup-catching',
  name: 'Cup Catching',
  tagline: 'Hold the red solo cup. Catch the markers. Don\'t spill.',
  goText: 'Catch!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'You\'re holding a red solo cup. It <strong>follows your mouse or finger</strong>.',
    'Markers get lobbed at you. Get the cup under them so they drop in through the top.',
    'Too high and they smack the side; off-center and they bounce off the rim.',
    '<strong>Keep it steady:</strong> whipping the cup around can slosh markers back out, and that loses the catch.',
    `Have ${CONFIG.passScore}+ of the 8 in the cup at the end to survive.`,
  ],
  options: [
    { id: 'endless', label: 'Endless', desc: `Markers keep coming. ${CONFIG.endless.missesInARow} misses in a row, or a spill, and the run's over.` },
  ],
  variants: GAMES.find((g) => g.id === 'cup-catching').variants,
  statLabels: [
    ['caught', 'Caught'],
    ['spilled', 'Spilled'],
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
