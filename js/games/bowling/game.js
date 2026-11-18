// Bowling.
// Flick a whiteboard eraser at dry-erase markers standing on the floor.
// Regular: 3 markers together like pins, new spot every throw.
// Hard: black (1) / orange (2) / purple (3) in separate spots; knocked
// markers move to a new spot, standing ones stay. Wind optional.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { MARKER_COLORS, COLOR_BY_ID } from '../../shared/colors.js';
import { createCamera, renderRoom } from '../../shared/scene3d.js';
import { createThrowControl, stepBody, spinBasis } from '../../shared/throwing.js';
import { createWind } from '../../shared/wind.js';
import { createPopups, drawLabel, drawFlickHint, drawDebugBox } from '../../shared/hud.js';
import { drawEraser, drawRodMarker, drawFloorShadow } from '../../shared/objects3d.js';
import { drawMarker } from '../../shared/marker.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createStage3D } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createMarker3D, createEraser3D, setPoseFromBasis, setRodPose } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';
import { add, mul, dot, cross, norm, len, lerp, clamp, rotateAround, easeOut } from '../../shared/vec3.js';

const INK = '#1f1f22';
const SOFT = '#565a62';
const GOOD = '#1f9d4c';
const BAD = '#d7263d';

export function createBowling(container, host) {
  // Online watching: st is copied from the player's live feed, nothing is simulated here.
  const spectate = host.options?.spectate || null;
  const mirrorIn = () => { const s = spectate.frame(); if (s) Object.assign(st, s); };
  const { options = {}, seed, debug = false, onFinish } = host;
  const C = CONFIG;
  const W = C.world;
  const FLOOR = -W.eyeHeight;
  const ER = C.eraser;
  const EH = ER.feltH + ER.handleH;
  const ML = C.marker.length;
  const MR = C.marker.radius;
  const hard = !!options.hard;
  const windOn = !!options.wind;
  const variant = ['hard', 'wind'].filter((k) => options[k]).join('-') || 'regular';
  const rng = createRng(seed);
  const wind = createWind(rng, C.wind, windOn);
  const popups = createPopups();
  const colors = rng.shuffle(MARKER_COLORS).slice(0, 3); // Regular: 3 different colors for this game
  const MAX = C.throws * 3;

  const st = {
    phase: 'ready', // ready | reset | aim | flight | resolve | done
    phaseT: 0,
    phaseDur: 0,
    time: 0,
    activeSec: 0,
    throwIndex: 0,
    score: 0,
    perThrow: [],
    knockedTotal: 0,
    strikes: 0,
    gutters: 0,
    markers: [],
    eraser: null,
    held: [0, C.hold.y, C.hold.z],
    thrownAt: 0,
    everThrew: false,
    lastFlick: null,
    finished: false,
  };

  let cam = null;
  let bg = null;
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  const { ctx } = view;
  const control = createThrowControl({
    canvas: view.canvas,
    cfg: C.throw,
    getCam: () => cam,
    canThrow: () => !loop.paused && st.phase === 'aim',
    onThrow: launch,
    onWeak: () => {
      const hp = cam.project(st.held);
      popups.add('Flick it faster!', hp.x, hp.y - 90, SOFT, 22);
    },
  });

  function onResize(size) {
    cam = createCamera(size, { fovYDeg: W.fovYDeg, cyFrac: W.cyFrac });
  }

  function setPhase(phase, durSec = 0) {
    st.phase = phase;
    st.phaseT = 0;
    st.phaseDur = durSec;
  }

  // ---------- markers ----------
  function makeMarker(color, x, z, extra = {}) {
    return { color, base: [x, FLOOR, z], dir: [0, 0, 1], angle: 0, angVel: 0, slide: [0, 0, 0], state: 'standing', pop: 0, knocked: false, ...extra };
  }

  function placeRegular() {
    const R = C.regular;
    const z = rng.range(R.distance);
    const x = rng.range(-1, 1) * cam.halfWidthAt(z) * R.offsetFrac;
    st.markers = [
      makeMarker(colors[0], x, z),
      makeMarker(colors[1], x - R.spacingX, z + R.spacingZ),
      makeMarker(colors[2], x + R.spacingX, z + R.spacingZ),
    ];
  }

  function placeTier(tier, others) {
    let best = null;
    for (let i = 0; i < 40; i++) {
      const z = rng.range(tier.distance);
      const x = rng.range(-1, 1) * cam.halfWidthAt(z) * tier.offsetFrac;
      best = makeMarker(COLOR_BY_ID[tier.color], x, z, { tier });
      if (others.every((o) => Math.hypot(o.base[0] - x, o.base[2] - z) > C.hard.minGap)) break;
    }
    return best;
  }

  function placeHardAll() {
    st.markers = [];
    for (const tier of C.hard.tiers) st.markers.push(placeTier(tier, st.markers));
  }

  function knock(m, dirH, speed) {
    if (m.state !== 'standing') return;
    m.state = 'falling';
    m.knocked = true;
    const d = norm([dirH[0], 0, dirH[2]]);
    m.dir = len(d) > 0.1 ? d : [0, 0, 1];
    m.angVel = clamp(speed * 1.6, 3, 11);
    m.slide = mul(m.dir, Math.min(speed * 0.25, 0.8));
  }

  function markerEnds(m) {
    const k = easeOut(clamp(m.pop, 0, 1));
    const s = Math.sin(m.angle), c = Math.cos(m.angle);
    const lift = MR * s; // lying markers rest on their side
    const bottom = [m.base[0], FLOOR + lift, m.base[2]];
    const top = [m.base[0] + m.dir[0] * s * ML * k, FLOOR + lift + c * ML * k, m.base[2] + m.dir[2] * s * ML * k];
    return { bottom, top };
  }

  function updateMarkers(dt) {
    for (const m of st.markers) {
      m.pop = Math.min(1, m.pop + dt / 0.35);
      if (m.state !== 'falling') continue;
      m.angVel += ((1.5 * W.gravity) / ML) * Math.sin(m.angle + 0.05) * dt;
      m.angle += m.angVel * dt;
      m.base = add(m.base, mul(m.slide, dt));
      m.slide = mul(m.slide, Math.max(0, 1 - 5 * dt));
      if (m.angle >= Math.PI / 2) {
        m.angle = Math.PI / 2;
        m.state = 'down';
      }
      // a falling marker can take its neighbors down too
      const reach = Math.sin(Math.min(m.angle, Math.PI / 2)) * ML;
      const tip = [m.base[0] + m.dir[0] * reach, m.base[2] + m.dir[2] * reach];
      for (const o of st.markers) {
        if (o === m || o.state !== 'standing') continue;
        if (distToSeg2(o.base[0], o.base[2], m.base[0], m.base[2], tip[0], tip[1]) < MR * 2 + 0.006) {
          knock(o, m.dir, m.angVel * ML * 0.6);
        }
      }
    }
  }

  function distToSeg2(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 ? clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
  }

  // ---------- eraser ----------
  function heldBasis() {
    let r = [1, 0, 0];
    let u = rotateAround([0, 1, 0], r, -0.55); // tipped toward you so you see the handle
    const sway = Math.sin(st.time * 1.7) * 0.05;
    r = rotateAround(r, [0, 0, 1], sway);
    u = rotateAround(u, [0, 0, 1], sway);
    return { r, u, n: norm(cross(u, r)) };
  }

  function launch(fl) {
    const b = heldBasis();
    const spin = rng.range(ER.spinRadPerSec) * rng.sign();
    st.eraser = {
      p: st.held.slice(),
      v: fl.v,
      ...b,
      w: add(mul(b.u, spin), mul(b.r, spin * 0.25)),
      onFloor: false,
      bounced: false,
      flat: false,
      settled: false,
    };
    st.thrownAt = st.time;
    st.everThrew = true;
    st.lastFlick = fl;
    setPhase('flight');
  }

  function flatten(e, h) {
    const up = dot(e.u, [0, 1, 0]) >= 0 ? [0, 1, 0] : [0, -1, 0];
    const axis = cross(e.u, up);
    const sinA = len(axis);
    const angle = Math.atan2(sinA, dot(e.u, up));
    if (angle < 0.02 || sinA < 1e-5) { e.flat = true; return; }
    const ax = mul(axis, 1 / sinA);
    const a = Math.min(angle, h * 14);
    e.r = rotateAround(e.r, ax, a);
    e.u = rotateAround(e.u, ax, a);
    e.n = norm(cross(e.u, e.r));
  }

  function stepEraser(e, dt) {
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    const rest = FLOOR + EH / 2;
    for (let i = 0; i < steps && !e.settled; i++) {
      if (!e.onFloor) {
        stepBody(e, h, { gravity: W.gravity, drag: ER.drag, wind: wind.vec });
        spinBasis(e, e.w, h);
        if (e.p[1] < rest) {
          e.p[1] = rest;
          if (e.v[1] < -1.2 && !e.bounced) {
            e.v = [e.v[0] * ER.landKeep, -e.v[1] * ER.bounce, e.v[2] * ER.landKeep];
            e.w = mul(e.w, 0.4);
            e.bounced = true;
          } else {
            const keep = e.bounced ? 1 : ER.landKeep;
            e.v = [e.v[0] * keep, 0, e.v[2] * keep];
            e.w = [0, 0, 0];
            e.onFloor = true;
          }
        }
      } else {
        const vh = Math.hypot(e.v[0], e.v[2]);
        const dec = ER.friction * W.gravity * h;
        e.v = vh <= dec ? [0, 0, 0] : [e.v[0] * (vh - dec) / vh, 0, e.v[2] * (vh - dec) / vh];
        e.p = add(e.p, mul(e.v, h));
        e.p[1] = rest;
        flatten(e, h);
        if (vh < 0.04 && e.flat) e.settled = true;
      }
      if (e.p[2] > W.backWallZ - 0.1) {
        e.p[2] = W.backWallZ - 0.1;
        e.v = [e.v[0], e.v[1], -Math.abs(e.v[2]) * 0.3];
      }
      // knock markers
      if (e.p[1] - EH / 2 < FLOOR + ML) {
        for (const m of st.markers) {
          if (m.state !== 'standing') continue;
          const d = Math.hypot(e.p[0] - m.base[0], e.p[2] - m.base[2]);
          if (d < ER.hitRadius + MR) {
            const vh = [e.v[0], 0, e.v[2]];
            const sp = len(vh);
            const dir = sp > 0.2 ? vh : [m.base[0] - e.p[0], 0, m.base[2] - e.p[2]];
            knock(m, dir, Math.max(sp, 1));
            e.v = mul(e.v, 0.85);
          }
        }
      }
    }
  }

  // ---------- flow ----------
  function beginReset(first) {
    if (!first) {
      if (hard) {
        st.markers = st.markers.map((m) => {
          if (!m.knocked) return m;
          return placeTier(m.tier, st.markers.filter((o) => o !== m && !o.knocked));
        });
      } else {
        placeRegular();
      }
    }
    st.eraser = null;
    wind.reroll();
    st.held = [0, C.hold.y - 0.4, C.hold.z];
    setPhase('reset', first ? 0.35 : C.resetMs / 1000);
  }

  function resolveThrow() {
    const knocked = st.markers.filter((m) => m.knocked);
    let pts;
    if (hard) pts = Math.min(C.hardMaxPerThrow, knocked.reduce((s, m) => s + m.tier.points, 0));
    else pts = knocked.length;
    st.score += pts;
    st.perThrow.push(pts);
    st.knockedTotal += knocked.length;

    const e = st.eraser;
    const at = cam.project(e ? e.p : [0, FLOOR, 3]);
    const x = clamp(at.x, 90, cam.W - 90);
    const y = clamp(at.y - 50, 90, cam.H - 60);
    if (!hard && knocked.length === 3) {
      st.strikes++;
      popups.add('STRIKE!', x, y, GOOD, 46, 1.2);
    } else if (knocked.length === 0) {
      st.gutters++;
      popups.add(Math.random() < 0.5 ? 'Gutter ball!' : 'Missed!', x, y, BAD, 32); // text only: don't touch the seeded rng
    } else {
      popups.add(`+${pts}`, x, y, GOOD, 40);
    }
    setPhase('resolve', C.resolvePauseMs / 1000);
  }

  function nextThrow() {
    st.throwIndex++;
    if (st.throwIndex >= C.throws) {
      setPhase('done', C.finishDelayMs / 1000);
      return;
    }
    beginReset(false);
  }

  function result() {
    return {
      gameId: 'bowling',
      variant,
      score: st.score,
      maxScore: MAX,
      passed: st.score >= (hard ? C.hardPassScore : C.passScore),
      durationMs: Math.round(st.activeSec * 1000),
      stats: {
        knocked: st.knockedTotal,
        strikes: hard ? null : st.strikes,
        gutters: st.gutters,
        perThrow: st.perThrow.join(','),
      },
      seed: rng.seed,
    };
  }

  function update(dt) {
    st.time += dt;
    wind.update(dt);
    popups.update(dt);
    if (st.eraser && !st.eraser.settled) stepEraser(st.eraser, dt);
    updateMarkers(dt);
    if (st.phase === 'ready') return;
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;

    switch (st.phase) {
      case 'reset': {
        const base = [0, C.hold.y, C.hold.z];
        st.held = [0, base[1] - 0.4 * (1 - easeOut(k)), base[2]];
        if (k >= 1) setPhase('aim');
        break;
      }
      case 'aim':
        st.held = control.heldPos([0, C.hold.y, C.hold.z], st.held, dt, C.hold.maxLiftM);
        break;
      case 'flight': {
        const e = st.eraser;
        const busy = st.markers.some((m) => m.state === 'falling');
        const waited = (st.time - st.thrownAt) * 1000;
        if ((e.settled && !busy) || waited > C.maxWaitMs) resolveThrow();
        break;
      }
      case 'resolve':
        if (k >= 1) nextThrow();
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.(result());
        }
        break;
    }
  }

  // ---------- render ----------
  function drawMarkerObj(m) {
    const { bottom, top } = markerEnds(m);
    if (m.state === 'standing') drawFloorShadow(ctx, cam, m.base[0] + 0.02, FLOOR, m.base[2] + 0.01, 0.03, 0.2);
    drawRodMarker(ctx, cam, bottom, top, m.color.hex, MR * 2);
    if (hard && m.state === 'standing' && m.pop >= 1) {
      const tp = cam.project([top[0], top[1] + 0.06, top[2]]);
      const r = clamp(tp.s * 0.03, 9, 16);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = m.color.hex;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y - r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawLabel(ctx, String(m.tier.points), tp.x, tp.y - r + r * 0.55, Math.round(r * 1.4), m.color.hex, 'center', false);
    }
  }

  function drawEraserObj(e) {
    if (!e.settled) {
      const height = e.p[1] - FLOOR;
      drawFloorShadow(ctx, cam, e.p[0], FLOOR, e.p[2], 0.09, 0.22 * clamp(1 - height / 2, 0.15, 1));
    }
    drawEraser(ctx, cam, e, ER);
  }

  function drawScene() {
    const items = st.markers.map((m) => ({ z: m.base[2], draw: () => drawMarkerObj(m) }));
    if (st.eraser) items.push({ z: st.eraser.p[2], draw: () => drawEraserObj(st.eraser) });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
  }

  function drawHeld() {
    if (st.phase !== 'reset' && st.phase !== 'aim' && st.phase !== 'ready') return;
    if (st.phase === 'aim' && !st.everThrew && !control.held.dragging) {
      const hp = cam.project(st.held);
      drawFlickHint(ctx, hp.x, hp.y - ER.length * hp.s * 0.4 - 16, st.time);
    }
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawLabel(ctx, 'POINTS', pad, pad + small, small, SOFT);
    drawLabel(ctx, `${st.score} / ${MAX}`, pad, pad + small + big * 0.95, big, INK);
    const throwsText = Array.from({ length: C.throws }, (_, i) => (st.perThrow[i] != null ? st.perThrow[i] : '–')).join('  ·  ');
    drawLabel(ctx, `Throw ${Math.min(st.throwIndex + 1, C.throws)} of ${C.throws}${hard ? ' · Hard' : ''}`, pad, pad + small + big * 0.95 + small * 1.5, small, SOFT);
    drawLabel(ctx, throwsText, pad, pad + small + big * 0.95 + small * 3, small, SOFT);

    // marker legend (bottom left)
    const icon = Math.round(clamp(cam.H * 0.07, 36, 58));
    const y = cam.H - pad - 10;
    const list = hard ? C.hard.tiers.map((t) => ({ hex: COLOR_BY_ID[t.color].hex, label: `${t.points}` })) : colors.map((c) => ({ hex: c.hex, label: '' }));
    list.forEach((it, i) => {
      const x = pad + icon * 0.5 + i * (icon + 14);
      drawMarker(ctx, x, y - icon * 0.5, icon, -Math.PI / 2, it.hex, { width: icon * 0.17 });
      if (it.label) drawLabel(ctx, it.label, x + icon * 0.28, y - icon * 0.05, Math.round(icon * 0.38), it.hex, 'left');
    });

    wind.drawIndicator(ctx, cam.W - pad, pad + 52);
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    drawBubbles();
    wind.drawStreaks(ctx, cam);
    drawHeld();
    drawHUD();
    popups.draw(ctx);
    if (debug) {
      const lines = [
        `fps ${loop ? loop.fps.toFixed(0) : '-'}  phase ${st.phase}`,
        `markers ${st.markers.map((m) => `${m.color.id}@${m.base[2].toFixed(2)}m ${m.state}`).join(', ')}`,
        `wind ${wind.mph.toFixed(1)} mph`,
      ];
      if (st.lastFlick) lines.push(`last flick ${st.lastFlick.upH.toFixed(2)} screens/s -> ${st.lastFlick.speed.toFixed(2)} m/s, aim ${st.lastFlick.yawTan.toFixed(2)}`);
      drawDebugBox(ctx, cam, lines, 520);
    }
  }

  // ---------- start ----------
  // ---------- 3D scene ----------
  buildCourtyard(stage, {
    floorY: FLOOR, buildingZ: 20, shadowCenter: [0, 4], shadowSize: 6,
    tables: [{ x: -3.8, z: 8.5, rotDeg: 15 }, { x: 4.6, z: 9.5, rotDeg: -20 }],
  });
  // Paul watches from the side
  const paul3d = createPaul3D();
  stage.scene.add(paul3d.group);
  const markerMeshes = new Map();
  let thrown3d = null, held3d = null;
  createEraser3D(ER).then((g) => { thrown3d = g; held3d = g.clone(); stage.scene.add(thrown3d, held3d); });

  function sync3D() {
    paul3d.update({ x: 1.9, z: 6.4, floorY: FLOOR, yaw: 0.35 });
    for (const mesh of markerMeshes.values()) mesh.visible = false;
    for (const m of st.markers) {
      let mesh = markerMeshes.get(m);
      if (!mesh) { mesh = createMarker3D(m.color.hex); stage.scene.add(mesh); markerMeshes.set(m, mesh); }
      const { bottom, top } = markerEnds(m);
      mesh.visible = true;
      setRodPose(mesh, bottom, top);
      mesh.scale.setScalar(Math.max(0.01, easeOut(clamp(m.pop, 0, 1))));
    }
    if (thrown3d) {
      thrown3d.visible = !!st.eraser;
      if (st.eraser) setPoseFromBasis(thrown3d, st.eraser.p, st.eraser);
      held3d.visible = st.phase === 'reset' || st.phase === 'aim' || st.phase === 'ready';
      if (held3d.visible) setPoseFromBasis(held3d, st.held, heldBasis());
    }
  }

  function drawBubbles() {
    if (!hard) return;
    for (const m of st.markers) {
      if (m.state !== 'standing' || m.pop < 1) continue;
      const { top } = markerEnds(m);
      const tp = cam.project([top[0], top[1] + 0.06, top[2]]);
      const r = clamp(tp.s * 0.03, 9, 16);
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.strokeStyle = m.color.hex;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(tp.x, tp.y - r, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      drawLabel(ctx, String(m.tier.points), tp.x, tp.y - r + r * 0.55, Math.round(r * 1.4), m.color.hex, 'center', false);
    }
  }

  if (hard) placeHardAll(); else placeRegular();
  for (const m of st.markers) m.pop = 1;
  const loop = startLoop({ update: spectate ? mirrorIn : update, render });

  if (debug) {
    window.__bowling = {
      st, wind, cam: () => cam, canvas: view.canvas,
      launch: (fl) => launch(fl),
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    };
  }

  return {
    state: () => st, // for live spectating
    start() {
      if (st.phase !== 'ready') return;
      beginReset(true);
    },
    pause() { loop.pause(); control.cancel(); },
    resume() { loop.resume(); },
    destroy() {
      loop.stop();
      control.destroy();
      stage.destroy();
    },
  };
}
