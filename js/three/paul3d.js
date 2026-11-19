// People in 3D. createPaul3D() is the host: school uniform (white polo, navy
// lanyard + ID card, khaki trousers, dark shoes), fair skin, short messy
// dark-brown hair. createPerson3D(look) makes anyone else (the Members use
// placeholder looks until the user sends their pictures).
// Posed every frame:
//   { x, z, floorY, yaw, walk, moving, sit (0..1), leftHand, rightHand, bulge }  (game coordinates)
//   optional: rightPole (which way the right elbow bends), rightArmOpacity (0..1, see-through arm),
//   opacity (0..1, the whole person see-through), flinch (0..1, just got hit)
// Hands are world positions; null = resting (at his side, or on his lap when seated).

import * as THREE from 'three';
import { paulRestHand } from '../shared/paul.js';
import { weaveBump } from './textures.js';

const H = { ankle: 0.085, knee: 0.5, hip: 0.95, belt: 0.98, shoulder: 1.43, head: 1.64 };
const UP = new THREE.Vector3(0, 1, 0);

const toThree = (p, out = new THREE.Vector3()) => out.set(p[0], p[1], -p[2]);

function toWorld(p, lx, ly, lz) {
  const c = Math.cos(p.yaw || 0), s = Math.sin(p.yaw || 0);
  return [p.x + lx * c + lz * s, p.floorY + ly, p.z - lx * s + lz * c];
}

// Arms have fixed bone lengths (no more stretching). If a hand target is out of
// reach the arm straightens toward it (a little give, then it just falls short).
const ARM = { upper: 0.29, fore: 0.31, give: 1.06 };

/** Two-bone IK: returns { elbow, hand } with fixed segment lengths. pole = which way the elbow points. */
function solveArm(shoulder, target, pole) {
  const L1 = ARM.upper, L2 = ARM.fore;
  let dir = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]];
  let d = Math.hypot(...dir) || 1e-6;
  dir = dir.map((v) => v / d);
  const maxD = (L1 + L2) * 0.999;
  let s = 1;
  if (d > maxD) { s = Math.min(ARM.give, d / maxD); d = Math.min(d, maxD * s); }
  const l1 = L1 * s, l2 = L2 * s;
  const hand = [shoulder[0] + dir[0] * d, shoulder[1] + dir[1] * d, shoulder[2] + dir[2] * d];
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2];
  let perp = [pole[0] - dir[0] * pd, pole[1] - dir[1] * pd, pole[2] - dir[2] * pd];
  const pl = Math.hypot(...perp) || 1;
  perp = perp.map((v) => v / pl);
  const elbow = [shoulder[0] + dir[0] * a + perp[0] * h, shoulder[1] + dir[1] * a + perp[1] * h, shoulder[2] + dir[2] * a + perp[2] * h];
  return { elbow, hand };
}

const lerpN = (a, b, t) => a + (b - a) * t;
const lerpP = (a, b, t) => [lerpN(a[0], b[0], t), lerpN(a[1], b[1], t), lerpN(a[2], b[2], t)];

export const PAUL_LOOK = { skin: 0xe9c4a6, shirt: 0xf1f1ec, pants: 0xbfa880, hair: 0x2f2219, shoe: 0x1f1f22, lanyard: true };

export function createPaul3D() {
  return createPerson3D(PAUL_LOOK);
}

/**
 * look: { skin, shirt, pants, hair, shoe, lanyard (bool) } as 0xRRGGBB numbers
 * extras: shirtless (bool), muscle (1 = normal, bigger = bulkier arms/chest), heightScale (1 = normal), sigma (stern face + smirk)
 * character looks (Members, from reference photos; colors stay their marker color):
 *   hairStyle: 'default' | 'curly' | 'fringe' | 'curtain' | 'spiky' | 'shaggy' | 'messy' | 'mop'
 *   top: 'polo' | 'hoodie' (pullover, front pocket) | 'zipHoodie' (closed) | 'openHoodie' (open over an inner shirt)
 *   inner (color of the shirt under an open hoodie), shorts (bool), glasses (bool), glassesColor,
 *   mustache (bool), goatee (bool), backpack (color), lanyardColor, idCard (bool), width (body width, 1 = normal)
 */
