// People in 3D. createPaul3D() is the host: school uniform (white polo, navy
// lanyard + ID card, khaki trousers, dark shoes), fair skin, short messy
// dark-brown hair. createPerson3D(look) makes anyone else (the Members use
// placeholder looks until the user sends their pictures).
// Posed every frame:
//   { x, z, floorY, yaw, walk, moving, sit (0..1), leftHand, rightHand, bulge }  (game coordinates)
//   optional: rightElbow (force the right elbow), rightArmOpacity (0..1, see-through arm), flinch (0..1, just got hit)
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

function elbowFor(shoulder, hand, out) {
  const mid = [(shoulder[0] + hand[0]) / 2, (shoulder[1] + hand[1]) / 2, (shoulder[2] + hand[2]) / 2];
  const d = Math.hypot(hand[0] - shoulder[0], hand[1] - shoulder[1], hand[2] - shoulder[2]);
  const bend = Math.max(0, 0.6 - d);
  return [mid[0] + out[0] * bend * 0.6, mid[1] - bend * 0.45, mid[2] + out[2] * bend * 0.6 + bend * 0.25];
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
    lanyard: new THREE.MeshStandardMaterial({ color: 0x1f3a8a, roughness: 0.6 }),
    card: new THREE.MeshStandardMaterial({ color: 0xf6f6f6, roughness: 0.35 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.25 }),
    brow: new THREE.MeshStandardMaterial({ color: 0x2f2219, roughness: 0.8 }),
    lip: new THREE.MeshStandardMaterial({ color: 0xc98f86, roughness: 0.5 }),
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
  hips.scale.set(1, 1, 0.68);
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
  torso.scale.set(1 + (MUSCLE - 1) * 0.35, 1, 0.62 + (MUSCLE - 1) * 0.12);
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
  collar.visible = !L0.shirtless;
  collar.rotation.x = Math.PI / 2 - 0.25;
  collar.position.set(0, 0.5, 0.012);
  const placket = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.006), mats.polo, body);
  placket.visible = !L0.shirtless;
  placket.position.set(0, 0.42, 0.118);
  // lanyard + ID card
  for (const sx of (L0.lanyard ? [-1, 1] : [])) {
    const strap = mesh(cyl, mats.lanyard, body);
    strap.scale.set(0.006, 0.24, 0.006);
    strap.position.set(sx * 0.035, 0.38, 0.115);
    strap.rotation.z = sx * 0.14;
    strap.rotation.x = -0.12;
  }
  if (L0.lanyard) {
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

  // ---- limbs (re-posed every frame) ----
  const limb = (r, mat) => { const m = mesh(cyl, mat); m.userData.r = r; return m; };
  const joint = (r, mat) => { const m = mesh(sph, mat); m.scale.setScalar(r); return m; };
  const legs = [-1, 1].map(() => ({
    thigh: limb(0.074, mats.khaki), knee: joint(0.068, mats.khaki), shin: limb(0.063, mats.khaki),
    cuff: joint(0.064, mats.khaki), shoe: mesh(new THREE.CapsuleGeometry(0.045, 0.17, 6, 12), mats.shoe),
  }));
  // the right arm gets its own materials so it can turn see-through (drawing on the whiteboard)
  const armMats = [{ skin: mats.skin, polo: mats.polo }, { skin: mats.skin.clone(), polo: mats.polo.clone() }];
  const M = MUSCLE;
  const arms = [-1, 1].map((_, i) => ({
    shoulder: joint(0.062 * (1 + (M - 1) * 0.9), armMats[i].polo), sleeve: limb(0.06 * M, armMats[i].polo), upper: limb(0.042 * M, armMats[i].skin),
    elbow: joint(0.042 * (1 + (M - 1) * 0.6), armMats[i].skin), fore: limb(0.037 * (1 + (M - 1) * 0.7), armMats[i].skin), hand: mesh(sph, armMats[i].skin),
  }));
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

  function update(p) {
    setRightArmOpacity(p.rightArmOpacity ?? 1);
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
      const hand = hands[side];
      const out = [toWorld(p, side, 0, 0)[0] - p.x, 0, toWorld(p, side, 0, 0)[2] - p.z];
      const elbow = (side === 1 && p.rightElbow) || elbowFor(shoulder, hand, out);
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
