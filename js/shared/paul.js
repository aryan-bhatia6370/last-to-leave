// Paul: the show's host. He walks around running the events, throws the
// markers, holds the whiteboard and the cup. This draws him in the 3D games.
// (Paul's Pocket has its own close-up drawing of his hand and khakis.)
//
// His look (from the user's reference photos): fair skin, short messy dark
// brown hair, school uniform: white polo, navy lanyard, khaki trousers.

import { line3, fillPoly } from './scene3d.js';
import { add, sub, lerp3, clamp } from './vec3.js';

export const PAUL = {
  skin: '#f2c9a8',
  skinShade: '#d9a98a',
  khaki: '#c8b28a',
  khakiShade: '#a8946c',
  shirt: '#f2f2ee',      // white uniform polo
  shirtShade: '#cfcfc8',
  lanyard: '#1f3a8a',    // navy lanyard
  hair: '#3a2a1f',       // dark brown
  shoe: '#2b2b2e',
  belt: '#3e2c1e',
};

// Heights above the floor (m).
const H = { ankle: 0.08, knee: 0.5, hip: 0.95, belt: 0.98, shoulder: 1.43, neck: 1.5, head: 1.64 };

/** Paul's default hand position (world) when his arm hangs at his side. side = +1 or -1. */
export function paulRestHand(p, side) {
  return toWorld(p, side * 0.25, H.hip - 0.07 + Math.abs(Math.sin(p.walk || 0)) * 0.02 * (p.moving || 0), -0.02 - side * Math.sin(p.walk || 0) * 0.08 * (p.moving || 0));
}

/** Local (x right, y up, z toward Paul's back) -> world. Paul faces -z (toward you) when yaw = 0. */
function toWorld(p, lx, ly, lz) {
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  return [p.x + lx * c + lz * s, p.floorY + ly, p.z - lx * s + lz * c];
}

function elbowFor(shoulder, hand, out) {
  const mid = lerp3(shoulder, hand, 0.5);
  const d = Math.hypot(...sub(hand, shoulder));
  const bend = Math.max(0, 0.6 - d);
  return add(mid, [out[0] * bend * 0.6, -bend * 0.45, out[2] * bend * 0.6 + bend * 0.25]);
}

function drawArm(ctx, cam, p, side, hand) {
  const shoulder = toWorld(p, side * 0.2, H.shoulder, 0);
  const out = sub(toWorld(p, side, 0, 0), toWorld(p, 0, 0, 0));
  const elbow = elbowFor(shoulder, hand, out);
  const sleeveEnd = lerp3(shoulder, elbow, 0.55);
  line3(ctx, cam, shoulder, sleeveEnd, 0.105, PAUL.shirt);
  line3(ctx, cam, sleeveEnd, elbow, 0.075, PAUL.skin);
  line3(ctx, cam, elbow, hand, 0.068, PAUL.skin);
  drawPaulHand(ctx, cam, hand);
}

