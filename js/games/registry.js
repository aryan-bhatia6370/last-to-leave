// Every minigame on the site, in menu order. A game with `load` is playable;
// the rest show as "Coming in Phase N" on the menu. `variants` lists every
// mode combination (used by Records without loading the game itself).
// `rv` = records version: bump it when a game changes enough that old best
// scores aren't comparable any more (old bests are then ignored, here and in the cloud).
export const GAMES = [
  {
    id: 'marker-catching',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'bullet', label: 'Bullet' }, { id: 'endless', label: 'Endless' }, { id: 'bullet-endless', label: 'Bullet + Endless' }],
    name: 'Marker Catching',
    color: 'red',
    blurb: 'Eight markers get thrown your way. Catch as many as you can.',
    phase: 1,
    load: () => import('./marker-catching/index.js'),
  },
  {
    id: 'pictionary',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'mine', label: 'With my drawings' }],
    name: 'Pictionary',
    color: 'black',
    blurb: 'Guess the bad whiteboard sketch before time runs out.',
    phase: 5,
    load: () => import('./pictionary/index.js'),
  },
  {
    id: 'equations',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }],
    name: 'Equations',
    color: 'blue',
    blurb: 'The board flips. Solve the problem in your head, fast.',
    phase: 5,
    load: () => import('./equations/index.js'),
  },
  {
    id: 'archery',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'wind', label: 'Wind' }, { id: 'zones', label: 'Hotspots' }, { id: 'zones-wind', label: 'Hotspots + Wind' }],
    name: 'Archery',
    color: 'green',
    blurb: 'Throw foam Nevada, Wyoming and Connecticut at a whiteboard.',
    phase: 2,
    load: () => import('./archery/index.js'),
  },
  {
    id: 'bowling',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'hard', label: 'Hard' }, { id: 'wind', label: 'Wind' }, { id: 'hard-wind', label: 'Hard + Wind' }],
    name: 'Bowling',
    color: 'orange',
    blurb: 'Knock down standing markers with a whiteboard eraser.',
    phase: 3,
    load: () => import('./bowling/index.js'),
  },
  {
    id: 'pauls-pocket',
    rv: 1,
    variants: [{ id: 'regular', label: 'Regular' }],
    name: "Paul's Pocket",
    color: 'brown',
    blurb: 'Pick a marker. Paul scrambles his pocket. Pray.',
    phase: 6,
    load: () => import('./pauls-pocket/index.js'),
  },
  {
    id: 'cup-catching',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'endless', label: 'Endless' }],
    name: 'Cup Catching',
    color: 'pink',
    blurb: 'Catch thrown markers in a red solo cup without spilling.',
    phase: 4,
    load: () => import('./cup-catching/index.js'),
  },
  {
    id: 'cup-throwing',
    rv: 2,
    variants: [{ id: 'regular', label: 'Regular' }, { id: 'moving', label: 'Moving Cup' }],
    name: 'Cup Throwing',
    color: 'purple',
    blurb: 'Toss all eight markers into a red solo cup. Good luck.',
    phase: 3,
    load: () => import('./cup-throwing/index.js'),
  },
];

/** Records version of a game (1 when unknown, e.g. 'competition'). */
export const recordsVersion = (gameId) => GAMES.find((g) => g.id === gameId)?.rv ?? 1;
