// The table in 3D: the dark-purple perforated picnic table with up to 8
// players seated two per bench, facing outward, and Paul standing beside it.
// Eliminated players stand up and walk away. Name tags are drawn on the HUD.

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

  const people = new Map(); // id -> { person, seat, state, t, name, status, highlight }

  function setPlayers(players) {
    for (const p of people.values()) stage.scene.remove(p.person.group);
    people.clear();
    players.forEach((pl, i) => {
      const extra = CHARACTERS.find((c) => c.id === pl.id)?.look || {};
      const person = createPerson3D({ skin: PLACEHOLDER_SKIN, hair: PLACEHOLDER_HAIR, shirt: pl.shirt, pants: 0xbfa880, ...extra });
      stage.scene.add(person.group);
      people.set(pl.id, { person, seat: seatPose(pl.seat ?? i), state: 'seated', t: 0, walk: 0, name: pl.name, human: !!pl.human, status: '', highlight: false });
    });
  }

  /** Stand up and walk away from the table. Resolves when they're gone. */
  function eliminate(id) {
    const p = people.get(id);
    if (!p) return Promise.resolve();
    p.state = 'standing';
    p.t = 0;
    return new Promise((resolve) => { p.onGone = resolve; });
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
      if (p.state === 'standing' && p.t > 0.8) { p.state = 'walking'; p.t = 0; }
      if (p.state === 'walking') { p.walk += dt * 9; if (p.t > 3.2) { p.state = 'gone'; p.onGone?.(); } }
    }
    onFrame?.(dt);
  }

  const v = new THREE.Vector3();
  function project(gp) {
    v.set(gp[0], gp[1], -gp[2]).project(stage.camera);
    return { x: (v.x + 1) / 2 * size.w, y: (1 - v.y) / 2 * size.h, behind: v.z > 1 };
  }

  function render() {
    paul.update({ ...PAUL, rightHand: null, walk: 0, moving: 0 });
    for (const p of people.values()) {
      const s = p.seat;
      let sit = 1, dx = 0, dz = 0, moving = 0;
      if (p.state === 'standing') sit = 1 - Math.min(1, p.t / 0.7);
      if (p.state === 'walking') {
        sit = 0;
        moving = 1;
        const d = p.t * 1.5;
        dx = s.out[0] * (0.45 + d);
        dz = s.out[1] * (0.45 + d);
      }
      // slide forward off the bench as they stand
      if (p.state === 'standing') { dx = s.out[0] * 0.45 * (1 - sit); dz = s.out[1] * 0.45 * (1 - sit); }
      const breathe = p.state === 'seated' ? Math.sin(time * 1.4 + s.x * 3) * 0.004 : 0;
      p.person.update({
        x: s.x + dx, z: s.z + dz, floorY: breathe, yaw: s.yaw, sit, walk: p.walk, moving,
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
      const s = p.seat;
      let headY = 1.25, dx = 0, dz = 0;
      if (p.state === 'walking') { headY = 1.64; const d = p.t * 1.5; dx = s.out[0] * (0.45 + d); dz = s.out[1] * (0.45 + d); }
      const sp = project([s.x + dx, headY + 0.28, s.z + dz]);
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
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    step(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    destroy() { loop.stop(); stage.destroy(); },
  };
}