/** A hand (draw it again after an object to show fingers wrapped in front). */
export function drawPaulHand(ctx, cam, at, radius = 0.045) {
  const hp = cam.project(at);
  ctx.fillStyle = PAUL.skin;
  ctx.strokeStyle = 'rgba(120,70,40,0.45)';
  ctx.lineWidth = Math.max(0.6, hp.s * 0.004);
  ctx.beginPath();
  ctx.arc(hp.x, hp.y, radius * hp.s, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Draw Paul.
 * p = { x, z, floorY, yaw, walk, moving, leftHand, rightHand }
 *   rightHand / leftHand: world positions (null = hanging at his side).
 *   "right" here means screen-right when he faces you (+x side).
 */
export function drawPaul(ctx, cam, p) {
  const swing = Math.sin(p.walk || 0) * 0.14 * (p.moving || 0);
  const bob = Math.abs(Math.sin(p.walk || 0)) * 0.025 * (p.moving || 0);
  const W = (lx, ly, lz = 0) => toWorld(p, lx, ly + bob, lz);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // shadow
  const sh = cam.project([p.x, p.floorY, p.z]);
  ctx.fillStyle = 'rgba(40,30,15,0.18)';
  ctx.beginPath();
  ctx.ellipse(sh.x, sh.y, 0.34 * sh.s, 0.07 * sh.s, 0, 0, Math.PI * 2);
  ctx.fill();

  // legs: khaki trousers + shoes
  for (const side of [-1, 1]) {
    const sw = side * swing;
    const hip = W(side * 0.1, H.hip);
    const knee = W(side * 0.11, H.knee, sw * 0.5);
    const ankle = toWorld(p, side * 0.12, H.ankle, sw);
    line3(ctx, cam, hip, knee, 0.155, PAUL.khaki);
    line3(ctx, cam, knee, ankle, 0.135, PAUL.khaki);
    const heel = toWorld(p, side * 0.12, 0.04, sw + 0.06);
    const toe = toWorld(p, side * 0.13, 0.04, sw - 0.13);
    line3(ctx, cam, heel, toe, 0.09, PAUL.shoe);
  }
  // crotch seam fill so the trousers read as one piece
  fillPoly(ctx, [W(-0.17, H.belt), W(0.17, H.belt), W(0.1, H.hip - 0.12), W(-0.1, H.hip - 0.12)].map((q) => cam.project(q)), PAUL.khaki);

  // arms behind the body (hand farther from the camera than the shoulder)
  const hands = {
    1: p.rightHand || paulRestHand(p, 1),
    '-1': p.leftHand || paulRestHand(p, -1),
  };
  const shoulderZ = (side) => toWorld(p, side * 0.2, H.shoulder, 0)[2];
  const behind = [1, -1].filter((side) => hands[side][2] > shoulderZ(side) + 0.05);
  for (const side of behind) drawArm(ctx, cam, p, side, hands[side]);

  // torso (shirt) + belt
  fillPoly(ctx, [W(-0.18, H.belt - 0.02), W(0.18, H.belt - 0.02), W(0.21, H.shoulder + 0.03), W(-0.21, H.shoulder + 0.03)].map((q) => cam.project(q)), PAUL.shirt, PAUL.shirtShade, 1);
  line3(ctx, cam, W(-0.175, H.belt), W(0.175, H.belt), 0.045, PAUL.belt);
  // collar
  fillPoly(ctx, [W(-0.07, H.shoulder + 0.03), W(0.07, H.shoulder + 0.03), W(0, H.shoulder - 0.06)].map((q) => cam.project(q)), PAUL.shirtShade);

  // navy lanyard around his neck with an ID card
  line3(ctx, cam, W(-0.06, H.shoulder + 0.02, -0.01), W(-0.01, H.shoulder - 0.2, -0.02), 0.012, PAUL.lanyard);
  line3(ctx, cam, W(0.06, H.shoulder + 0.02, -0.01), W(0.01, H.shoulder - 0.2, -0.02), 0.012, PAUL.lanyard);
  fillPoly(ctx, [W(-0.035, H.shoulder - 0.19, -0.03), W(0.035, H.shoulder - 0.19, -0.03), W(0.035, H.shoulder - 0.29, -0.03), W(-0.035, H.shoulder - 0.29, -0.03)].map((q) => cam.project(q)), '#fafafa', 'rgba(0,0,0,0.3)', 0.8);

  // neck + head
  line3(ctx, cam, W(0, H.shoulder), W(0, H.neck + 0.03), 0.08, PAUL.skin);
  const head = cam.project(W(0, H.head));
  const r = 0.11 * head.s;
  ctx.fillStyle = PAUL.skin;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,70,40,0.35)';
  ctx.lineWidth = Math.max(0.6, r * 0.04);
  ctx.stroke();
  // hair
  const facing = Math.cos(p.yaw || 0);
  ctx.fillStyle = PAUL.hair;
  ctx.beginPath();
  ctx.arc(head.x, head.y, r * 1.04, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(head.x + r * 0.2, head.y - r * (0.25 + 0.2 * (1 - facing)), head.x - r * 1.03, head.y - r * 0.05);
  ctx.fill();
  // face (only when roughly facing you)
  if (facing > 0.35) {
    const off = Math.sin(p.yaw || 0) * r * 0.4;
    ctx.fillStyle = '#2b2b30';
    for (const sx of [-0.35, 0.35]) {
      ctx.beginPath();
      ctx.arc(head.x + sx * r - off, head.y + r * 0.08, Math.max(0.8, r * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(90,40,30,0.7)';
    ctx.lineWidth = Math.max(0.8, r * 0.07);
    ctx.beginPath();
    ctx.arc(head.x - off, head.y + r * 0.3, r * 0.3, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
  }

  // arms in front of the body
  for (const side of [1, -1]) if (!behind.includes(side)) drawArm(ctx, cam, p, side, hands[side]);
  ctx.restore();
}

export { clamp };
