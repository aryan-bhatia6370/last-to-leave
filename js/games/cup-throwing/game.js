// Cup Throwing.
// Lob all 8 marker colors, one at a time, into a red solo cup on the floor.
// Every marker stays where it ends up: in the cup, or on the floor.
// Regular: the cup stays put all game. Moving Cup: it moves after each throw.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { MARKER_COLORS } from '../../shared/colors.js';
import { createCamera, renderRoom } from '../../shared/scene3d.js';
import { createThrowControl, stepBody, spinBasis, bounceOffPaul, SAFE_HALF_WIDTH } from '../../shared/throwing.js';
import { createPopups, drawLabel, drawFlickHint, drawDebugBox, drawBadge } from '../../shared/hud.js';
import { drawCup, clipToCupOpening, drawRodMarker, drawFloorShadow } from '../../shared/objects3d.js';
import { drawMarker } from '../../shared/marker.js';
import { startLoop } from '../../shared/gameLoop.js';
import { drawPaul, drawPaulHand } from '../../shared/paul.js';
import { createStage3D, toThree } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createSoloCup, createMarkerPool, setRodPose } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';
import { add, sub, mul, dot, cross, norm, len, lerp, lerp3, clamp, rotateAround, easeInOut, easeOut } from '../../shared/vec3.js';

const INK = '#1f1f22';
const SOFT = '#565a62';
const GOOD = '#1f9d4c';
const BAD = '#d7263d';

