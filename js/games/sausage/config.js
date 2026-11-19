// ============================================================
// The Sausage Game — every tunable number lives here.
// A whiteboard lies flat on the table (portrait). The "sausage" is a marker's
// ink refill. Drag back on it and let go to flick it up the board into the
// point bands; too hard and it slides off (0). 3 flicks, highest total wins.
// Meters / seconds unless noted.
// ============================================================
export const CONFIG = {
  flicks: 3,
  passScore: 5,            // total points (best possible 15) to survive
  resolvePauseMs: 900,
  finishDelayMs: 900,

  world: {
    eyeAboveBoard: 0.34,   // leaning over the table
    fovYDeg: 55,
    cyFrac: 0.12,          // horizon high on screen so the board fills the view
    tableTop: 0.74,        // the picnic table (m above the floor)
  },

  board: {
    width: 0.44,           // portrait: narrow side toward you
    length: 0.66,
    nearZ: 0.4,            // how far in front of you its near edge is
    startLen: 0.06,        // the little start box at the near end (not a scoring band)
    bands: [4, 6],         // how many point bands
    values: [-2, -1, 0, 1, 2, 3, 4, 5], // each band gets a different one
    sizeRange: [0.4, 2.2], // relative band sizes (big spread = some thin, some fat)
  },

  sausage: { length: 0.11, radius: 0.0068 },

  flick: {
    maxDragFrac: 0.38,     // dragging back this fraction of the screen height = full power
    minPower: 0.04,
    maxSpeed: 2.6,         // m/s at full power
    powerExp: 1.15,        // >1 = finer control at low power
    grabPx: 46,            // how close to the sausage you have to press (mouse)
    grabPxTouch: 64,
    spinGain: 9,           // rad/s of spin per (m/s × off-center grab)
    deflect: 0.14,         // rad the launch angle shifts for an off-center grab
  },

  physics: {
    friction: 3.1,         // m/s² of sliding slowdown (plastic on a whiteboard)
    curve: 0.12,           // how much spin bends its path
    spinDamp: 1.6,         // spin dies off per second
    stopSpeed: 0.015,
    fallSec: 0.6,          // falling off the edge
  },

  // computer players (Competition): chance per flick of each result, before skill
  bots: { pmf: { 5: 0.13, 4: 0.14, 3: 0.16, 2: 0.16, 1: 0.14, 0: 0.15, '-1': 0.07, '-2': 0.05 } },
};
