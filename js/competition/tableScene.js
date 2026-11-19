// The table in 3D: the dark-purple perforated picnic table with up to 8
// players seated two per bench, facing outward, and Paul running it: he walks
// over to stand in front of whoever's turn it is, and when someone's out he
// leads them away from the table (now and then a computer refuses to get up
// and Paul has to yank them off the bench). Name tags are drawn on the HUD.

import * as THREE from 'three';
import { createStage3D } from '../three/stage.js';
import { buildCourtyard } from '../three/courtyard.js';
import { createPicnicTable } from '../three/props.js';
import { createPerson3D, createPaul3D } from '../three/paul3d.js';
import { CHARACTERS } from './engine.js';
import { createCamera } from '../shared/scene3d.js';
import { startLoop } from '../shared/gameLoop.js';
import { HUD_FONT } from '../shared/hud.js';

const TABLE = new THREE.Vector3(0, 0, -4.3); // three.js coords; floor at y = 0
const PLACEHOLDER_SKIN = 0xcbbdb0;           // neutral placeholder until real looks
const PLACEHOLDER_HAIR = 0x3a3436;
const TC = [TABLE.x, -TABLE.z];               // table center in game coords

// Paul at the table (meters, seconds)
export const TABLE_PAUL = {
  speed: 1.5,          // walking
  orbit: 1.95,         // he walks around the table at this radius
  inFront: 0.95,       // how far in front of a seated player he stands on their turn
  turnSide: 0.45,      // ...and a little to one side so he doesn't hide them
  escortSide: 0.55,    // walking beside someone he's leading out
  escortSec: 2.4,      // walking them out before he lets go
  walkOutSpeed: 1.3,
  refuseSec: 1.3,      // a computer that won't get up (yank)
  yankStandSec: 0.35,
};
const angleTo = (dx, dz) => Math.atan2(-dx, -dz); // yaw that faces (dx, dz)
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// Seat i: bench = floor(i / 2), two seats per bench, facing away from the table.
function seatPose(i) {
  const bench = Math.floor(i / 2);
  const a = (bench * Math.PI) / 2;
  const lx = 0.12 + (i % 2 === 0 ? -0.27 : 0.27);
  const lz = 0.975; // bench center line (see createPicnicTable)
  const x = TABLE.x + lx * Math.cos(a) + lz * Math.sin(a);
  const z3 = TABLE.z - lx * Math.sin(a) + lz * Math.cos(a);
  return { x, z: -z3, yaw: -a, out: [Math.sin(a), -Math.cos(a)] }; // game coords; out = walk-away direction
}

