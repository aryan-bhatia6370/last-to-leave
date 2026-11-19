// ============================================================
// Cup Catching — every tunable number lives here.
// Distances are meters, times are milliseconds unless noted.
// [a, b] means "a random value between a and b".
// ============================================================
export const CONFIG = {
  throwsPerGame: 8,
  passScore: 4,            // markers still in the cup at the end (out of 8) to survive
  resolvePauseMs: 600,
  finishDelayMs: 900,

  endless: {
    missesInARow: 3,       // this many misses in a row ends the run
    capacity: 8,           // at 8 Paul empties the cup (they still count) and you keep going
    speedRampPerCatch: 0.02,
    maxSpeedMult: 1.5,
    passScore: 8,
  },

  world: {
    eyeHeight: 1.15,
    fovYDeg: 62,
    throwerZ: [3.6, 4.6],   // close enough that lobs drop down into the cup
    backWallZ: 7.5,
    sunElevationDeg: 78,   // midday sun: a falling marker's shadow lands almost right under it (natural depth cue)
  },

  // You hold the cup at hand height and move it around on a level plane:
  // mouse/finger left-right = left-right, up-down = farther from / closer to your body.
  hold: {
    rimY: -0.22,           // rim height relative to your eyes (about waist height)
    reachZ: [0.5, 2.0],    // closest (against your body) to farthest (arm out) the cup can go
    startZ: 0.95,
  },

  // A 16 oz red solo cup.
  cup: {
    rimRadius: 0.068,
    bottomRadius: 0.047,
    height: 0.12,
    inRadius: 0.07,        // marker center within this of the middle as it drops past the rim = in
    rimZone: 0.028,        // just outside the rim: bounces off the rim, might rattle in
    rattleInChance: 0.4,   // best-case chance a rim hit drops in
    crowdShrink: 0.25,     // a full cup's opening is this much smaller (markers already in the way)
    tiltTowardDeg: 16,     // you tip the cup a little toward an incoming marker...
    tiltStartSec: 0.6,     // ...starting this long before it arrives
  },

  // Your hand. The cup chases your mouse/finger (higher = snappier).
  follow: {
    smoothing: 24,
    touchOffsetPx: 70,     // on touch screens the cup sits above your finger so you can see it
  },

  // Jerking the cup around flings markers out (not random: it happens when the cup
  // speeds up or stops sharply, and more easily the fuller it is). Not in Endless,
  // where any spill ends the run.
  spill: {
    jerkAccel: 26,         // m/s² of sudden cup acceleration that flings one out with 1 marker in...
    perMarker: 1.6,        // ...this much less per extra marker in the cup...
    minAccel: 14,          // ...but never below this
    cooldownMs: 350,       // at most one marker per jerk
    safeSpeed: 4.0,        // (used for the cup's wobble look)
  },

  marker: { length: 0.14, width: 0.019 },

  // Throws: like Marker Catching, but lobbed higher so they come down into the cup.
  throws: {
    flightTimeSec: [1.25, 1.5], // slower and steadier than Marker Catching (0.85–1.3)
    arcHeightM: [0.9, 1.4], // high lobs: markers come down at ~50–60°, not flat
    windupMs: [380, 520],
    gapMs: [500, 1000],
    targetZ: [0.7, 1.6],   // where throws come down (distance from you), always inside your reach
    targetSpreadX: 0.65,   // how far left/right throws can land (0..1 of the reachable width)
    throwerSpreadX: 0.8,
    spinRadPerSec: [4, 12],
    styles: { overhand: 0.35, sidearm: 0.25, underhand: 0.4 },
  },
};
