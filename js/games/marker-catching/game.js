// Marker Catching.
// A thrower across the room tosses markers at you. Each throw is a real
// projectile in 3D (gravity arc, tumbling spin), drawn with perspective so
// it grows as it gets close. Catch it by clicking/tapping it during the last
// moment of its flight (the catch window).

import { CONFIG } from './config.js';
import { MARKER_COLORS } from '../../shared/colors.js';
import { drawMarker } from '../../shared/marker.js';
import { drawBoard, drawTray, roundRectPath } from '../../shared/whiteboard.js';
import { drawGlassBar, drawLabel } from '../../shared/hud.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { attachPointer } from '../../core/input.js';
import * as Thrower from '../../shared/thrower.js';
import { createStage3D, toThree, quatFromGameDir } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createMarker3D } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';

// ---------- small math helpers ----------
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const easeIn = (t) => t * t;
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
function rotateAround(v, k, ang) { // Rodrigues' rotation of v around unit axis k
  const c = Math.cos(ang), s = Math.sin(ang);
  const kv = cross(k, v);
  const d = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
}
function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

const FONT = '"Permanent Marker", "Marker Felt", cursive';
const INK = '#1f1f22';
const MISS_RED = '#d7263d';

export function createMarkerCatching(container, host) {
  const { options = {}, seed, debug = false, onFinish } = host;
  const bullet = !!options.bullet;
  const endless = !!options.endless;
  const P = bullet ? CONFIG.bullet : CONFIG.regular;
  const WORLD = CONFIG.world;
  const FLOOR_Y = -WORLD.eyeHeight;
  const rng = createRng(seed);
  const variant = ['bullet', 'endless'].filter((k) => options[k]).join('-') || 'regular';

  const st = {
    phase: 'ready', // ready | gap | windup | flight | resolve | done
    phaseT: 0,
    phaseDur: 0,
    paused: false,
    time: 0,
    activeSec: 0,
    throwIndex: 0,
    caught: 0,
    missed: 0,
    streak: 0,
    bestStreak: 0,
    whiffs: 0,
    early: 0,
    speed: 1,
    bag: [],
    slots: endless ? [] : rng.shuffle(MARKER_COLORS).map((color) => ({ color, status: 'pending', landed: false })),
    recent: [], // endless: caught colors shown in the tray
    thrower: Thrower.createThrowerState(lerp(...WORLD.throwerZ, 0.5)),
    shot: null,
    flyers: [], // caught markers flying into the tray
    effects: [],
    popups: [],
    pointer: null,
    press: 0,
    cooldownUntil: 0,
    finished: false,
    fps: 60,
  };

  let cam = null;
  let bg = null;
  let trayH = 64;

  // Realistic 3D scene underneath, 2D HUD canvas on top (it also gets the input).
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  buildCourtyard(stage, {
    floorY: FLOOR_Y,
    buildingZ: 22,
    shadowCenter: [0, 4.5],
    shadowSize: 7,
    tables: [{ x: -3.4, z: 8.8, rotDeg: 18 }, { x: 3.9, z: 10.2, rotDeg: -12 }, { x: -7.5, z: 12.5, rotDeg: 40 }],
  });
  const paul3d = createPaul3D();
  stage.scene.add(paul3d.group);
  const markers3d = new Map(); // color id -> mesh
  function marker3dFor(color) {
    if (!markers3d.has(color.id)) {
      const m = createMarker3D(color.hex);
      m.visible = false;
      stage.scene.add(m);
      markers3d.set(color.id, m);
    }
    return markers3d.get(color.id);
  }
  const { ctx } = view;
  const detachPointer = attachPointer(view.canvas, {
    down: onPointerDown,
    move: (p) => { st.pointer = p; },
  });

  st.thrower.hand = restHand();

  // ---------- camera / layout ----------
  function onResize(size) {
    trayH = Math.round(clamp(size.h * 0.1, 56, 92));
    const playH = size.h - trayH;
    const fov = (WORLD.fovYDeg * Math.PI) / 180;
    // On narrow (phone) screens, zoom in a bit so markers aren't tiny.
    const f = Math.min(playH / 2 / Math.tan(fov / 2), size.w * 1.3);
    cam = {
      W: size.w,
      H: size.h,
      playH,
      f,
      cx: size.w / 2,
      cy: playH * 0.42,
      project(p) {
        const z = Math.max(p[2], 0.05);
        return { x: this.cx + (this.f * p[0]) / z, y: this.cy - (this.f * p[1]) / z, s: this.f / z };
      },
    };
  }

  /** Where a throw lands, from screen fractions (u, v in -1..1) at depth z. */
  function targetToWorld(u, v, z) {
    const margin = 0.11 * Math.min(cam.W, cam.playH);
    const topSafe = Math.max(margin, 110); // keep catches below the score text
    const halfX = Math.min(cam.W / 2 - margin, cam.playH * 0.95);
    const halfY = (cam.playH - margin - topSafe) / 2;
    const centerY = topSafe + halfY;
    const sx = cam.W / 2 + u * P.targetSpreadX * halfX;
    const sy = centerY + v * P.targetSpreadY * halfY;
    return [((sx - cam.cx) * z) / cam.f, ((cam.cy - sy) * z) / cam.f, z];
  }

  // ---------- background (room + back whiteboard), cached ----------
  function renderBackground(size) {
    const c = document.createElement('canvas');
    c.width = Math.round(size.w * size.dpr);
    c.height = Math.round(size.h * size.dpr);
    const g = c.getContext('2d');
    g.setTransform(size.dpr, 0, 0, size.dpr, 0, 0);
    const { w } = size;
    const back = WORLD.backWallZ;
    const seam = cam.project([0, FLOOR_Y, back]).y;

    // wall
    let gr = g.createLinearGradient(0, 0, 0, seam);
    gr.addColorStop(0, '#e9e2d2');
    gr.addColorStop(1, '#d6ccb7');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, seam);

    // whiteboard on the back wall
    const tl = cam.project([-1.8, 1.05, back]);
    const br = cam.project([1.8, -0.15, back]);
    const board = drawBoard(g, tl.x, tl.y, br.x - tl.x, br.y - tl.y, { rng: createRng(11) });
    g.save();
    g.font = `${Math.round(board.h * 0.26)}px ${FONT}`;
    g.fillStyle = 'rgba(122,63,196,0.7)';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.translate(board.x + board.w / 2, board.y + board.h * 0.42);
    g.rotate(-0.035);
    g.fillText('LAST TO LEAVE', 0, 0);
    g.restore();
    const trayTop = br.y;
    drawTray(g, tl.x + (br.x - tl.x) * 0.05, trayTop, (br.x - tl.x) * 0.9, Math.max(3, cam.f * 0.05 / back));

    // baseboard
    const bbH = (cam.f * 0.1) / back;
    g.fillStyle = '#9a8b72';
    g.fillRect(0, seam - bbH, w, bbH);

    // floor
    gr = g.createLinearGradient(0, seam, 0, cam.playH);
    gr.addColorStop(0, '#cbc1ab');
    gr.addColorStop(1, '#b3a78d');
    g.fillStyle = gr;
    g.fillRect(0, seam, w, size.h - seam);
    g.save();
    g.beginPath();
    g.rect(0, seam, w, size.h - seam);
    g.clip();
    g.strokeStyle = 'rgba(70,58,35,0.12)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = -15; x <= 15; x += 0.6) {
      const a = cam.project([x, FLOOR_Y, back]);
      const b = cam.project([x, FLOOR_Y, 0.4]);
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
    }
    for (let z = 0.6; z < back; z += 0.6) {
      const y = cam.project([0, FLOOR_Y, z]).y;
      g.moveTo(0, y);
      g.lineTo(w, y);
    }
    g.stroke();
    g.restore();

    // soft vignette
    const vg = g.createRadialGradient(w / 2, cam.playH * 0.45, Math.min(w, cam.playH) * 0.35, w / 2, cam.playH * 0.45, Math.max(w, cam.playH) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(40,30,10,0.18)');
    g.fillStyle = vg;
    g.fillRect(0, 0, w, size.h);
    return c;
  }

  // ---------- thrower ----------
  // (function declarations so they're usable before this point in the file)
  function restHand() { return Thrower.restHand(st.thrower, st.time); }
  function styleHand(style, key) { return Thrower.styleHand(st.thrower, style, key); }
  function windupHand(style, k) { return Thrower.windupHand(st.thrower, style, k, st.time); }
  function heldOrientation() { return Thrower.heldOrientation(st.thrower); }

  // ---------- throw sequence ----------
  function nextColor() {
    if (!endless) return st.slots[st.throwIndex].color;
    if (!st.bag.length) st.bag = rng.shuffle(MARKER_COLORS);
    return st.bag.pop();
  }

  function setPhase(phase, durSec = 0) {
    st.phase = phase;
    st.phaseT = 0;
    st.phaseDur = durSec;
  }

  function beginThrow() {
    Thrower.planThrowerMove(st.thrower, rng, cam, WORLD.throwerZ, P.throwerSpreadX);

    const axis = norm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]);
    st.shot = {
      color: nextColor(),
      style: rng.weighted(P.styles),
      u: rng.range(-1, 1),
      v: rng.range(-1, 1),
      T: rng.range(P.flightTimeSec) / st.speed,
      rise: rng.range(P.arcHeightM),
      axis,
      spin: rng.range(P.spinRadPerSec) * rng.sign(),
      state: 'held',
      t: 0,
      trail: [],
    };
    setPhase('gap', rng.range(P.gapMs) / 1000 / st.speed);
  }

  function release() {
    const s = st.shot;
    const p0 = st.thrower.hand.slice();
    const target = targetToWorld(s.u, s.v, WORLD.catchZ);
    s.p0 = p0;
    s.target = target;
    // A real parabola with this throw's arc height, flattened if it would leave the screen.
    const solved = Thrower.solveThrow(p0, target, s.T, s.rise, cam, cam.playH * 0.07);
    s.g = solved.g;
    s.v3 = solved.v;
    s.o0 = heldOrientation();
    s.t = 0;
    s.state = 'flying';
    setPhase('flight');
  }

  function windowMs() {
    return P.catchWindowMs / st.speed;
  }

  function shotWorld(s) {
    if (s.state === 'held') return { p: st.thrower.hand, o: heldOrientation() };
    const t = s.t;
    const p = [s.p0[0] + s.v3[0] * t, s.p0[1] + s.v3[1] * t - 0.5 * s.g * t * t, s.p0[2] + s.v3[2] * t];
    return { p, o: rotateAround(s.o0, s.axis, s.spin * t) };
  }

  function shotScreen(s) {
    const { p, o } = shotWorld(s);
    const half = mul(o, CONFIG.marker.length / 2);
    const a = add(p, half);
    const b = sub(p, half);
    if (a[2] < 0.12 || b[2] < 0.12 || p[2] < 0.12) return null;
    const A = cam.project(a);
    const B = cam.project(b);
    const C = cam.project(p);
    return {
      ax: A.x, ay: A.y, bx: B.x, by: B.y,
      x: (A.x + B.x) / 2, y: (A.y + B.y) / 2,
      len: Math.hypot(A.x - B.x, A.y - B.y),
      ang: Math.atan2(A.y - B.y, A.x - B.x),
      width: CONFIG.marker.width * C.s,
      p,
    };
  }

  function traySlot(i, n) {
    const maxW = Math.min(cam.W - 32, 780);
    const slotW = maxW / n;
    const x0 = (cam.W - maxW) / 2;
    return {
      x: x0 + slotW * (i + 0.5),
      y: cam.H - trayH * 0.5 + 1,
      len: Math.min(slotW * 0.84, trayH * 1.7),
    };
  }
  const TRAY_SLOTS = 8;

  function catchShot(geo) {
    const s = st.shot;
    s.state = 'caught';
    st.caught++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    let slotIndex;
    if (endless) {
      slotIndex = Math.min(st.recent.length, TRAY_SLOTS - 1);
      st.speed = Math.min(CONFIG.endless.maxSpeedMult, st.speed * (1 + CONFIG.endless.speedRampPerCatch));
    } else {
      slotIndex = st.throwIndex;
      st.slots[slotIndex].status = 'caught';
    }
    st.flyers.push({ color: s.color, from: { x: geo.x, y: geo.y, len: geo.len, ang: geo.ang, w: geo.width }, slotIndex, t: 0, dur: 0.45 });
    st.effects.push({ type: 'ring', x: geo.x, y: geo.y, color: s.color.hex, life: 0, max: 0.45 });
    const praise = st.streak >= 3 ? `${st.streak} in a row!` : 'Caught!';
    popup(praise, geo.x, geo.y - geo.len * 0.4 - 10, s.color.hex, 30);
    setPhase('resolve', CONFIG.resolvePauseMs / 1000);
  }

  function registerMiss() {
    const s = st.shot;
    s.state = 'missed';
    st.missed++;
    st.streak = 0;
    if (!endless) st.slots[st.throwIndex].status = 'missed';
    const geo = shotScreen(s);
    const x = clamp(geo ? geo.x : cam.W / 2, 60, cam.W - 60);
    const y = clamp(geo ? geo.y : cam.playH / 2, 70, cam.playH - 30);
    popup(endless ? `Miss! (${st.missed}/${CONFIG.endless.strikes})` : 'Missed', x, y, MISS_RED, 30);
  }

  function afterResolve() {
    if (!endless) {
      st.throwIndex++;
      if (st.throwIndex >= CONFIG.throwsPerGame) return finish();
    } else {
      st.throwIndex++;
      if (st.missed >= CONFIG.endless.strikes) return finish();
    }
    beginThrow();
  }

  function finish() {
    st.shot = null;
    setPhase('done', CONFIG.finishDelayMs / 1000);
  }

  function result() {
    const passScore = endless ? CONFIG.endless.passScore : CONFIG.passScore;
    return {
      gameId: 'marker-catching',
      variant,
      score: st.caught,
      maxScore: endless ? null : CONFIG.throwsPerGame,
      passed: st.caught >= passScore,
      durationMs: Math.round(st.activeSec * 1000),
      stats: {
        caught: st.caught,
        missed: st.missed,
        throws: st.throwIndex,
        bestStreak: st.bestStreak,
        early: st.early,
        whiffs: st.whiffs,
        topSpeed: Number(st.speed.toFixed(2)),
      },
      seed: rng.seed,
    };
  }

  // ---------- input ----------
  function onPointerDown(p) {
    st.pointer = p;
    st.press = 1;
    if (st.paused || st.phase === 'ready' || st.phase === 'done') return;
    const now = st.time * 1000;
    if (now < st.cooldownUntil) return;

    const s = st.shot;
    if (!s || s.state !== 'flying') return; // nothing to catch yet: free click
    const geo = shotScreen(s);
    if (!geo) return;

    let pad = CONFIG.catching.hitPadding * Math.min(cam.W, cam.playH);
    if (p.type === 'touch') pad = Math.max(pad, CONFIG.catching.touchMinPaddingPx);
    const d = distToSegment(p.x, p.y, geo.ax, geo.ay, geo.bx, geo.by);
    const hit = d <= geo.width / 2 + pad;
    const remaining = (s.T - s.t) * 1000;
    const inWindow = remaining <= windowMs() && remaining >= -CONFIG.catching.graceAfterPlaneMs;

    if (hit && inWindow) {
      catchShot(geo);
      return;
    }
    if (hit) {
      st.early++;
      popup('Too early!', p.x, p.y - 34, '#555a63', 22);
    } else {
      st.whiffs++;
      popup('Whiff', p.x, p.y - 30, '#8a8f98', 18);
    }
    st.effects.push({ type: 'puff', x: p.x, y: p.y, life: 0, max: 0.3 });
    st.cooldownUntil = now + CONFIG.catching.fumbleCooldownMs;
  }

  function popup(text, x, y, color, size) {
    st.popups.push({ text, x, y, color, size, life: 0, max: 0.9 });
  }

  // ---------- update ----------
  function update(dt) {
    st.time += dt;
    const t = st.thrower;

    if (st.phase === 'ready') {
      t.hand = restHand();
      return;
    }
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;

    switch (st.phase) {
      case 'gap': {
        Thrower.walkThrower(t, k, dt, st.time);
        if (k >= 1) setPhase('windup', rng.range(P.windupMs) / 1000 / Math.sqrt(st.speed));
        break;
      }
      case 'windup': {
        t.moving = lerp(t.moving, 0, Math.min(1, dt * 10));
        t.hand = windupHand(st.shot.style, k);
        if (k >= 1) release();
        break;
      }
      case 'flight': {
        const s = st.shot;
        s.t += dt;
        const follow = easeOut(clamp(s.t / 0.25, 0, 1));
        t.hand = lerp3(styleHand(s.style, 'release'), styleHand(s.style, 'follow'), follow);
        const geo = shotScreen(s);
        if (geo) {
          s.trail.push({ x: geo.x, y: geo.y, w: geo.width });
          if (s.trail.length > 6) s.trail.shift();
        }
        const remainingMs = (s.T - s.t) * 1000;
        if (s.state === 'flying' && remainingMs < -CONFIG.catching.graceAfterPlaneMs) registerMiss();
        if (s.state === 'missed' && s.t - s.T > 0.4) {
          s.state = 'gone';
          setPhase('resolve', CONFIG.resolvePauseMs / 1000);
        }
        break;
      }
      case 'resolve': {
        t.hand = lerp3(t.hand, restHand(), Math.min(1, dt * 6));
        if (k >= 1) afterResolve();
        break;
      }
      case 'done': {
        t.hand = lerp3(t.hand, restHand(), Math.min(1, dt * 6));
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.(result());
        }
        break;
      }
    }
  }

  function updateFx(dt) {
    st.press = Math.max(0, st.press - dt * 6);
    for (const fx of st.effects) fx.life += dt;
    st.effects = st.effects.filter((fx) => fx.life < fx.max);
    for (const p of st.popups) p.life += dt;
    st.popups = st.popups.filter((p) => p.life < p.max);
    for (const f of st.flyers) {
      f.t += dt;
      if (f.t >= f.dur && !f.landed) {
        f.landed = true;
        if (endless) {
          st.recent.push(f.color);
          if (st.recent.length > TRAY_SLOTS) st.recent.shift();
        } else {
          st.slots[f.slotIndex].landed = true;
        }
      }
    }
    st.flyers = st.flyers.filter((f) => !f.landed);
  }

  // ---------- render ----------
  // Placeholder thrower (a Member character will replace this in the theming phase).
  function drawThrower() { Thrower.drawThrower(ctx, cam, st.thrower, FLOOR_Y); }

  // Put the 3D markers and Paul where the game says they are.
  function sync3D() {
    paul3d.update({ x: st.thrower.x, z: st.thrower.z, floorY: FLOOR_Y, yaw: 0, walk: st.thrower.walk, moving: st.thrower.moving, rightHand: st.thrower.hand });
    for (const m of markers3d.values()) m.visible = false;
    const s = st.shot;
    if (!s || s.state === 'caught' || s.state === 'gone') return;
    if (s.state === 'missed' && s.t - s.T > 0.25) return;
    const { p, o } = shotWorld(s);
    if (p[2] < 0.12) return;
    const m = marker3dFor(s.color);
    m.visible = true;
    toThree(p, m.position);
    quatFromGameDir(o, m.quaternion);
  }

  // (the marker itself is 3D now; this only draws the debug overlay)
  function drawShot() {
    const s = st.shot;
    if (!s || s.state === 'caught' || s.state === 'gone') return;
    const geo = shotScreen(s);
    if (!geo) return;

    if (debug && s.state === 'flying') {
      const remaining = (s.T - s.t) * 1000;
      const inWindow = remaining <= windowMs() && remaining >= -CONFIG.catching.graceAfterPlaneMs;
      const pad = CONFIG.catching.hitPadding * Math.min(cam.W, cam.playH);
      ctx.save();
      ctx.strokeStyle = inWindow ? 'rgba(31,157,76,0.9)' : 'rgba(242,133,29,0.8)';
      ctx.lineWidth = (geo.width / 2 + pad) * 2;
      ctx.globalAlpha = 0.25;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(geo.ax, geo.ay);
      ctx.lineTo(geo.bx, geo.by);
      ctx.stroke();
      ctx.globalAlpha = 1;
      const tp = cam.project(s.target);
      ctx.strokeStyle = 'rgba(215,38,61,0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tp.x - 10, tp.y); ctx.lineTo(tp.x + 10, tp.y);
      ctx.moveTo(tp.x, tp.y - 10); ctx.lineTo(tp.x, tp.y + 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawFlyers() {
    for (const f of st.flyers) {
      const k = easeInOut(clamp(f.t / f.dur, 0, 1));
      const to = endless ? traySlot(f.slotIndex, TRAY_SLOTS) : traySlot(f.slotIndex, CONFIG.throwsPerGame);
      let dAng = -f.from.ang;
      dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
      const x = lerp(f.from.x, to.x, k);
      const y = lerp(f.from.y, to.y, k) - Math.sin(Math.PI * k) * 40;
      const len = lerp(f.from.len, to.len, k);
      const w = lerp(f.from.w, to.len * 0.13, k);
      drawMarker(ctx, x, y, len, f.from.ang + dAng * k, f.color.hex, { width: w });
    }
  }

  function drawEffects() {
    for (const fx of st.effects) {
      const k = fx.life / fx.max;
      ctx.save();
      if (fx.type === 'ring') {
        ctx.strokeStyle = fx.color;
        ctx.globalAlpha = 1 - k;
        ctx.lineWidth = 6 * (1 - k) + 1;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, 20 + k * 70, 0, Math.PI * 2);
        ctx.stroke();
      } else if (fx.type === 'puff') {
        ctx.fillStyle = 'rgba(80,85,95,0.35)';
        ctx.globalAlpha = 1 - k;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + 0.4;
          const r = 8 + k * 24;
          ctx.beginPath();
          ctx.arc(fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r, 3.5 * (1 - k) + 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  function drawText(text, x, y, size, color, align = 'left') {
    drawLabel(ctx, text, x, y, size, color, align); // shared HUD style
  }


  function drawHUD() {
    // tray along the bottom
    drawGlassBar(ctx, 0, cam.H - trayH, cam.W, trayH);
    if (!endless) {
      st.slots.forEach((slot, i) => {
        const p = traySlot(i, CONFIG.throwsPerGame);
        const w = p.len * 0.13;
        if (slot.status === 'caught' && slot.landed) {
          drawMarker(ctx, p.x, p.y, p.len, 0, slot.color.hex, { width: w, shadow: true });
        } else if (slot.status === 'missed') {
          drawMarker(ctx, p.x, p.y, p.len, 0, slot.color.hex, { width: w, alpha: 0.22 });
          ctx.save();
          ctx.strokeStyle = MISS_RED;
          ctx.lineWidth = 3.5;
          ctx.lineCap = 'round';
          const r = Math.min(p.len * 0.22, trayH * 0.3);
          ctx.beginPath();
          ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x + r, p.y + r);
          ctx.moveTo(p.x + r, p.y - r); ctx.lineTo(p.x - r, p.y + r);
          ctx.stroke();
          ctx.restore();
        } else if (slot.status === 'pending' || !slot.landed) {
          ctx.save();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = i === st.throwIndex && st.phase !== 'ready' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.28)';
          ctx.lineWidth = 1.5;
          roundRectPath(ctx, p.x - p.len / 2, p.y - w * 0.7, p.len, w * 1.4, w * 0.6);
          ctx.stroke();
          ctx.restore();
        }
      });
    } else {
      st.recent.forEach((color, i) => {
        const p = traySlot(i, TRAY_SLOTS);
        drawMarker(ctx, p.x, p.y, p.len, 0, color.hex, { width: p.len * 0.13, shadow: true });
      });
    }

    // score (top left)
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawText('CAUGHT', pad, pad + small, small, '#565a62');
    drawText(endless ? `${st.caught}` : `${st.caught} / ${CONFIG.throwsPerGame}`, pad, pad + small + big * 0.95, big, INK);
    let line = endless
      ? `Speed ×${st.speed.toFixed(2)}`
      : `Throw ${Math.min(st.throwIndex + 1, CONFIG.throwsPerGame)} of ${CONFIG.throwsPerGame}`;
    if (bullet) line += ' · Bullet';
    drawText(line, pad, pad + small + big * 0.95 + small * 1.5, small, '#565a62');

    // endless strikes (top center)
    if (endless) {
      const n = CONFIG.endless.strikes;
      const size = Math.round(clamp(cam.H * 0.045, 24, 38));
      const gap = size * 0.35;
      const total = n * size + (n - 1) * gap;
      const x0 = cam.W / 2 - total / 2;
      const y0 = pad;
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (size + gap);
        ctx.save();
        ctx.fillStyle = 'rgba(15,10,20,0.55)';
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, x, y0, size, size, 5);
        ctx.fill();
        ctx.stroke();
        if (i < st.missed) {
          ctx.strokeStyle = MISS_RED;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          const m = size * 0.22;
          ctx.beginPath();
          ctx.moveTo(x + m, y0 + m); ctx.lineTo(x + size - m, y0 + size - m);
          ctx.moveTo(x + size - m, y0 + m); ctx.lineTo(x + m, y0 + size - m);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  function drawPopups() {
    for (const p of st.popups) {
      const k = p.life / p.max;
      ctx.save();
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      const scale = k < 0.15 ? 0.7 + (k / 0.15) * 0.3 : 1;
      drawText(p.text, p.x, p.y - k * 28, Math.round(p.size * scale), p.color, 'center');
      ctx.restore();
    }
  }

  function drawReticle() {
    const p = st.pointer;
    if (!p || p.type !== 'mouse') return;
    const pad = CONFIG.catching.hitPadding * Math.min(cam.W, cam.playH);
    const busy = st.time * 1000 < st.cooldownUntil;
    const r = (pad + 4) * (1 - st.press * 0.35);
    ctx.save();
    ctx.strokeStyle = busy ? 'rgba(255,90,110,0.75)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawDebug() {
    const s = st.shot;
    const lines = [
      `fps ${st.fps.toFixed(0)}`,
      `phase ${st.phase}`,
      `window ${windowMs().toFixed(0)}ms  speed ×${st.speed.toFixed(2)}`,
    ];
    if (s && s.state !== 'held') lines.push(`time to hands ${((s.T - s.t) * 1000).toFixed(0)}ms  T=${s.T.toFixed(2)}s  ${s.style}`);
    ctx.save();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(cam.W - 330, cam.playH - 16 * lines.length - 14, 320, 16 * lines.length + 8);
    ctx.fillStyle = '#9ef0b5';
    lines.forEach((l, i) => ctx.fillText(l, cam.W - 322, cam.playH - 16 * (lines.length - i) - 2));
    ctx.restore();
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    drawShot();
    drawEffects();
    drawHUD();
    drawFlyers();
    drawPopups();
    drawReticle();
    if (debug) drawDebug();
  }

  // ---------- loop ----------
  let raf = 0;
  let last = performance.now();
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const rawDt = (now - last) / 1000;
    last = now;
    const dt = Math.min(rawDt, 1 / 30);
    if (rawDt > 0) st.fps = lerp(st.fps, 1 / rawDt, 0.05);
    if (!st.paused) {
      update(dt);
      updateFx(dt);
    }
    render();
  }
  raf = requestAnimationFrame(frame);

  // Debug-only hook for inspecting/tuning from the browser console.
  if (debug) {
    window.__markerCatching = {
      st, geo: () => st.shot && shotScreen(st.shot), windowMs, canvas: view.canvas, stage, paul3d,
      // advance the game by `sec` without the animation loop (for automated tests)
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { update(dt); updateFx(dt); } render(); },
    };
  }

  return {
    start() {
      if (st.phase !== 'ready') return;
      beginThrow();
    },
    pause() { st.paused = true; },
    resume() { st.paused = false; last = performance.now(); },
    destroy() {
      cancelAnimationFrame(raf);
      detachPointer();
      stage.destroy();
    },
  };
}
