// ============================================================
// Bowling — every tunable number lives here.
// Distances are meters, times are milliseconds unless noted.
// [a, b] means "a random value between a and b".
// ============================================================
export const CONFIG = {
  throws: 3,
  passScore: 4,          // points (out of 9) to survive in Regular
  hardPassScore: 3,      // ...and in Hard
  hardMaxPerThrow: 3,    // Hard: one throw scores at most 3, so the game max stays 9
  resetMs: 550,          // markers popping up in their new spots
  resolvePauseMs: 750,
  maxWaitMs: 3500,       // stop waiting for things to stop moving after this long
  finishDelayMs: 900,

  world: {
    fovYDeg: 46,         // zoomed in a bit so far-away markers aren't tiny
    eyeHeight: 1.15,     // crouched a bit so the floor is easy to see
    cyFrac: 0.2,         // horizon height on screen (lower = see more floor)
    backWallZ: 10,
    gravity: 9.8,
  },

  // The yellow-and-black school whiteboard eraser.
  eraser: {
    length: 0.16, width: 0.055, feltH: 0.018, handleH: 0.032,
    hitRadius: 0.08,       // how close its center must get to a marker to knock it
    drag: 0.12,            // heavier than foam: wind pushes it less
    landKeep: 0.55,        // speed kept when it first hits the floor
    bounce: 0.15,
    friction: 0.45,        // how quickly it slides to a stop
    spinRadPerSec: [6, 12],
  },

  marker: { length: 0.14, radius: 0.0095 },

  hold: { y: -0.4, z: 0.8, maxLiftM: 0.2 },

  // Flick -> throw (see shared/throwing.js). A lower, flatter throw than Archery.
  throw: {
    elevationDeg: 22,
    powerScale: 3.3,
    powerExp: 0.5,
    minSpeed: 2,
    maxSpeed: 10,
    minUpSpeed: 0.4,
    minDragFrac: 0.04,
    aimGain: 0.4,
    sampleMs: 90,
  },

  // Regular: three markers standing together like pins. New spot every throw.
  regular: {
    distance: [2.6, 5.2],
    offsetFrac: 0.45,     // how far left/right (fraction of what's visible)
    spacingX: 0.05,
    spacingZ: 0.065,
  },

  // Hard: three markers in separate spots. Knocked markers move; standing ones stay.
  hard: {
    minGap: 0.45,
    tiers: [
      { color: 'black', points: 1, distance: [2.3, 3.2], offsetFrac: 0.3 },
      { color: 'orange', points: 2, distance: [3.2, 4.3], offsetFrac: 0.5 },
      { color: 'purple', points: 3, distance: [4.3, 5.4], offsetFrac: 0.65 },
    ],
  },

  wind: {
    mph: [3, 10],
    headTailMix: 0.45,
    strength: 1.8,
    particlesPerMph: 6,
    visualSpeed: 1.8,
  },
};
