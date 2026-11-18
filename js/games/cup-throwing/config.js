// ============================================================
// Cup Throwing — every tunable number lives here.
// Distances are meters, times are milliseconds unless noted.
// [a, b] means "a random value between a and b".
// Meant to be one of the hardest games: aim for ~3 of 8 on average.
// ============================================================
export const CONFIG = {
  passScore: 3,           // markers in the cup (out of 8) to survive
  cupMoveMs: 600,         // Moving Cup: the cup sliding to its next spot
  resolvePauseMs: 600,
  maxWaitMs: 3000,
  finishDelayMs: 900,

  world: {
    fovYDeg: 46,         // zoomed in so the cup isn't tiny
    eyeHeight: 1.6,      // you're standing (Paul holds the cup at his hip)
    eyeHeightFloorCup: 1.15, // crouched a bit when the cup is on the floor
    cyFrac: 0.2,
    backWallZ: 10,
    gravity: 9.8,
  },

  // A 16 oz red solo cup.
  cup: {
    heldByPaul: true,     // Paul holds it out at his hip. false = it stands on the floor (original spec)
    holdHeight: 0.82,     // how high above the floor Paul holds the bottom of the cup
    rimRadius: 0.068,
    bottomRadius: 0.047,
    height: 0.12,
    inRadius: 0.058,      // marker center within this of the middle when crossing the rim = clean make
    rimZone: 0.03,        // just past the rim: hits the rim and might rattle in
    rattleInChance: 0.45, // best-case chance a rim hit drops in (less the further out it hits)
  },

  // Where the cup stands. Less spread than Bowling's markers.
  spot: {
    distance: [2.3, 3.2],
    offsetFrac: 0.35,
  },

  paul: { behindCup: 0.32, sideOffset: 0.12 }, // where Paul stands relative to the cup he's holding

  marker: { length: 0.14, width: 0.019, drag: 0.12, spinRadPerSec: [6, 14] },

  hold: { y: -0.33, z: 0.65, maxLiftM: 0.2 },

  // A high lob. powerExp is extra low (0.25) so small flick-speed
  // differences don't swing the distance much — the cup is a tiny target.
  throw: {
    elevationDeg: 48,
    powerScale: 3.49,           // tuned for Paul holding the cup (2.5 screens/s flick reaches the middle distance)
    powerScaleFloorCup: 3.28,   // ...and for a cup on the floor
    powerExp: 0.25,
    minSpeed: 2,
    maxSpeed: 8,
    minUpSpeed: 0.3,
    minDragFrac: 0.04,
    aimGain: 0.35,
    sampleMs: 90,
  },

  floor: { bounce: 0.25, friction: 3.0 /* m/s² of sliding slowdown */ },
};
