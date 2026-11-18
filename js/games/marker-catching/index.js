import { GAMES } from '../registry.js';
import { CONFIG } from './config.js';
import { createMarkerCatching } from './game.js';

export default {
  id: 'marker-catching',
  name: 'Marker Catching',
  tagline: 'Eight markers. Eight throws. Catch what you can.',
  goText: 'Catch!',
  passText: 'Still at the table!',
  failText: "You're leaving the table.",
  howTo: [
    'Markers get thrown at you from across the room, one color at a time.',
    'Click or tap a marker <strong>right as it reaches you</strong> to catch it.',
    'Grab too early or miss it, and your hand is busy for a moment. Don\'t spam.',
    `Catch ${CONFIG.passScore} or more of the 8 to survive.`,
  ],
  options: [
    { id: 'bullet', label: 'Bullet', desc: 'Much faster throws, but tighter and more predictable.' },
    { id: 'endless', label: 'Endless', desc: `Markers keep coming and speed up. ${CONFIG.endless.strikes} misses and you're out.` },
  ],
  variants: GAMES.find((g) => g.id === 'marker-catching').variants,
  statLabels: [
    ['caught', 'Caught'],
    ['missed', 'Missed'],
    ['bestStreak', 'Best streak'],
    ['early', 'Too early'],
    ['whiffs', 'Whiffs'],
  ],
  variant(opts) {
    return ['bullet', 'endless'].filter((k) => opts[k]).join('-') || 'regular';
  },
  create: createMarkerCatching,
};
