// ============================================================
// Archery — every tunable number lives here.
// Distances are meters, times are milliseconds unless noted.
// [a, b] means "a random value between a and b".
// ============================================================
import { COLOR_BY_ID } from '../../shared/colors.js';

export const CONFIG = {
  passScore: 2,            // hits (out of 3) needed to "survive"

  // Hotspots mode: each throw the board shows a bonus zone (a small circle, a
  // corner, a stripe, two dots, or half the board). Hit the board = 1 point,
  // hit inside the zone = 2. Never more than half the board is a bonus.
  hotspots: {
    passScore: 3,          // points (out of 6) to survive
    zonePoints: 2,
    patterns: { bull: 0.25, corner: 0.25, pair: 0.2, stripe: 0.15, half: 0.15 },
    bullRadius: 0.22,      // circle radii are fractions of the board's height
    cornerRadius: 0.2,
    pairRadius: 0.15,
    stripeWidth: 0.25,     // fraction of the board's width
  },
  boardMoveMs: 650,        // the whiteboard sliding to its new spot between throws
  resolvePauseMs: 700,     // pause after a throw is decided and settled
  maxResolveWaitMs: 1500,  // don't wait longer than this for a piece to stop bouncing
  finishDelayMs: 900,

  world: {
    fovYDeg: 60,
    eyeHeight: 1.6,        // you're standing; the floor is this far below your eyes
    backWallZ: 10,
    gravity: 9.8,
  },

  // Thrown in this order. size = longest side (m). hitRadius = how far past the
  // board's edge the piece's center can be and still count (bigger piece = easier).
  // drag = how much the air (and the wind) slows/pushes it — foam is light.
  pieces: [
    { id: 'nevada', name: 'Nevada', color: COLOR_BY_ID.green.hex, size: 0.24, thickness: 0.022, hitRadius: 0.1, drag: 0.35 },
    { id: 'wyoming', name: 'Wyoming', color: COLOR_BY_ID.purple.hex, size: 0.17, thickness: 0.02, hitRadius: 0.07, drag: 0.35 },
    { id: 'connecticut', name: 'Connecticut', color: COLOR_BY_ID.red.hex, size: 0.1, thickness: 0.018, hitRadius: 0.04, drag: 0.35 },
  ],

  // Where the piece sits in your hand before the throw.
  hold: { y: -0.42, z: 0.8, maxLiftM: 0.22 },

  // Flick -> throw. Power is in screen-heights per second of upward flick.
  // speed = powerScale * power^powerExp. powerExp < 1 softens it so small
  // differences in flick speed don't swing the throw too much.
  throw: {
    elevationDeg: 30,
    powerScale: 3.7,       // was 4.2: throwing far takes a harder flick (playtest: too easy to overshoot)
    powerExp: 0.5,
    minSpeed: 3,
    maxSpeed: 13,
    minUpSpeed: 0.6,       // slower flicks than this don't throw (the piece goes back to your hand)
    minDragFrac: 0.04,     // ...and so do drags shorter than this fraction of the screen
    aimGain: 0.5,          // how strongly left/right flick angle steers the throw
    sampleMs: 90,          // flick speed is measured over the last X ms before release
    spinRadPerSec: [5, 11],
  },

  // Paul holds up a handheld classroom whiteboard. It's somewhere new every throw.
  board: {
    distance: [2.5, 4.7],     // a little closer than before (playtest: ~15% easier)
    centerY: [-0.3, 0.3],     // height of the board's center relative to your eyes (Paul holds it chest-high to overhead)
    maxOffsetX: 1.4,          // left/right
    angleChance: 0.5,         // chance he turns it sideways
    yawDeg: [18, 50],
    tiltChance: 0.3,          // chance he tips it forward/back
    tiltDeg: [-22, 18],
    width: [0.56, 0.72],      // a handheld board, not a big wall board (was 0.5–0.65)
    aspect: 0.72,             // height / width
    frame: 0.018,
  },

  paul: { behindBoard: 0.3 }, // how far behind the board Paul stands

  bounce: { board: 0.3, floor: 0.25, floorFriction: 0.6 },

  wind: {
    mph: [3, 10],          // each throw's wind speed
    headTailMix: 0.45,     // 0 = always straight left/right; higher = more head/tail wind
    strength: 2.8,         // how hard wind pushes (was 1.8, felt like nothing). 10 mph drifts a throw ~0.9 m sideways at 5 m, 5 mph ~0.45 m
    particlesPerMph: 6,    // how many streaks you see
    visualSpeed: 1.8,      // streaks move faster than the real wind so they read clearly
  },
};
