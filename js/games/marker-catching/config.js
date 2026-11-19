// ============================================================
// Marker Catching — every tunable number lives here.
// Times are in milliseconds unless the name says seconds.
// [a, b] means "a random value between a and b" for each throw.
// ============================================================
export const CONFIG = {
  throwsPerGame: 8,        // one throw per marker color
  passScore: 4,            // catches needed to "survive" (used by Competition Mode later)
  resolvePauseMs: 600,     // pause after a catch/miss before the next throw starts
  finishDelayMs: 800,      // pause after the last throw before the results screen

  // Memory mode: before the throws, Paul shows you 4 of the 8 colors: two worth
  // +2 if you catch them, two worth −1. Then you have to remember. Not with Endless.
  memory: {
    briefSec: 5,
    bonusPoints: 2,
    penaltyPoints: -1,
    passScore: 4,          // points (out of 8: 2 bonus × 2 + 4 normal) to survive
  },

  endless: {
    strikes: 3,              // misses allowed before the run ends
    speedRampPerCatch: 0.025, // throws get 2.5% faster per catch...
    maxSpeedMult: 1.6,        // ...up to 60% faster
    passScore: 10,
  },

  // The room, in meters. The camera (your eyes) is at x=0, y=0, z=0, looking toward +z.
  world: {
    eyeHeight: 1.15,       // you're sitting; the floor is this far below your eyes
    fovYDeg: 62,
    catchZ: 0.6,           // where your hands meet the marker (distance from your face)
    throwerZ: [5.0, 6.2],  // how far away the thrower stands
    backWallZ: 7.5,
  },

  // Real EXPO-ish marker size in meters.
  marker: { length: 0.14, width: 0.019 },

  // Regular throws: lots of variety.
  regular: {
    flightTimeSec: [0.85, 1.3],   // how long the marker is in the air
    arcHeightM: [0.15, 0.7],      // how high the arc rises above a straight line (meters)
    windupMs: [380, 520],         // the thrower's wind-up (your tell that a throw is coming)
    gapMs: [450, 1000],           // thrower walking to a new spot between throws
    catchWindowMs: 260,           // you can only catch in the last X ms before it reaches you
    targetSpreadX: 0.85,          // how far from center throws can land (0..1 of the screen)
    targetSpreadY: 0.75,
    throwerSpreadX: 0.8,          // how far the thrower roams left/right
    spinRadPerSec: [5, 15],       // tumble speed
    styles: { overhand: 0.4, sidearm: 0.3, underhand: 0.3 },
    // Now and then Paul throws a much faster or much slower one (not in Bullet).
    rare: {
      fastChance: 0.03,
      slowChance: 0.03,
      fast: { flightTimeSec: [0.5, 0.62], arcHeightM: [0.05, 0.22] },
      slow: { flightTimeSec: [1.6, 1.95], arcHeightM: [0.6, 1.0] },
    },
  },

  // Bullet: faster throws, tighter and more predictable than regular (but not a lot).
  bullet: {
    flightTimeSec: [0.47, 0.66],
    arcHeightM: [0.05, 0.3],      // flatter, line-drive throws
    windupMs: [260, 320],
    gapMs: [400, 650],
    catchWindowMs: 220,
    targetSpreadX: 0.55,
    targetSpreadY: 0.48,
    throwerSpreadX: 0.45,
    spinRadPerSec: [3, 9],
    styles: { overhand: 0.65, sidearm: 0.3, underhand: 0.05 },
  },

  catching: {
    hitPadding: 0.03,        // extra grab room around the marker, as a fraction of the screen's short side
    touchMinPaddingPx: 26,   // fingers are less precise than a mouse: at least this much grab room on touch
    fumbleCooldownMs: 250,   // after a bad grab your hand is busy for this long...
    fumbleStackMs: 200,      // ...plus this much more for every earlier bad grab on the same throw (stops spam-clicking; not shown)
    graceAfterPlaneMs: 40,   // tiny extra time after it passes your hands
  },
};