export function createTableScene(container, { onFrame } = {}) {
  let cam = null;
  let size = null;
  const stage = createStage3D(container, {
    // on tall (phone) screens the info panel covers the bottom, so frame the table higher
    onResize: (s) => { size = s; cam = createCamera(s, { fovYDeg: 46, cyFrac: s.h > s.w ? 0.36 : 0.5, maxFocalW: 1.15 }); },
    getCam: () => cam,
  });
  // camera above and in front of the table, looking down at it
  stage.camera.position.set(0, 2.6, 0.2);
  stage.camera.lookAt(TABLE.x, 0.55, TABLE.z);

  buildCourtyard(stage, {
    floorY: 0, buildingZ: 15, sunElevationDeg: 48, sunAzimuthDeg: 25, shadowCenter: [0, 4.3], shadowSize: 4.5,
    tables: [{ x: -5.5, z: 9.5, rotDeg: 20 }, { x: 6, z: 11, rotDeg: -15 }],
  });
  const table = createPicnicTable();
  table.position.copy(TABLE);
  stage.scene.add(table);

  const paul = createPaul3D();
  stage.scene.add(paul.group);
  const PAUL = { x: 1.75, z: 2.75, floorY: 0, yaw: 0.35 };
  // Paul's live state: where he is, where he's going, what he's doing with his hands
  const pl = { x: PAUL.x, z: PAUL.z, yaw: PAUL.yaw, walk: 0, moving: 0, leftHand: null, rightHand: null, job: null, focusId: null };

  const people = new Map(); // id -> { person, seat, state, t, name, status, highlight }

  function setPlayers(players) {
    for (const p of people.values()) stage.scene.remove(p.person.group);
    people.clear();
    players.forEach((pl, i) => {
      const extra = CHARACTERS.find((c) => c.id === pl.id)?.look || {};
      const person = createPerson3D({ skin: PLACEHOLDER_SKIN, hair: PLACEHOLDER_HAIR, shirt: pl.shirt, pants: 0xbfa880, ...extra });
      stage.scene.add(person.group);
      people.set(pl.id, { id: pl.id, person, seat: seatPose(pl.seat ?? i), seatIdx: pl.seat ?? i, state: 'seated', t: 0, walk: 0, d: 0, sit: 1, shake: 0, name: pl.name, human: !!pl.human, status: '', highlight: false });
    });
    pl.job = null;
    pl.leftHand = pl.rightHand = null;
  }

  // where a player is right now (game coords) — seats + how far they've walked out
  function playerPos(p) {
    const s = p.seat;
    const k = 0.45 * (1 - p.sit) + p.d;
    return [s.x + s.out[0] * k, s.z + s.out[1] * k];
  }
  // unit vector to the player's right (as they face out)
  const rightOf = (yaw) => [Math.cos(yaw), -Math.sin(yaw)];

  /** Which side of a player Paul stands on: away from their bench neighbor. */
  function sideFor(p) {
    const nb = seatPose(p.seatIdx ^ 1);
    const r = rightOf(p.seat.yaw);
    return (nb.x - p.seat.x) * r[0] + (nb.z - p.seat.z) * r[1] > 0 ? -1 : 1;
  }

  /** Walk Paul toward (tx, tz), around the table instead of through it. Returns true once there. */
  function walkPaul(dt, tx, tz, faceYaw, speed = TABLE_PAUL.speed) {
    const pr = [pl.x - TC[0], pl.z - TC[1]];
    const tr = [tx - TC[0], tz - TC[1]];
    const pa = Math.atan2(pr[1], pr[0]), ta = Math.atan2(tr[1], tr[0]);
    const dA = wrapA(ta - pa);
    let wx = tx, wz = tz;
    if (Math.abs(dA) > 0.35 && Math.hypot(...tr) < TABLE_PAUL.orbit + 0.6) {
      const a = pa + Math.sign(dA) * Math.min(Math.abs(dA), 0.6);
      const R = Math.max(TABLE_PAUL.orbit, Math.min(Math.hypot(...pr), TABLE_PAUL.orbit + 0.4));
      wx = TC[0] + Math.cos(a) * R;
      wz = TC[1] + Math.sin(a) * R;
    }
    const dx = wx - pl.x, dz = wz - pl.z;
    const dist = Math.hypot(dx, dz);
    const left = Math.hypot(tx - pl.x, tz - pl.z);
    if (left < 0.03) {
      pl.moving = Math.max(0, pl.moving - dt * 4);
      if (faceYaw != null) pl.yaw += wrapA(faceYaw - pl.yaw) * Math.min(1, dt * 6);
      return true;
    }
    const step = Math.min(dist, speed * dt);
    pl.x += (dx / dist) * step;
    pl.z += (dz / dist) * step;
    pl.walk += dt * 9 * (speed / TABLE_PAUL.speed);
    pl.moving = Math.min(1, pl.moving + dt * 5);
    const head = left < 0.25 && faceYaw != null ? faceYaw : angleTo(dx, dz);
    pl.yaw += wrapA(head - pl.yaw) * Math.min(1, dt * 7);
    return false;
  }

  /** Paul's spot for someone's turn: in front of them, a little to one side, facing them. */
  function turnSpot(p) {
    const s = p.seat;
    const r = rightOf(s.yaw);
    const side = sideFor(p) * TABLE_PAUL.turnSide;
    const x = s.x + s.out[0] * TABLE_PAUL.inFront + r[0] * side;
    const z = s.z + s.out[1] * TABLE_PAUL.inFront + r[1] * side;
    return { x, z, yaw: angleTo(s.x - x, s.z - z) };
  }

  /** a world point on a player's shoulder (for Paul's hand) */
  function shoulderOf(p, side, y = 1.45) {
    const [x, z] = playerPos(p);
    const r = rightOf(p.seat.yaw);
    const sit = p.sit;
    return [x + r[0] * side * 0.19, y - sit * 0.5, z + r[1] * side * 0.19];
  }

  function updatePaul(dt) {
    const job = pl.job;
    if (job) pl.blocking = false;
    if (!job) {
      pl.leftHand = pl.rightHand = null;
      const cur = [...people.values()].find((p) => p.highlight && p.state === 'seated');
      pl.blocking = !!cur && cur.seat.z < 3.6; // front bench: he'd stand between the camera and them
      if (cur) { const t = turnSpot(cur); walkPaul(dt, t.x, t.z, t.yaw); } else walkPaul(dt, PAUL.x, PAUL.z, PAUL.yaw);
      return;
    }
    const p = job.p;
    const s = p.seat;
    const r = rightOf(s.yaw);
    const side = job.side;
    job.t += dt;
    // where Paul walks beside them (facing out, the same way they go)
    const beside = () => { const [x, z] = playerPos(p); return [x + r[0] * side * TABLE_PAUL.escortSide, z + r[1] * side * TABLE_PAUL.escortSide]; };
    switch (job.phase) {
      case 'approach': {
        // stand just off their knees, beside them, facing them
        const x = s.x + s.out[0] * 0.62 + r[0] * side * TABLE_PAUL.escortSide;
        const z = s.z + s.out[1] * 0.62 + r[1] * side * TABLE_PAUL.escortSide;
        const there = walkPaul(dt, x, z, angleTo(s.x - x, s.z - z));
        if ((there && job.t > 0.25) || job.t > 6) { job.phase = job.yank ? 'refuse' : 'stand'; job.t = 0; }
        break;
      }
      case 'refuse': {
        // they stay put and shake their head; Paul reaches for their arm
        pl.moving = Math.max(0, pl.moving - dt * 4);
        p.shake = Math.sin(job.t * 14) * 0.28 * Math.min(1, job.t * 3);
        const reach = Math.min(1, job.t / 0.6);
        const hand = shoulderOf(p, side, 1.38);
        hand[1] -= 0.08;
        pl[side > 0 ? 'leftHand' : 'rightHand'] = reach > 0.3 ? hand : null;
        if (job.t > TABLE_PAUL.refuseSec) { job.phase = 'yank'; job.t = 0; p.shake = 0; p.state = 'yanked'; p.t = 0; }
        break;
      }
      case 'yank': {
        // a hard pull: up off the bench in a hurry, stumbling after him
        const k = Math.min(1, job.t / TABLE_PAUL.yankStandSec);
        p.sit = 1 - k * k;
        p.lurch = Math.sin(k * Math.PI) * 0.12;
        const [bx, bz] = beside();
        pl.x += (bx + s.out[0] * 0.25 - pl.x) * Math.min(1, dt * 8);
        pl.z += (bz + s.out[1] * 0.25 - pl.z) * Math.min(1, dt * 8);
        pl.yaw += wrapA(s.yaw - pl.yaw) * Math.min(1, dt * 8);
        pl[side > 0 ? 'leftHand' : 'rightHand'] = shoulderOf(p, side, 1.36);
        if (k >= 1) { job.phase = 'escort'; job.t = 0; job.fast = 1.35; p.lurch = 0; p.state = 'walking'; p.t = 0; }
        break;
      }
      case 'stand': {
        pl.moving = Math.max(0, pl.moving - dt * 4);
        p.state = 'standing';
        p.sit = Math.max(0, 1 - job.t / 0.7);
        pl.yaw += wrapA(angleTo(s.x - pl.x, s.z - pl.z) - pl.yaw) * Math.min(1, dt * 6);
        if (job.t > 0.4) pl[side > 0 ? 'leftHand' : 'rightHand'] = shoulderOf(p, side);
        if (job.t > 0.85) { job.phase = 'escort'; job.t = 0; p.state = 'walking'; p.t = 0; }
        break;
      }
      case 'escort': {
        // walk them out together, his hand on their shoulder
        const sp = TABLE_PAUL.walkOutSpeed * (job.fast || 1);
        p.d += sp * dt;
        p.walk += dt * 9 * (job.fast || 1);
        const [bx, bz] = beside();
        const lead = job.fast ? 0.25 : 0; // yanking: he's a step ahead, pulling
        pl.x += (bx + s.out[0] * lead - pl.x) * Math.min(1, dt * 6);
        pl.z += (bz + s.out[1] * lead - pl.z) * Math.min(1, dt * 6);
        pl.walk += dt * 9 * (job.fast || 1);
        pl.moving = 1;
        pl.yaw += wrapA(s.yaw - pl.yaw) * Math.min(1, dt * 6);
        pl[side > 0 ? 'leftHand' : 'rightHand'] = shoulderOf(p, side, job.fast ? 1.36 : 1.45);
        if (job.t > TABLE_PAUL.escortSec) {
          // let go: they keep walking, Paul heads back
          p.free = true;
          p.speed = sp;
          pl.leftHand = pl.rightHand = null;
          pl.job = null;
          job.done?.();
        }
        break;
      }
      default:
    }
  }

  /**
   * Out: Paul walks over and leads them away from the table. yank = they refuse
   * to get up and Paul pulls them off the bench (a bit longer). If Paul is
   * already busy (several out at once) they just stand up and walk off.
   * Resolves when they're gone.
   */
  function eliminate(id, { yank = false } = {}) {
    const p = people.get(id);
    if (!p || p.state !== 'seated') return Promise.resolve();
    const done = new Promise((resolve) => { p.onGone = resolve; });
    if (pl.job) {
      p.state = 'standing';
      p.t = 0;
      p.free = true;
      p.speed = 1.5;
      return done;
    }
    p.state = 'waiting'; // still seated until Paul gets there
    pl.job = { p, phase: 'approach', t: 0, yank, side: sideFor(p) };
    return done;
  }

  function setStatus(id, status, highlight = false) {
    const p = people.get(id);
    if (p) { p.status = status; p.highlight = highlight; }
  }
  function clearStatuses() { for (const p of people.values()) { p.status = ''; p.highlight = false; } }

  let time = 0;
  function update(dt) {
    time += dt;
    for (const p of people.values()) {
      p.t += dt;
      // walking off on their own (or after Paul lets go)
      if (p.free && p.state === 'standing') { p.sit = Math.max(0, 1 - p.t / 0.7); if (p.t > 0.8) { p.state = 'walking'; p.t = 0; } }
      if (p.free && p.state === 'walking') {
        p.d += p.speed * dt;
        p.walk += dt * 9;
        if (p.d > 5.2) { p.state = 'gone'; p.onGone?.(); }
      }
    }
    updatePaul(dt);
    onFrame?.(dt);
  }

  const v = new THREE.Vector3();
  function project(gp) {
    v.set(gp[0], gp[1], -gp[2]).project(stage.camera);
    return { x: (v.x + 1) / 2 * size.w, y: (1 - v.y) / 2 * size.h, behind: v.z > 1 };
  }

  function render() {
    // see-through when he's standing between the camera and the player whose turn it is
    const camBlock = pl.blocking && pl.moving < 0.5 ? 0.55 : 1;
    pl.opacity = (pl.opacity ?? 1) + (camBlock - (pl.opacity ?? 1)) * 0.15;
    paul.update({ x: pl.x, z: pl.z, floorY: 0, yaw: pl.yaw, walk: pl.walk, moving: pl.moving, leftHand: pl.leftHand, rightHand: pl.rightHand, opacity: pl.opacity > 0.98 ? 1 : pl.opacity });
    for (const p of people.values()) {
      const s = p.seat;
      const [x, z] = playerPos(p);
      const moving = p.state === 'walking' ? 1 : 0;
      const breathe = p.sit > 0.99 ? Math.sin(time * 1.4 + s.x * 3) * 0.004 : 0;
      const lurch = p.lurch || 0;
      p.person.update({
        x: x + s.out[0] * lurch, z: z + s.out[1] * lurch, floorY: breathe, yaw: s.yaw + (p.shake || 0), sit: p.sit, walk: p.walk, moving,
        visible: p.state !== 'gone',
      });
    }
    stage.render();
    drawTags();
  }

  // name tags above heads
  const ctx = stage.hud.ctx;
  function drawTags() {
    ctx.clearRect(0, 0, size.w, size.h);
    for (const p of people.values()) {
      if (p.state === 'gone') continue;
      const [px, pz] = playerPos(p);
      const headY = 1.25 + 0.39 * (1 - p.sit);
      const sp = project([px, headY + 0.28, pz]);
      if (sp.behind) continue;
      const label = p.human ? `${p.name} (you)` : p.name;
      ctx.save();
      ctx.font = `800 13px ${HUD_FONT}`;
      const tw = ctx.measureText(label).width;
      ctx.font = `700 12px ${HUD_FONT}`;
      const sw = p.status ? ctx.measureText(p.status).width + 14 : 0;
      const w = tw + 18 + sw, h = 24;
      const x = sp.x - w / 2, y = sp.y - h;
      ctx.fillStyle = p.highlight ? 'rgba(124,77,255,0.92)' : 'rgba(15,10,20,0.68)';
      ctx.strokeStyle = p.human ? 'rgba(255,209,102,0.9)' : 'rgba(255,255,255,0.18)';
      ctx.lineWidth = p.human ? 2 : 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.textBaseline = 'middle';
      ctx.font = `800 13px ${HUD_FONT}`;
      ctx.fillText(label, x + 9, y + h / 2 + 0.5);
      if (p.status) {
        ctx.font = `700 12px ${HUD_FONT}`;
        ctx.fillStyle = p.status === 'OUT' ? '#ff8a98' : p.status === 'SAFE' ? '#7ff0a8' : '#ffe08a';
        ctx.fillText(p.status, x + 9 + tw + 12, y + h / 2 + 0.5);
      }
      ctx.restore();
    }
  }

  const loop = startLoop({ update, render });

  return {
    stage,
    setPlayers,
    eliminate,
    setStatus,
    clearStatuses,
    paulState: () => ({ ...pl, job: pl.job?.phase ?? null }), // debug/tests
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    destroy() { loop.stop(); stage.destroy(); },
  };
}