export function createCupThrowing(container, host) {
  // Online watching: st is copied from the player's live feed, nothing is simulated here.
  const spectate = host.options?.spectate || null;
  const mirrorIn = () => { const s = spectate.frame(); if (s) Object.assign(st, s); };
  const { options = {}, seed, debug = false, onFinish } = host;
  const C = CONFIG;
  const W = C.world;
  const HELD = !!C.cup.heldByPaul; // Paul holds the cup (true) or it stands on the floor (false)
  const EYE = HELD ? W.eyeHeight : W.eyeHeightFloorCup;
  const FLOOR = -EYE;
  const CUP_BASE_Y = FLOOR + (HELD ? C.cup.holdHeight : 0);
  const CUP = C.cup;
  const RIM_Y = CUP_BASE_Y + CUP.height;
  const ML = C.marker.length;
  const MR = C.marker.width / 2;
  const moving = !!options.moving;
  const variant = moving ? 'moving' : 'regular';
  const rng = createRng(seed);
  const luck = createRng((seed ^ 0x9e3779b9) >>> 0); // rim rattles: kept apart so the throws/cup spots never depend on outcomes
  const popups = createPopups();
  const order = rng.shuffle(MARKER_COLORS);
  const TOTAL = order.length;

  const st = {
    phase: 'ready', // ready | setup | aim | flight | resolve | done
    phaseT: 0,
    phaseDur: 0,
    time: 0,
    activeSec: 0,
    throwIndex: 0,
    inCup: 0,
    results: [], // 'in' | 'miss'
    stats: { rattledIn: 0, rimOuts: 0, short: 0, long: 0, wide: 0 },
    cup: null,
    cupFrom: null,
    cupTo: null,
    cupMarkers: [], // { color, a, lean, off, anim, from: {back, cap} }
    floorMarkers: [], // thrown markers that missed (settled or still moving)
    active: null,
    held: [0, C.hold.y, C.hold.z],
    thrownAt: 0,
    everThrew: false,
    lastFlick: null,
    paulWalk: 0,
    paulMoving: 0,
    paulFlinch: 0,
    curPath: [],
    lastPath: [],
    pathT: 0,
    finished: false,
  };

  let cam = null;
  let bg = null;
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  const { ctx } = view;
  const control = createThrowControl({
    canvas: view.canvas,
    cfg: { ...C.throw, powerScale: HELD ? C.throw.powerScale : C.throw.powerScaleFloorCup },
    getCam: () => cam,
    canThrow: () => !loop.paused && st.phase === 'aim',
    onThrow: launch,
    onWeak: () => {
      const hp = cam.project(st.held);
      popups.add('Flick it faster!', hp.x, hp.y - 110, SOFT, 22);
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

  function randomSpot() {
    const z = rng.range(C.spot.distance);
    const x = rng.range(-1, 1) * z * SAFE_HALF_WIDTH * C.spot.offsetFrac; // same spot on every screen
    return { x, z };
  }

  const cupBase = () => [st.cup.x, CUP_BASE_Y, st.cup.z];

  // ---------- markers ----------
  function heldBasis() {
    // pointing up and away, cap first
    const r = norm([0.12 + Math.sin(st.time * 1.6) * 0.04, 0.8, 0.55]);
    const u = norm(cross(r, [1, 0, 0]));
    return { r, u, n: norm(cross(u, r)) };
  }

  function ends(p, r) {
    return { back: sub(p, mul(r, ML / 2)), cap: add(p, mul(r, ML / 2)) };
  }

  function launch(fl) {
    const b = heldBasis();
    const spin = rng.range(C.marker.spinRadPerSec) * rng.sign();
    const tumbleAxis = norm(add(b.u, mul(b.n, rng.range(-0.4, 0.4))));
    st.active = {
      color: order[st.throwIndex],
      p: st.held.slice(),
      v: fl.v,
      ...b,
      w: mul(tumbleAxis, spin),
      decided: false,
      rimmed: false,
      onFloor: false,
      settled: false,
    };
    st.floorMarkers.push(st.active);
    st.thrownAt = st.time;
    st.everThrew = true;
    st.lastFlick = fl;
    setPhase('flight');
  }

  function popupAt(world, text, color, size = 32) {
    const sp = cam.project(world);
    popups.add(text, clamp(sp.x, 80, cam.W - 80), clamp(sp.y - 40, 90, cam.H - 60), color, size);
  }

  function goIn(m, I, rattled) {
    m.decided = true;
    st.inCup++;
    st.results[st.throwIndex] = 'in';
    if (rattled) st.stats.rattledIn++;
    st.floorMarkers = st.floorMarkers.filter((o) => o !== m);
    const from = ends(I, m.r);
    // where it comes to rest, relative to the cup
    st.cupMarkers.push({
      color: m.color,
      a: luck.range(0, Math.PI * 2),
      lean: luck.range(0.28, 0.48),
      off: luck.range(0, 0.014),
      anim: 0,
      from: { back: sub(from.back, cupBase()), cap: sub(from.cap, cupBase()) },
    });
    m.inCup = true;
    popupAt(I, rattled ? 'Rattled in!' : 'IN!', GOOD, rattled ? 34 : 44);
  }

  function missed(m) {
    m.decided = true;
    st.results[st.throwIndex] = 'miss';
    let reason;
    if (m.rimmed) {
      reason = 'rimOuts';
    } else {
      const dx = m.p[0] - st.cup.x;
      const dz = m.p[2] - st.cup.z;
      reason = Math.abs(dx) > Math.abs(dz) * 0.8 ? 'wide' : dz < 0 ? 'short' : 'long';
    }
    st.stats[reason]++;
    const text = { rimOuts: 'Rimmed out!', wide: 'Wide!', short: 'Short!', long: 'Long!' }[reason];
    popupAt(m.p, text, BAD, 30);
  }

  function cupMarkerEnds(cm) {
    const base = cupBase();
    const bottom = [base[0] - Math.cos(cm.a) * cm.off, CUP_BASE_Y + 0.006, base[2] - Math.sin(cm.a) * cm.off];
    const dir = norm([Math.cos(cm.a) * cm.lean, 1, Math.sin(cm.a) * cm.lean]);
    const rest = { back: bottom, cap: add(bottom, mul(dir, ML)) };
    if (cm.anim >= 1) return rest;
    const k = easeOut(cm.anim);
    return {
      back: lerp3(add(cm.from.back, base), rest.back, k),
      cap: lerp3(add(cm.from.cap, base), rest.cap, k),
    };
  }

  function settleFlat(m, h) {
    let target = [m.r[0], 0, m.r[2]];
    if (len(target) < 0.05) target = [1, 0, 0];
    target = norm(target);
    const axis = cross(m.r, target);
    const sinA = len(axis);
    const angle = Math.atan2(sinA, dot(m.r, target));
    if (angle < 0.02 || sinA < 1e-5) return true;
    const ax = mul(axis, 1 / sinA);
    const a = Math.min(angle, h * 12);
    m.r = rotateAround(m.r, ax, a);
    m.u = rotateAround(m.u, ax, a);
    m.n = norm(cross(m.u, m.r));
    return false;
  }

  function stepMarker(m, dt) {
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    const rest = FLOOR + MR;
    const paulSpot = HELD ? paulPose() : null;
    for (let i = 0; i < steps && !m.settled && !m.inCup; i++) {
      const prev = m.p;
      if (paulSpot && bounceOffPaul(m, paulSpot) && !m.hitPaul) { m.hitPaul = true; st.paulFlinch = 1; }
      if (!m.onFloor) {
        stepBody(m, h, { gravity: W.gravity, drag: C.marker.drag });
        spinBasis(m, m.w, h);
      } else {
        const vh = Math.hypot(m.v[0], m.v[2]);
        const dec = C.floor.friction * h;
        m.v = vh <= dec ? [0, 0, 0] : [m.v[0] * (vh - dec) / vh, 0, m.v[2] * (vh - dec) / vh];
        m.p = add(m.p, mul(m.v, h));
        m.p[1] = rest;
        const flat = settleFlat(m, h);
        if (vh < 0.03 && flat) m.settled = true;
      }

      const c = st.cup;
      const dh = Math.hypot(m.p[0] - c.x, m.p[2] - c.z);

      // down through the rim?
      if (!m.decided && prev[1] > RIM_Y && m.p[1] <= RIM_Y && m.v[1] < 0) {
        const I = lerp3(prev, m.p, (prev[1] - RIM_Y) / (prev[1] - m.p[1]));
        const di = Math.hypot(I[0] - c.x, I[2] - c.z);
        if (di <= CUP.inRadius) {
          goIn(m, I, false);
          return;
        }
        if (di <= CUP.rimRadius + CUP.rimZone && !m.rimmed) {
          m.rimmed = true;
          const closeness = clamp((CUP.rimRadius + CUP.rimZone - di) / (CUP.rimRadius + CUP.rimZone - CUP.inRadius), 0, 1);
          if (luck.chance(CUP.rattleInChance * closeness)) {
            goIn(m, I, true);
            return;
          }
          // bounce off the rim, outward
          const out = norm([I[0] - c.x, 0, I[2] - c.z]);
          const sp = Math.hypot(m.v[0], m.v[2]);
          m.v = [out[0] * (0.5 + sp * 0.25), 1.1, out[2] * (0.5 + sp * 0.25)];
          m.p = [c.x + out[0] * (CUP.rimRadius + 0.02), RIM_Y + 0.01, c.z + out[2] * (CUP.rimRadius + 0.02)];
          m.w = mul(norm([luck.range(-1, 1), luck.range(-1, 1), luck.range(-1, 1)]), luck.range(8, 16));
          popupAt(I, 'Rim!', '#a35b00', 24);
        }
      }

      // bounce off the cup's side
      if (m.p[1] < RIM_Y && m.p[1] > CUP_BASE_Y) {
        const frac = (m.p[1] - CUP_BASE_Y) / CUP.height;
        const rAt = CUP.bottomRadius + (CUP.rimRadius - CUP.bottomRadius) * frac + MR + 0.004;
        if (dh < rAt) {
          const out = dh > 1e-4 ? norm([m.p[0] - c.x, 0, m.p[2] - c.z]) : [0, 0, -1];
          m.p = [c.x + out[0] * rAt, m.p[1], c.z + out[2] * rAt];
          const vn = m.v[0] * out[0] + m.v[2] * out[2];
          if (vn < 0) m.v = [(m.v[0] - 1.5 * vn * out[0]) * 0.6, m.v[1] * 0.6, (m.v[2] - 1.5 * vn * out[2]) * 0.6];
        }
      }

      // floor
      if (!m.onFloor && m.p[1] < rest) {
        m.p[1] = rest;
        if (!m.decided) missed(m);
        if (m.v[1] < -0.8) {
          m.v = [m.v[0] * 0.6, -m.v[1] * C.floor.bounce, m.v[2] * 0.6];
          m.w = mul(m.w, 0.5);
        } else {
          m.v = [m.v[0], 0, m.v[2]];
          m.w = [0, 0, 0];
          m.onFloor = true;
        }
      }
      if (m.p[2] > W.backWallZ - 0.05) {
        m.p[2] = W.backWallZ - 0.05;
        m.v = [m.v[0], m.v[1], -Math.abs(m.v[2]) * 0.3];
      }
    }
  }

  // ---------- flow ----------
  function beginSetup(first) {
    st.cupFrom = { ...st.cup };
    st.cupTo = !first && moving ? randomSpot() : { ...st.cup };
    st.held = [0, C.hold.y - 0.4, C.hold.z];
    const cupMoves = st.cupTo.x !== st.cupFrom.x || st.cupTo.z !== st.cupFrom.z;
    setPhase('setup', cupMoves ? C.cupMoveMs / 1000 : 0.35);
  }

  function nextThrow() {
    st.lastPath = st.curPath;
    st.curPath = [];
    st.throwIndex++;
    st.active = null;
    if (st.throwIndex >= TOTAL) {
      setPhase('done', C.finishDelayMs / 1000);
      return;
    }
    beginSetup(false);
  }

  function result() {
    return {
      gameId: 'cup-throwing',
      variant,
      score: st.inCup,
      maxScore: TOTAL,
      passed: st.inCup >= C.passScore,
      durationMs: Math.round(st.activeSec * 1000),
      stats: { inCup: st.inCup, ...st.stats },
      seed: rng.seed,
    };
  }

  function update(dt) {
    st.paulFlinch = Math.max(0, st.paulFlinch - dt * 3);
    st.time += dt;
    popups.update(dt);
    for (const m of st.floorMarkers) if (!m.settled) stepMarker(m, dt);
    for (const cm of st.cupMarkers) cm.anim = Math.min(1, cm.anim + dt / 0.22);
    if (st.phase === 'ready') return;
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;

    switch (st.phase) {
      case 'setup': {
        const e = easeInOut(k);
        st.cup = { x: lerp(st.cupFrom.x, st.cupTo.x, e), z: lerp(st.cupFrom.z, st.cupTo.z, e) };
        const moved = Math.hypot(st.cupTo.x - st.cupFrom.x, st.cupTo.z - st.cupFrom.z) > 0.05;
        st.paulMoving = lerp(st.paulMoving, moved && k < 0.95 ? 1 : 0, Math.min(1, dt * 10));
        st.paulWalk += dt * 11 * st.paulMoving;
        st.held = [0, C.hold.y - 0.4 * (1 - easeOut(k)), C.hold.z];
        if (k >= 1) setPhase('aim');
        break;
      }
      case 'aim':
        st.held = control.heldPos([0, C.hold.y, C.hold.z], st.held, dt, C.hold.maxLiftM);
        break;
      case 'flight': {
        const m = st.active;
        // remember this throw's path (shown faintly while you aim the next one)
        if (!m.decided && !m.onFloor && (!st.curPath.length || st.time - st.pathT > 0.035)) {
          st.curPath.push(m.p.map((v) => Math.round(v * 1000) / 1000));
          st.pathT = st.time;
        }
        const waited = (st.time - st.thrownAt) * 1000;
        if ((m.decided && (m.settled || m.inCup)) || waited > C.maxWaitMs) {
          if (!m.decided) missed(m);
          setPhase('resolve', C.resolvePauseMs / 1000);
        }
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
  // Paul stands behind the cup, holding it out at his hip.
  function paulPose() {
    const c = st.cup;
    return {
      x: c.x - C.paul.sideOffset, z: c.z + C.paul.behindCup, floorY: FLOOR, yaw: 0, walk: st.paulWalk, moving: st.paulMoving, flinch: st.paulFlinch,
      rightHand: [c.x + CUP.rimRadius * 0.55, CUP_BASE_Y + CUP.height * 0.45, c.z + 0.035],
    };
  }

  function drawCupAndContents() {
    const shape = drawCup(ctx, cam, cupBase(), { ...CUP, shadowY: HELD ? null : FLOOR });
    if (!st.cupMarkers.length) return;
    ctx.save();
    clipToCupOpening(ctx, cam, shape);
    for (const cm of st.cupMarkers) {
      const e = cupMarkerEnds(cm);
      drawRodMarker(ctx, cam, e.back, e.cap, cm.color.hex, C.marker.width);
    }
    ctx.restore();
  }

  function drawCupScene() {
    drawCupAndContents();
    if (HELD) {
      // fingers wrapped around the front of the cup
      const c = st.cup;
      drawPaulHand(ctx, cam, [c.x + CUP.rimRadius * 0.62, CUP_BASE_Y + CUP.height * 0.42, c.z - 0.045], 0.026);
      drawPaulHand(ctx, cam, [c.x + CUP.rimRadius * 0.4, CUP_BASE_Y + CUP.height * 0.3, c.z - 0.055], 0.022);
    }
  }

  function drawThrown(m) {
    if (!m.onFloor) {
      const height = m.p[1] - FLOOR;
      drawFloorShadow(ctx, cam, m.p[0], FLOOR, m.p[2], 0.06, 0.2 * clamp(1 - height / 2, 0.15, 1));
    }
    const e = ends(m.p, m.r);
    drawRodMarker(ctx, cam, e.back, e.cap, m.color.hex, C.marker.width);
  }

  function drawScene() {
    const items = [{ z: st.cup.z, draw: drawCupScene }];
    if (HELD) items.push({ z: st.cup.z + C.paul.behindCup, draw: () => drawPaul(ctx, cam, paulPose()) });
    for (const m of st.floorMarkers) items.push({ z: m.p[2], draw: () => drawThrown(m) });
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
  }

  function drawHeld() {
    if (st.phase !== 'setup' && st.phase !== 'aim' && st.phase !== 'ready') return;
    const color = order[st.throwIndex];
    if (!color) return;
    const e = ends(st.held, heldBasis().r);
    if (st.phase === 'aim' && !st.everThrew && !control.held.dragging) {
      const hp = cam.project(e.cap);
      drawFlickHint(ctx, hp.x, hp.y - 20, st.time);
    }
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawLabel(ctx, 'IN THE CUP', pad, pad + small, small, SOFT);
    drawLabel(ctx, `${st.inCup} / ${TOTAL}`, pad, pad + small + big * 0.95, big, INK);
    drawLabel(ctx, `Marker ${Math.min(st.throwIndex + 1, TOTAL)} of ${TOTAL}${moving ? ' · Moving cup' : ''}`, pad, pad + small + big * 0.95 + small * 1.5, small, SOFT);

    // the 8 markers, in throwing order (bottom left)
    const len8 = Math.round(clamp(cam.W * 0.045, 30, 52));
    const gap = len8 * 0.32;
    const y = cam.H - pad - 8;
    order.forEach((c, i) => {
      const x = pad + len8 / 2 + i * (len8 * 0.32 + gap);
      const res = st.results[i];
      const isNow = i === st.throwIndex && !res;
      ctx.save();
      ctx.globalAlpha = res || isNow ? 1 : 0.35;
      drawMarker(ctx, x, y - len8 * 0.5, len8, -Math.PI / 2, c.hex, { width: len8 * 0.2 });
      ctx.restore();
      if (res) drawBadge(ctx, x + len8 * 0.12, y - len8 * 1.02, Math.max(8, len8 * 0.2), res === 'in');
    });
  }

  // Two quiet aids (playtest: hard to judge distance): your last throw's path as a
  // faint dotted line while you aim, and the cup's shadow straight below it.
  function drawAimHelp() {
    // how far away the cup is, in meters, just above its rim (a depth cue while aiming)
    if (st.phase === 'aim' || st.phase === 'setup') {
      const c = st.cup;
      const top = cam.project([c.x, CUP_BASE_Y + C.cup.height + 0.06, c.z]);
      if (top.z > 0.2) drawLabel(ctx, `${c.z.toFixed(1)} m`, top.x, top.y, 18, 'rgba(255,255,255,0.85)', 'center');
    }
    if ((st.phase === 'aim' || st.phase === 'setup') && st.lastPath.length > 2) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 7]);
      ctx.beginPath();
      st.lastPath.forEach((p, i) => { const q = cam.project(p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
      ctx.restore();
    }
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    drawAimHelp();
    drawHeld();
    drawHUD();
    popups.draw(ctx);
    if (debug) {
      const lines = [
        `fps ${loop.fps.toFixed(0)}  phase ${st.phase}`,
        `cup at x ${st.cup.x.toFixed(2)}, ${st.cup.z.toFixed(2)} m away`,
      ];
      if (st.lastFlick) lines.push(`last flick ${st.lastFlick.upH.toFixed(2)} screens/s -> ${st.lastFlick.speed.toFixed(2)} m/s, aim ${st.lastFlick.yawTan.toFixed(2)}`);
      drawDebugBox(ctx, cam, lines);
      // the make zone
      ctx.save();
      ctx.setLineDash([5, 4]);
      for (const [r, col] of [[CUP.inRadius, 'rgba(31,157,76,0.9)'], [CUP.rimRadius + CUP.rimZone, 'rgba(242,133,29,0.9)']]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i <= 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          const p = cam.project([st.cup.x + Math.cos(a) * r, RIM_Y, st.cup.z + Math.sin(a) * r]);
          if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ---------- start ----------
  st.cup = randomSpot();

  // ---------- 3D scene ----------
  buildCourtyard(stage, {
    floorY: FLOOR, buildingZ: 20, shadowCenter: [0, 3], shadowSize: 6,
    tables: [{ x: -3.6, z: 7.8, rotDeg: 15 }, { x: 4.3, z: 8.8, rotDeg: -20 }],
  });
  const paul3d = createPaul3D();
  stage.scene.add(paul3d.group);
  paul3d.group.visible = HELD;
  const cup3d = createSoloCup(CUP);
  stage.scene.add(cup3d);
  const pool = createMarkerPool(stage.scene);

  function sync3D() {
    if (HELD) paul3d.update(paulPose());
    toThree(cupBase(), cup3d.position);
    pool.begin();
    st.cupMarkers.forEach((cm, i) => {
      const e = cupMarkerEnds(cm);
      setRodPose(pool.get(`cup-${i}-${cm.color.id}`, cm.color.hex), e.back, e.cap);
    });
    st.floorMarkers.forEach((m) => {
      const e = ends(m.p, m.r);
      setRodPose(pool.get(`thrown-${m.color.id}`, m.color.hex), e.back, e.cap);
    });
    const color = order[st.throwIndex];
    if (color && (st.phase === 'setup' || st.phase === 'aim' || st.phase === 'ready')) {
      const e = ends(st.held, heldBasis().r);
      setRodPose(pool.get(`held-${color.id}`, color.hex), e.back, e.cap);
    }
    pool.end();
  }
  const loop = startLoop({ update: spectate ? mirrorIn : update, render });

  if (debug) {
    window.__cupThrowing = {
      st, cam: () => cam, canvas: view.canvas,
      launch: (fl) => launch(fl),
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    };
  }

  return {
    state: () => st, // for live spectating
    start() {
      if (st.phase !== 'ready') return;
      beginSetup(true);
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