export function createPerson3D(look = PAUL_LOOK) {
  const L0 = { ...PAUL_LOOK, lanyard: false, ...look };
  const group = new THREE.Group();
  const bump = weaveBump([6, 6]);
  const mats = {
    skin: new THREE.MeshPhysicalMaterial({ color: L0.skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color(0xffd9c2), sheenRoughness: 0.6 }),
    polo: new THREE.MeshStandardMaterial({ color: L0.shirt, roughness: 0.88, bumpMap: bump, bumpScale: 0.6 }),
    khaki: new THREE.MeshStandardMaterial({ color: L0.pants, roughness: 0.92, bumpMap: bump, bumpScale: 0.5 }),
    hair: new THREE.MeshStandardMaterial({ color: L0.hair, roughness: 0.72 }),
    shoe: new THREE.MeshStandardMaterial({ color: L0.shoe, roughness: 0.45 }),
    belt: new THREE.MeshStandardMaterial({ color: 0x2a1e16, roughness: 0.5 }),
    lanyard: new THREE.MeshStandardMaterial({ color: L0.lanyardColor ?? 0x1f3a8a, roughness: 0.6 }),
    card: new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.35 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.25 }),
    brow: new THREE.MeshStandardMaterial({ color: 0x2f2219, roughness: 0.8 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xc98f86, roughness: 0.5 }),
    sock: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.9 }),
    inner: new THREE.MeshStandardMaterial({ color: L0.inner ?? 0x1c1c20, roughness: 0.88 }),
    pocket: new THREE.MeshStandardMaterial({ color: new THREE.Color(L0.shirt).multiplyScalar(0.8), roughness: 0.9 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.4, metalness: 0.3 }),
    frames: new THREE.MeshStandardMaterial({ color: L0.glassesColor ?? 0x1a1a1c, roughness: 0.35, metalness: 0.2 }),
    pack: new THREE.MeshStandardMaterial({ color: L0.backpack ?? 0x2a2a2e, roughness: 0.8 }),
  };
  const mesh = (geo, mat, parent = group) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const cyl = new THREE.CylinderGeometry(1, 1, 1, 18);
  const sph = new THREE.SphereGeometry(1, 24, 16);

  // ---- body (rigid: hips, torso, head) ----
  const body = new THREE.Group();
  group.add(body);
  const lathe = (pts) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32);
  const hips = mesh(lathe([[0, -0.115], [0.16, -0.115], [0.172, -0.06], [0.17, 0.0], [0, 0.0]]), mats.khaki, body);
  const WIDE = L0.width || 1;
  hips.scale.set(WIDE, 1, 0.68);
  // front pocket openings on the khakis, and a bulge for when his hand is in one
  const slitMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2a, roughness: 0.95 });
  for (const sx of [-1, 1]) {
    const slit = mesh(new THREE.BoxGeometry(0.007, 0.105, 0.004), slitMat, body);
    slit.position.set(sx * 0.118, -0.085, 0.083);
    slit.rotation.set(0, sx * 0.55, sx * 0.55);
  }
  const bulge = mesh(sph, mats.khaki, body);
  bulge.position.set(0.105, -0.15, 0.08);
  bulge.visible = false;
  const belt = mesh(new THREE.CylinderGeometry(0.173, 0.173, 0.035, 32, 1, true), mats.belt, body);
  belt.scale.set(1, 1, 0.69);
  const MUSCLE = L0.muscle || 1;
  if (L0.shirtless) mats.polo = mats.skin; // no shirt: torso and sleeves are skin
  const torso = mesh(lathe([[0, 0.0], [0.168, 0.0], [0.172, 0.08], [0.178, 0.22], [0.195, 0.34], [0.2, 0.42], [0.18, 0.47], [0.1, 0.5], [0.05, 0.505], [0, 0.505]]), mats.polo, body);
  // a broader, deeper chest for a muscular build (narrow waist stays)
  torso.scale.set((1 + (MUSCLE - 1) * 0.35) * WIDE, 1, (0.62 + (MUSCLE - 1) * 0.12) * (1 + (WIDE - 1) * 0.6));
  if (L0.shirtless) {
    const zAt = (r) => r * torso.scale.z;
    // pecs
    for (const sx of [-1, 1]) {
      const pec = mesh(sph, mats.skin, body);
      pec.scale.set(0.074, 0.046, 0.03);
      pec.position.set(sx * 0.072, 0.372, zAt(0.198) - 0.008);
    }
    // six pack: 3 rows of 2
    for (let row = 0; row < 3; row++) {
      for (const sx of [-1, 1]) {
        const ab = mesh(sph, mats.skin, body);
        ab.scale.set(0.03, 0.03, 0.013);
        const y = 0.27 - row * 0.068;
        ab.position.set(sx * 0.034, y, zAt(0.18) - 0.004);
      }
    }
    // the line down the middle and the V at the hips
    const line = mesh(new THREE.BoxGeometry(0.004, 0.22, 0.004), new THREE.MeshStandardMaterial({ color: 0xa8846c, roughness: 0.8 }), body);
    line.position.set(0, 0.2, zAt(0.18) + 0.006);
  }
  // collar + placket
  const collar = mesh(new THREE.TorusGeometry(0.062, 0.014, 10, 28), mats.polo, body);
  const TOP = L0.top || 'polo';
  collar.visible = !L0.shirtless && TOP === 'polo';
  collar.rotation.x = Math.PI / 2 - 0.25;
  collar.position.set(0, 0.5, 0.012);
  const placket = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.006), mats.polo, body);
  placket.visible = !L0.shirtless && TOP === 'polo';
  placket.position.set(0, 0.42, 0.118);
  // lanyard + ID card
  for (const sx of (L0.lanyard ? [-1, 1] : [])) {
    const strap = mesh(cyl, mats.lanyard, body);
    strap.scale.set(0.006, 0.24, 0.006);
    strap.position.set(sx * 0.035, 0.38, 0.115);
    strap.rotation.z = sx * 0.14;
    strap.rotation.x = -0.12;
  }
  if (L0.lanyard && L0.idCard !== false) {
    const card = mesh(new THREE.BoxGeometry(0.054, 0.085, 0.003), mats.card, body);
    card.position.set(0, 0.235, 0.128);
    card.rotation.x = -0.08;
  }
  // neck + head
  const neck = mesh(cyl, mats.skin, body);
  neck.scale.set(0.046 * (1 + (MUSCLE - 1) * 0.5), 0.12, 0.046 * (1 + (MUSCLE - 1) * 0.5));
  neck.position.set(0, 0.56, 0);
  const head = new THREE.Group();
  head.position.set(0, H.head - H.belt, 0);
  body.add(head);
  const skull = mesh(sph, mats.skin, head);
  skull.scale.set(0.087, 0.118, 0.099);
  // hair: a cap tilted back so the hairline sits on the forehead, fuller at the back
  const hairCap = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mats.hair, head);
  hairCap.scale.set(0.095, 0.118, 0.107);
  hairCap.position.set(0, 0.03, -0.012);
  hairCap.rotation.x = -0.42;
  const hairBack = mesh(sph, mats.hair, head);
  hairBack.scale.set(0.09, 0.085, 0.085);
  hairBack.position.set(0, 0.0, -0.03);
  // a bit of messy fringe falling onto the forehead
  const fringe = mesh(new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45), mats.hair, head);
  fringe.scale.set(0.078, 0.04, 0.05);
  fringe.position.set(0.01, 0.07, 0.058);
  fringe.rotation.set(0.9, 0, -0.12);
  for (const sx of [-1, 1]) {
    const ear = mesh(sph, mats.skin, head);
    ear.scale.set(0.012, 0.026, 0.018);
    ear.position.set(sx * 0.088, 0, -0.002);
    const eye = mesh(sph, mats.eye, head);
    eye.scale.set(0.0095, 0.007, 0.006);
    eye.position.set(sx * 0.033, 0.014, 0.093);
    const brow = mesh(new THREE.BoxGeometry(0.03, 0.005, 0.006), mats.brow, head);
    brow.position.set(sx * 0.034, 0.034, 0.094);
    brow.rotation.z = -sx * 0.08;
    if (L0.sigma) { // stern: brows down toward the middle, eyes narrowed
      brow.scale.set(1.1, 1.6, 1);
      brow.position.y = 0.029;
      brow.rotation.z = sx * 0.28;
      eye.scale.y = 0.0042;
    }
  }
  const nose = mesh(sph, mats.skin, head);
  nose.scale.set(0.014, 0.026, 0.02);
  nose.position.set(0, -0.005, 0.1);
  const lips = mesh(sph, mats.lip, head);
  lips.scale.set(0.022, 0.006, 0.008);
  lips.position.set(0, -0.042, 0.094);
  if (L0.sigma) {
    // a one-sided smirk and a strong square jaw
    lips.rotation.z = 0.16;
    lips.position.x = 0.004;
    const jaw = mesh(sph, mats.skin, head);
    jaw.scale.set(0.082, 0.04, 0.078);
    jaw.position.set(0, -0.07, 0.012);
  }

  // ---- character details (hair, glasses, facial hair, hoodies, backpack) ----
  const HAIR = L0.hairStyle || 'default';
  if (HAIR !== 'default') {
    hairCap.visible = HAIR === 'fringe' || HAIR === 'curtain' || HAIR === 'spiky';
    hairBack.visible = HAIR !== 'spiky';
    fringe.visible = false;
    const blob = (x, y, z, sx, sy, sz, rx = 0, rz = 0) => { const m = mesh(sph, mats.hair, head); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); return m; };
    if (HAIR === 'curly') {
      // tall curly mop: lots of little curls piled on top and around the sides
      for (let i = 0; i < 46; i++) {
        const a = (i / 46) * Math.PI * 2 * 3.7, ring = i / 46;
        const r = 0.065 + Math.sin(i * 1.7) * 0.012;
        blob(Math.cos(a) * r * (1 - ring * 0.5), 0.05 + ring * 0.07 + Math.sin(i * 2.3) * 0.012, Math.sin(a) * r * (1 - ring * 0.5) - 0.012, 0.03, 0.028, 0.03);
      }
      blob(0, 0.06, -0.01, 0.092, 0.07, 0.095);
    } else if (HAIR === 'fringe') {
      // straight hair with a full fringe across the forehead
      blob(0, 0.058, 0.055, 0.084, 0.032, 0.05, 0.5);
      blob(-0.07, 0.01, 0.02, 0.025, 0.05, 0.05);
      blob(0.07, 0.01, 0.02, 0.025, 0.05, 0.05);
    } else if (HAIR === 'curtain') {
      // medium-length, parted in the middle, falling past the ears
      blob(-0.045, 0.05, 0.05, 0.05, 0.04, 0.045, 0.6, 0.35);
      blob(0.045, 0.05, 0.05, 0.05, 0.04, 0.045, 0.6, -0.35);
      blob(-0.082, -0.01, 0.0, 0.026, 0.075, 0.07);
      blob(0.082, -0.01, 0.0, 0.026, 0.075, 0.07);
      blob(0, -0.01, -0.05, 0.088, 0.09, 0.06);
    } else if (HAIR === 'spiky') {
      // short black hair pushed up into a few spikes
      for (let i = 0; i < 7; i++) {
        const cone = mesh(new THREE.ConeGeometry(0.018, 0.05, 8), mats.hair, head);
        const a = -0.9 + i * 0.3;
        cone.position.set(Math.sin(a) * 0.05, 0.11 + Math.cos(i) * 0.006, 0.02 - Math.abs(a) * 0.02);
        cone.rotation.set(-0.25, 0, -a * 0.6);
      }
    } else if (HAIR === 'shaggy' || HAIR === 'mop' || HAIR === 'messy') {
      // big shaggy volume, covering the ears, with a heavy messy fringe
      const big = HAIR === 'messy' ? 1.12 : HAIR === 'mop' ? 0.95 : 1.05;
      blob(0, 0.05, -0.008, 0.1 * big, 0.08 * big, 0.105 * big);
      blob(-0.07, 0.0, 0.0, 0.035, 0.065, 0.075);
      blob(0.07, 0.0, 0.0, 0.035, 0.065, 0.075);
      for (let i = 0; i < 5; i++) blob(-0.05 + i * 0.025, 0.055 - Math.abs(i - 2) * 0.008, 0.07, 0.022, 0.035, 0.02, 0.4, (i - 2) * 0.25);
      if (HAIR === 'messy') for (let i = 0; i < 9; i++) blob(Math.sin(i * 2.1) * 0.06, 0.1 + Math.cos(i * 1.3) * 0.015, Math.cos(i * 2.1) * 0.05 - 0.01, 0.03, 0.022, 0.03, i * 0.4, i * 0.7);
    }
  }
  if (L0.glasses) {
    for (const sx of [-1, 1]) {
      const rim = mesh(new THREE.TorusGeometry(0.022, 0.0032, 6, 20), mats.frames, head);
      rim.scale.set(1.15, 0.8, 1);
      rim.position.set(sx * 0.034, 0.014, 0.103);
      const arm = mesh(new THREE.BoxGeometry(0.003, 0.003, 0.09), mats.frames, head);
      arm.position.set(sx * 0.084, 0.018, 0.058);
    }
    const bridge = mesh(new THREE.BoxGeometry(0.02, 0.003, 0.003), mats.frames, head);
    bridge.position.set(0, 0.018, 0.104);
  }
  if (L0.mustache) {
    const m = mesh(sph, mats.hair, head);
    m.scale.set(0.024, 0.0045, 0.006);
    m.position.set(0, -0.03, 0.097);
  }
  if (L0.goatee) {
    const g = mesh(sph, mats.hair, head);
    g.scale.set(0.012, 0.014, 0.008);
    g.position.set(0, -0.072, 0.086);
  }
  if (!L0.shirtless && TOP !== 'polo') {
    // hood bunched up behind the neck
    const hood = mesh(new THREE.TorusGeometry(0.075, 0.028, 10, 24), mats.polo, body);
    hood.rotation.x = Math.PI / 2 - 0.4;
    hood.position.set(0, 0.5, -0.03);
    if (TOP === 'hoodie') {
      const pocket = mesh(new THREE.BoxGeometry(0.2, 0.09, 0.012), mats.pocket, body);
      pocket.position.set(0, 0.11, 0.115 * WIDE);
      for (const sx of [-1, 1]) { // drawstrings
        const str = mesh(cyl, mats.pocket, body);
        str.scale.set(0.003, 0.09, 0.003);
        str.position.set(sx * 0.03, 0.42, 0.122);
      }
    } else {
      // zip hoodie: a zipper down the front; open = the shirt underneath shows between the sides
      const open = TOP === 'openHoodie';
      if (open) {
        const panel = mesh(new THREE.BoxGeometry(0.11, 0.46, 0.01), mats.inner, body);
        panel.position.set(0, 0.24, 0.115 * WIDE + 0.004);
      }
      for (const sx of (open ? [-1, 1] : [0])) {
        const zip = mesh(new THREE.BoxGeometry(0.006, 0.46, 0.006), mats.trim, body);
        zip.position.set(sx * 0.056, 0.24, 0.122 * WIDE);
      }
    }
  }
  if (L0.backpack != null) {
    const pack = mesh(new THREE.BoxGeometry(0.28, 0.38, 0.14), mats.pack, body);
    pack.position.set(0, 0.27, -0.17);
    for (const sx of [-1, 1]) {
      const strap = mesh(new THREE.BoxGeometry(0.035, 0.36, 0.012), mats.pack, body);
      strap.position.set(sx * 0.085, 0.3, 0.118 * WIDE);
    }
  }

  // ---- limbs (re-posed every frame) ----
  const limb = (r, mat) => { const m = mesh(cyl, mat); m.userData.r = r; return m; };
  const joint = (r, mat) => { const m = mesh(sph, mat); m.scale.setScalar(r); return m; };
  const lower = L0.shorts ? mats.skin : mats.khaki; // shorts: bare shins
  const legs = [-1, 1].map(() => ({
    thigh: limb(0.074, mats.khaki), knee: joint(L0.shorts ? 0.05 : 0.068, lower), shin: limb(L0.shorts ? 0.048 : 0.063, lower),
    cuff: joint(L0.shorts ? 0.045 : 0.064, L0.shorts ? mats.sock : mats.khaki), shoe: mesh(new THREE.CapsuleGeometry(0.045, 0.17, 6, 12), mats.shoe),
  }));
  // the right arm gets its own materials so it can turn see-through (drawing on the whiteboard)
  const armMats = [{ skin: mats.skin, polo: mats.polo }, { skin: mats.skin.clone(), polo: mats.polo.clone() }];
  const M = MUSCLE;
  const LONG = TOP !== 'polo' && !L0.shirtless; // hoodies have long sleeves
  const arms = [-1, 1].map((_, i) => {
    const arm = LONG ? armMats[i].polo : armMats[i].skin;
    const k = LONG ? 1.22 : 1; // sleeves are a bit puffier than bare arms
    return {
      shoulder: joint(0.062 * (1 + (M - 1) * 0.9), armMats[i].polo), sleeve: limb(0.06 * M, armMats[i].polo), upper: limb(0.042 * M * k, arm),
      elbow: joint(0.042 * (1 + (M - 1) * 0.6) * k, arm), fore: limb(0.037 * (1 + (M - 1) * 0.7) * k, arm), hand: mesh(sph, armMats[i].skin),
    };
  });
  let rightOpacity = 1;
  function setRightArmOpacity(o) {
    if (o === rightOpacity) return;
    rightOpacity = o;
    for (const m of [armMats[1].skin, armMats[1].polo]) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
      m.needsUpdate = true;
    }
    for (const k of ['shoulder', 'sleeve', 'upper', 'elbow', 'fore', 'hand']) arms[1][k].castShadow = o >= 1;
  }

  const va = new THREE.Vector3(), vb = new THREE.Vector3(), vd = new THREE.Vector3();
  function place(m, a, b) {
    toThree(a, va);
    toThree(b, vb);
    vd.subVectors(vb, va);
    const len = vd.length();
    m.position.addVectors(va, vb).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, vd.normalize());
    m.scale.set(m.userData.r, len, m.userData.r);
  }
  function at(m, p) { toThree(p, m.position); }

  // whole-person see-through (e.g. Paul in front of the whiteboard while he draws)
  let bodyOpacity = 1;
  function setBodyOpacity(o) {
    if (o === bodyOpacity) return;
    bodyOpacity = o;
    const all = new Set([...Object.values(mats), armMats[0].skin, armMats[0].polo]);
    for (const m of all) {
      if (!m || !m.isMaterial) continue;
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
      m.needsUpdate = true;
    }
  }

  function update(p) {
    setBodyOpacity(p.opacity ?? 1);
    setRightArmOpacity(Math.min(p.rightArmOpacity ?? 1, p.opacity ?? 1));
    // flinch (0..1): something just hit him. A tiny step back and a wobble, then he's back in place.
    const fl = p.flinch || 0;
    if (fl > 0) p = { ...p, x: p.x + Math.sin(fl * 18) * 0.012 * fl, z: p.z + 0.03 * fl };
    const sit = p.sit || 0;
    const swing = Math.sin(p.walk || 0) * 0.14 * (p.moving || 0) * (1 - sit);
    const bob = Math.abs(Math.sin(p.walk || 0)) * 0.025 * (p.moving || 0) * (1 - sit);
    const beltY = lerpN(H.belt, 0.6, sit) + bob; // seated: on a bench about 0.46 m high
    group.visible = p.visible !== false;
    toThree(toWorld(p, 0, beltY, 0), body.position);
    body.rotation.y = -(p.yaw || 0);
    const bg = p.bulge || 0;
    bulge.visible = bg > 0.02;
    if (bulge.visible) {
      const t = performance.now() / 1000;
      bulge.scale.set(0.045 * bg, 0.04 * bg, 0.022 * bg + 0.003 * Math.sin(t * 23));
      bulge.position.set(0.13 + Math.sin(t * 13) * 0.008, -0.085 + Math.cos(t * 11) * 0.008, 0.075);
    }

    [-1, 1].forEach((side, i) => {
      const L = legs[i];
      const sw = side * swing;
      const hip = toWorld(p, side * 0.095, beltY - 0.06, 0.02 * sit);
      const knee = lerpP(toWorld(p, side * 0.1, H.knee, sw * 0.5), toWorld(p, side * 0.1, 0.52, -0.42), sit);
      const ankle = lerpP(toWorld(p, side * 0.105, H.ankle + 0.03, sw), toWorld(p, side * 0.11, 0.115, -0.47), sit);
      place(L.thigh, hip, knee);
      at(L.knee, knee);
      place(L.shin, knee, ankle);
      at(L.cuff, ankle);
      L.cuff.scale.set(0.064, 0.03, 0.064);
      const heel = toWorld(p, side * 0.105, 0.045, sw + 0.05 - 0.47 * sit);
      const toe = toWorld(p, side * 0.11, 0.045, sw - 0.14 - 0.47 * sit);
      toThree(heel, va);
      toThree(toe, vb);
      L.shoe.position.addVectors(va, vb).multiplyScalar(0.5);
      L.shoe.quaternion.setFromUnitVectors(UP, vd.subVectors(vb, va).normalize());
      L.shoe.scale.set(1, 1, 0.75);
    });

    const rest = (side) => lerpP(paulRestHand(p, side), toWorld(p, side * 0.15, 0.62, -0.3), sit);
    const hands = { 1: p.rightHand || rest(1), '-1': p.leftHand || rest(-1) };
    [-1, 1].forEach((side, i) => {
      const A = arms[i];
      const shoulder = toWorld(p, side * 0.2, beltY + (H.shoulder - H.belt), 0);
      const out = [toWorld(p, side, 0, 0)[0] - p.x, 0, toWorld(p, side, 0, 0)[2] - p.z];
      const back = [toWorld(p, 0, 0, 1)[0] - p.x, 0, toWorld(p, 0, 0, 1)[2] - p.z];
      // elbows point out to the side, down and a bit back (or where the caller asks)
      const pole = (side === 1 && p.rightPole) || [out[0] * 0.7 + back[0] * 0.3, -0.6, out[2] * 0.7 + back[2] * 0.3];
      const { elbow, hand } = solveArm(shoulder, hands[side], pole);
      const sleeveEnd = [shoulder[0] + (elbow[0] - shoulder[0]) * 0.5, shoulder[1] + (elbow[1] - shoulder[1]) * 0.5, shoulder[2] + (elbow[2] - shoulder[2]) * 0.5];
      at(A.shoulder, shoulder);
      place(A.sleeve, shoulder, sleeveEnd);
      place(A.upper, sleeveEnd, elbow);
      at(A.elbow, elbow);
      // stop the forearm a little short; the hand sits on its end
      const dir = [hand[0] - elbow[0], hand[1] - elbow[1], hand[2] - elbow[2]];
      const dl = Math.hypot(...dir) || 1;
      const wrist = [hand[0] - (dir[0] / dl) * 0.04, hand[1] - (dir[1] / dl) * 0.04, hand[2] - (dir[2] / dl) * 0.04];
      place(A.fore, elbow, wrist);
      at(A.hand, hand);
      A.hand.quaternion.setFromUnitVectors(UP, vd.set(dir[0], dir[1], -dir[2]).normalize());
      A.hand.scale.set(0.04, 0.055, 0.026);
    });
  }

  // Taller (or shorter) than normal: scale the whole figure about the spot they stand on.
  const SCALE = L0.heightScale || 1;
  const rawUpdate = update;
  function scaledUpdate(p) {
    rawUpdate(p);
    if (SCALE === 1) return;
    group.scale.setScalar(SCALE);
    toThree([p.x, p.floorY ?? 0, p.z], group.position).multiplyScalar(1 - SCALE);
  }

  return { group, update: scaledUpdate };
}
