// Cup Catching.
// The thrower lobs markers at you; you hold a red solo cup (it follows your
// mouse/finger) and get it under them so they drop in through the top.
// Off-center catches bounce off the rim; too-high cups get hit on the side.
// Whipping the cup around can slosh markers back out.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { attachPointer } from '../../core/input.js';
import { MARKER_COLORS } from '../../shared/colors.js';
import { createCamera, renderRoom } from '../../shared/scene3d.js';
import { drawCup, clipToCupOpening, drawRodMarker } from '../../shared/objects3d.js';
import { createPopups, drawLabel, drawBadge, drawDebugBox } from '../../shared/hud.js';
import { drawMarker } from '../../shared/marker.js';
import { roundRectPath } from '../../shared/whiteboard.js';
import { startLoop } from '../../shared/gameLoop.js';
import * as Thrower from '../../shared/thrower.js';
import { createStage3D, toThree, quatFromGameDir } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createSoloCup, createMarkerPool, setRodPose } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';
import { add, sub, mul, norm, lerp, lerp3, clamp, rotateAround, easeOut } from '../../shared/vec3.js';

const INK = '#1f1f22';
const SOFT = '#565a62';
const GOOD = '#1f9d4c';
const BAD = '#d7263d';
const WARN = '#c46a00';

export function createCupCatching(container, host) {
  const { options = {}, seed, debug = false, onFinish } = host;
  const C = CONFIG;
  const P = C.throws;
  const W = C.world;
  const CUP = C.cup;
  const FLOOR = -W.eyeHeight;
  const ML = C.marker.length;
  const MR = C.marker.width / 2;
  const endless = !!options.endless;
  const variant = endless ? 'endless' : 'regular';
  const rng = createRng(seed); // the throws (identical for everyone with the same seed)
  const luck = createRng((seed ^ 0x9e3779b9) >>> 0); // rattles, spills, how markers settle
  const popups = createPopups();

  const st = {
    phase: 'ready', // ready | gap | windup | flight | resolve | done
    phaseT: 0,
    phaseDur: 0,
    time: 0,
    activeSec: 0,
    throwIndex: 0,
    caught: 0,
    streak: 0,
    bestStreak: 0,
    missesInRow: 0,
    speed: 1,
    stats: { spilled: 0, rimOuts: 0, hitSide: 0, missed: 0 },
    bag: [],
    slots: endless ? [] : rng.shuffle(MARKER_COLORS).map((color) => ({ color, status: 'pending' })),
    thrower: Thrower.createThrowerState(lerp(...W.throwerZ, 0.5)),
    shot: null,
    inCup: [], // { color, a, lean, off, anim, from }
    debris: [], // spilled markers falling away
    cup: { rim: [0, -0.3, C.cupDepth], vel: [0, 0], axis: [0, 1, 0], wobble: 0 },
    pointer: null,
    spilledOver: false,
    finished: false,
  };

  let cam = null;
  let bg = null;
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  buildCourtyard(stage, {
    floorY: FLOOR, buildingZ: 22, shadowCenter: [0, 3.5], shadowSize: 7,
    tables: [{ x: -3.4, z: 8.8, rotDeg: 18 }, { x: 3.9, z: 10.2, rotDeg: -12 }, { x: -7.5, z: 12.5, rotDeg: 40 }],
  });
  const paul3d = createPaul3D();
  stage.scene.add(paul3d.group);
  const cup3d = createSoloCup(CUP);
  stage.scene.add(cup3d);
  const pool = createMarkerPool(stage.scene);
  const { ctx } = view;
  view.canvas.style.cursor = 'none'; // the cup is your cursor
  const detachPointer = attachPointer(view.canvas, {
    down: (p) => { st.pointer = p; },
    move: (p) => { if (p) st.pointer = p; },
  });

  function onResize(size) {
    cam = createCamera(size, { fovYDeg: W.fovYDeg, cyFrac: 0.42 });
    if (!st.pointer) st.cup.rim = cam.unproject(cam.W / 2, cam.H * 0.72, C.cupDepth);
  }

  function setPhase(phase, durSec = 0) {
    st.phase = phase;
    st.phaseT = 0;
    st.phaseDur = durSec;
  }

  const restHand = () => Thrower.restHand(st.thrower, st.time);
  const styleHand = (style, key) => Thrower.styleHand(st.thrower, style, key);

  // ---------- the cup ----------
  function cupLimits() {
    const m = Math.max(40, Math.min(cam.W, cam.H) * 0.08);
    return { x0: m, x1: cam.W - m, y0: cam.H * 0.28, y1: cam.H - m * 0.9 };
  }

  function updateCup(dt) {
    const c = st.cup;
    if (st.pointer) {
      const L = cupLimits();
      const off = st.pointer.type === 'touch' ? C.follow.touchOffsetPx : 0;
      const sx = clamp(st.pointer.x, L.x0, L.x1);
      const sy = clamp(st.pointer.y - off, L.y0, L.y1);
      const target = cam.unproject(sx, sy, C.cupDepth);
      const k = 1 - Math.exp(-C.follow.smoothing * dt);
      const next = lerp3(c.rim, target, k);
      const v = [(next[0] - c.rim[0]) / dt, (next[1] - c.rim[1]) / dt];
      c.vel = [lerp(c.vel[0], v[0], 0.5), lerp(c.vel[1], v[1], 0.5)];
      c.rim = next;
    } else {
      c.vel = [c.vel[0] * 0.8, c.vel[1] * 0.8];
    }
    const speed = Math.hypot(c.vel[0], c.vel[1]);
    c.wobble = lerp(c.wobble, clamp((speed - C.spill.safeSpeed * 0.7) / C.spill.safeSpeed, 0, 1), Math.min(1, dt * 8));
    const tilt = clamp(-c.vel[0] * 0.06, -0.3, 0.3);
    c.axis = norm([tilt, 1, clamp(c.vel[1] * 0.03, -0.15, 0.15)]);

    // sloshing markers out
    if (st.inCup.length && speed > C.spill.safeSpeed && st.phase !== 'done' && st.phase !== 'ready') {
      const fill = Math.min(1, st.inCup.length / C.endless.capacity);
      const rate = C.spill.ratePerMps * (speed - C.spill.safeSpeed) * (0.5 + C.spill.fullnessBoost * fill);
      if (luck.next() < rate * dt) spillOne();
    }
  }

  const cupBase = () => sub(st.cup.rim, mul(st.cup.axis, CUP.height));

  function inCupEnds(cm) {
    const c = st.cup;
    const base = cupBase();
    const jig = c.wobble * 0.25 * Math.sin(st.time * 30 + cm.a * 3);
    const side = [Math.cos(cm.a), 0, Math.sin(cm.a)];
    const bottom = add(add(base, mul(c.axis, 0.006)), mul(side, -cm.off));
    const dir = norm(add(c.axis, mul(side, cm.lean + jig)));
    const rest = { back: bottom, cap: add(bottom, mul(dir, ML)) };
    if (cm.anim >= 1) return rest;
    const k = easeOut(cm.anim);
    return { back: lerp3(add(cm.from.back, c.rim), rest.back, k), cap: lerp3(add(cm.from.cap, c.rim), rest.cap, k) };
  }

  function spillOne() {
    const cm = st.inCup.pop();
    const e = inCupEnds(cm);
    const c = st.cup;
    st.debris.push({
      color: cm.color,
      p: lerp3(e.back, e.cap, 0.6),
      v: [c.vel[0] * 0.8 + luck.range(-0.4, 0.4), 1.4 + luck.range(0, 0.6), luck.range(-0.6, 0.1)],
      o: norm(sub(e.cap, e.back)),
      axis: norm([luck.range(-1, 1), luck.range(-1, 1), luck.range(-1, 1)]),
      spin: luck.range(8, 14),
      t: 0,
    });
    st.stats.spilled++;
    if (!endless) {
      const slot = st.slots.find((s) => s.color === cm.color && s.status === 'in');
      if (slot) slot.status = 'spilled';
    }
    const sp = cam.project(c.rim);
    popups.add(endless ? 'Spilled over!' : 'Spilled one!', clamp(sp.x, 80, cam.W - 80), clamp(sp.y - 70, 90, cam.H - 60), WARN, 32);
    if (endless && !st.spilledOver) {
      st.spilledOver = true;
      setPhase('done', C.finishDelayMs / 1000);
    }
  }

  // ---------- throws ----------
  function nextColor() {
    if (!endless) return st.slots[st.throwIndex].color;
    if (!st.bag.length) st.bag = rng.shuffle(MARKER_COLORS);
    return st.bag.pop();
  }

  function beginThrow() {
    Thrower.planThrowerMove(st.thrower, rng, cam, W.throwerZ, P.throwerSpreadX);
    st.shot = {
      color: nextColor(),
      style: rng.weighted(P.styles),
      u: rng.range(-1, 1),
      v: rng.range(-1, 1),
      T: rng.range(P.flightTimeSec) / st.speed,
      rise: rng.range(P.arcHeightM),
      axis: norm([rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)]),
      spin: rng.range(P.spinRadPerSec) * rng.sign(),
      state: 'held',
      t: 0,
    };
    setPhase('gap', rng.range(P.gapMs) / 1000 / st.speed);
  }

  /** Where the throw is aimed: the ideal spot for the cup's rim, at the cup's depth. */
  function targetPoint(u, v) {
    const L = cupLimits();
    const cx = (L.x0 + L.x1) / 2;
    const cy = lerp(L.y0, L.y1, 0.55);
    const sx = cx + u * P.targetSpreadX * (L.x1 - L.x0) / 2;
    const sy = cy + v * P.targetSpreadY * (L.y1 - L.y0) / 2;
    return cam.unproject(sx, sy, C.cupDepth);
  }

  function release() {
    const s = st.shot;
    s.p0 = st.thrower.hand.slice();
    s.target = targetPoint(s.u, s.v);
    const solved = Thrower.solveThrow(s.p0, s.target, s.T, s.rise, cam, cam.H * 0.03);
    s.g = solved.g;
    s.v3 = solved.v;
    s.p = s.p0.slice();
    s.vel = s.v3.slice();
    s.o = Thrower.heldOrientation(st.thrower);
    s.t = 0;
    s.free = false;
    s.state = 'flying';
    setPhase('flight');
  }

  function decideMiss(s, reason, at) {
    s.decided = true;
    s.state = 'missed';
    s.missAt = s.t;
    st.streak = 0;
    st.missesInRow++;
    st.stats[reason]++;
    if (!endless) st.slots[st.throwIndex].status = 'missed';
    const text = { rimOuts: 'Bounced out!', hitSide: 'Hit the side!', missed: 'Missed!' }[reason];
    const sp = cam.project(at);
    popups.add(text, clamp(sp.x, 80, cam.W - 80), clamp(sp.y - 60, 90, cam.H - 60), BAD, 28);
  }

  function goIn(s, I, rattled) {
    s.decided = true;
    s.state = 'in';
    st.caught++;
    st.streak++;
    st.bestStreak = Math.max(st.bestStreak, st.streak);
    st.missesInRow = 0;
    if (!endless) st.slots[st.throwIndex].status = 'in';
    else st.speed = Math.min(C.endless.maxSpeedMult, st.speed * (1 + C.endless.speedRampPerCatch));
    const half = mul(s.o, ML / 2);
    st.inCup.push({
      color: s.color,
      a: luck.range(0, Math.PI * 2),
      lean: luck.range(0.25, 0.45),
      off: luck.range(0, 0.012),
      anim: 0,
      from: { back: sub(sub(I, half), st.cup.rim), cap: sub(add(I, half), st.cup.rim) },
    });
    const sp = cam.project(st.cup.rim);
    const text = rattled ? 'Rattled in!' : st.streak >= 3 ? `${st.streak} in a row!` : 'Caught!';
    popups.add(text, clamp(sp.x, 80, cam.W - 80), clamp(sp.y - 70, 90, cam.H - 60), rattled ? GOOD : s.color.hex, 32);
    setPhase('resolve', C.resolvePauseMs / 1000);
  }

  function checkCup(s, prev) {
    const rim = st.cup.rim;
    const rimY = rim[1];
    // dropping down through the opening?
    if (prev[1] > rimY && s.p[1] <= rimY && s.vel[1] < 0) {
      const I = lerp3(prev, s.p, (prev[1] - rimY) / (prev[1] - s.p[1]));
      const di = Math.hypot(I[0] - rim[0], I[2] - rim[2]);
      const fill = Math.min(1, st.inCup.length / C.endless.capacity);
      const inR = CUP.inRadius * (1 - CUP.crowdShrink * fill);
      if (di <= inR) { goIn(s, I, false); return; }
      if (di <= CUP.rimRadius + CUP.rimZone) {
        const closeness = clamp((CUP.rimRadius + CUP.rimZone - di) / (CUP.rimRadius + CUP.rimZone - inR), 0, 1);
        if (luck.chance(CUP.rattleInChance * closeness)) { goIn(s, I, true); return; }
        const out = norm([I[0] - rim[0], 0, I[2] - rim[2]]);
        s.free = true;
        s.p = [rim[0] + out[0] * (CUP.rimRadius + 0.02), rimY + 0.01, rim[2] + out[2] * (CUP.rimRadius + 0.02)];
        s.vel = [out[0] * 1.1 + st.cup.vel[0] * 0.3, 1.3, out[2] * 1.1 - 0.6];
        s.spin *= 1.5;
        decideMiss(s, 'rimOuts', I);
        return;
      }
    }
    // smacking into the side of the cup
    const bottomY = rimY - CUP.height;
    if (s.p[1] < rimY && s.p[1] > bottomY) {
      const frac = (s.p[1] - bottomY) / CUP.height;
      const rAt = CUP.bottomRadius + (CUP.rimRadius - CUP.bottomRadius) * frac + MR;
      const dh = Math.hypot(s.p[0] - rim[0], s.p[2] - rim[2]);
      if (dh < rAt) {
        const out = dh > 1e-4 ? norm([s.p[0] - rim[0], 0, s.p[2] - rim[2]]) : [0, 0, 1];
        s.free = true;
        s.p = [rim[0] + out[0] * (rAt + 0.005), s.p[1], rim[2] + out[2] * (rAt + 0.005)];
        s.vel = [out[0] * 1.2 + st.cup.vel[0] * 0.3, 0.8, out[2] * 1.2 + 0.2];
        decideMiss(s, 'hitSide', s.p);
        return;
      }
    }
    // went past
    if (s.p[2] < rim[2] - 0.3 || s.p[1] < rimY - 0.7) decideMiss(s, 'missed', s.p);
  }

  function stepShot(s, dt) {
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const prev = s.p;
      s.t += h;
      if (!s.free) {
        s.p = Thrower.throwPosition(s.p0, s.v3, s.g, s.t);
        s.vel = [s.v3[0], s.v3[1] - s.g * s.t, s.v3[2]];
      } else {
        s.vel = [s.vel[0], s.vel[1] - 9.8 * h, s.vel[2]];
        s.p = add(s.p, mul(s.vel, h));
      }
      s.o = rotateAround(s.o, s.axis, s.spin * h);
      if (!s.decided) checkCup(s, prev);
      if (s.state === 'in') return;
    }
  }

  function afterResolve() {
    st.throwIndex++;
    st.shot = null;
    if (!endless && st.throwIndex >= C.throwsPerGame) return setPhase('done', C.finishDelayMs / 1000);
    if (endless && st.missesInRow >= C.endless.missesInARow) return setPhase('done', C.finishDelayMs / 1000);
    beginThrow();
  }

  function result() {
    const score = st.inCup.length;
    return {
      gameId: 'cup-catching',
      variant,
      score,
      maxScore: endless ? null : C.throwsPerGame,
      passed: score >= (endless ? C.endless.passScore : C.passScore),
      durationMs: Math.round(st.activeSec * 1000),
      stats: { caught: st.caught, ...st.stats, bestStreak: st.bestStreak },
      seed: rng.seed,
    };
  }

  // ---------- update ----------
  function update(dt) {
    st.time += dt;
    popups.update(dt);
    updateCup(dt);
    for (const cm of st.inCup) cm.anim = Math.min(1, cm.anim + dt / 0.2);
    for (const d of st.debris) {
      d.t += dt;
      d.v = [d.v[0], d.v[1] - 9.8 * dt, d.v[2]];
      d.p = add(d.p, mul(d.v, dt));
      d.o = rotateAround(d.o, d.axis, d.spin * dt);
    }
    st.debris = st.debris.filter((d) => d.t < 1.2);

    const t = st.thrower;
    if (st.phase === 'ready') { t.hand = restHand(); return; }
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;

    switch (st.phase) {
      case 'gap':
        Thrower.walkThrower(t, k, dt, st.time);
        if (k >= 1) setPhase('windup', rng.range(P.windupMs) / 1000 / Math.sqrt(st.speed));
        break;
      case 'windup':
        t.moving = lerp(t.moving, 0, Math.min(1, dt * 10));
        t.hand = Thrower.windupHand(t, st.shot.style, k, st.time);
        if (k >= 1) release();
        break;
      case 'flight': {
        const s = st.shot;
        t.hand = lerp3(styleHand(s.style, 'release'), styleHand(s.style, 'follow'), easeOut(clamp(s.t / 0.25, 0, 1)));
        stepShot(s, dt);
        if (s.state === 'missed' && s.t - s.missAt > 0.45) {
          s.state = 'gone';
          setPhase('resolve', C.resolvePauseMs / 1000);
        }
        break;
      }
      case 'resolve':
        t.hand = lerp3(t.hand, restHand(), Math.min(1, dt * 6));
        if (st.shot && st.shot.state === 'missed') stepShot(st.shot, dt);
        if (k >= 1) afterResolve();
        break;
      case 'done':
        t.hand = lerp3(t.hand, restHand(), Math.min(1, dt * 6));
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.(result());
        }
        break;
    }
  }

  // ---------- render ----------
  function shotEnds(s) {
    const p = s.state === 'held' ? st.thrower.hand : s.p;
    const o = s.state === 'held' ? Thrower.heldOrientation(st.thrower) : s.o;
    const half = mul(o, ML / 2);
    return { back: sub(p, half), cap: add(p, half), p };
  }

  function drawShot() {
    const s = st.shot;
    if (!s || s.state === 'in' || s.state === 'gone') return;
    const e = shotEnds(s);
    if (e.back[2] < 0.15 || e.cap[2] < 0.15) return;
    const alpha = s.state === 'missed' ? clamp(1 - (s.t - s.missAt) / 0.45, 0, 1) : 1;
    drawRodMarker(ctx, cam, e.back, e.cap, s.color.hex, C.marker.width, { alpha });
  }

  function drawCupAll() {
    const c = st.cup;
    const shape = drawCup(ctx, cam, cupBase(), { ...CUP, axis: c.axis });
    if (st.inCup.length) {
      ctx.save();
      clipToCupOpening(ctx, cam, shape);
      for (const cm of st.inCup) {
        const e = inCupEnds(cm);
        drawRodMarker(ctx, cam, e.back, e.cap, cm.color.hex, C.marker.width);
      }
      ctx.restore();
    }
    if (debug && st.shot && st.shot.target) {
      const tp = cam.project(st.shot.target);
      ctx.save();
      ctx.strokeStyle = 'rgba(215,38,61,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tp.x - 10, tp.y); ctx.lineTo(tp.x + 10, tp.y);
      ctx.moveTo(tp.x, tp.y - 10); ctx.lineTo(tp.x, tp.y + 10);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawLabel(ctx, 'IN THE CUP', pad, pad + small, small, SOFT);
    drawLabel(ctx, endless ? `${st.inCup.length}` : `${st.inCup.length} / ${C.throwsPerGame}`, pad, pad + small + big * 0.95, big, INK);
    const line = endless
      ? `Speed ×${st.speed.toFixed(2)} · cup ${st.inCup.length}/${C.endless.capacity}`
      : `Throw ${Math.min(st.throwIndex + 1, C.throwsPerGame)} of ${C.throwsPerGame}`;
    drawLabel(ctx, line, pad, pad + small + big * 0.95 + small * 1.5, small, SOFT);

    if (endless) {
      // misses in a row
      const n = C.endless.missesInARow;
      const size = Math.round(clamp(cam.H * 0.045, 24, 38));
      const gap = size * 0.35;
      const x0 = cam.W / 2 - (n * size + (n - 1) * gap) / 2;
      drawLabel(ctx, 'misses in a row', cam.W / 2, pad + size + small + 4, Math.round(small * 0.8), SOFT, 'center');
      for (let i = 0; i < n; i++) {
        const x = x0 + i * (size + gap);
        ctx.save();
        ctx.fillStyle = 'rgba(15,10,20,0.55)';
        ctx.strokeStyle = 'rgba(255,255,255,0.45)';
        ctx.lineWidth = 1.5;
        roundRectPath(ctx, x, pad, size, size, 5);
        ctx.fill();
        ctx.stroke();
        if (i < st.missesInRow) {
          ctx.strokeStyle = BAD;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          const m = size * 0.22;
          ctx.beginPath();
          ctx.moveTo(x + m, pad + m); ctx.lineTo(x + size - m, pad + size - m);
          ctx.moveTo(x + size - m, pad + m); ctx.lineTo(x + m, pad + size - m);
          ctx.stroke();
        }
        ctx.restore();
      }
    } else {
      // the 8 markers, in throwing order (bottom left)
      const len8 = Math.round(clamp(cam.W * 0.045, 30, 52));
      const y = cam.H - pad - 8;
      st.slots.forEach((slot, i) => {
        const x = pad + len8 / 2 + i * len8 * 0.64;
        const done = slot.status !== 'pending';
        ctx.save();
        ctx.globalAlpha = done || i === st.throwIndex ? 1 : 0.35;
        drawMarker(ctx, x, y - len8 * 0.5, len8, -Math.PI / 2, slot.color.hex, { width: len8 * 0.2 });
        ctx.restore();
        if (done) drawBadge(ctx, x + len8 * 0.12, y - len8 * 1.02, Math.max(8, len8 * 0.2), slot.status === 'in');
      });
    }

    // keep-it-steady warning
    if (st.cup.wobble > 0.3 && st.inCup.length) {
      const sp = cam.project(st.cup.rim);
      ctx.save();
      ctx.globalAlpha = clamp((st.cup.wobble - 0.3) / 0.4, 0, 1);
      drawLabel(ctx, 'Steady!', sp.x, sp.y - 70, 20, WARN, 'center');
      ctx.restore();
    }
  }

  // Put Paul, the cup and every marker where the game says they are.
  function sync3D() {
    const t = st.thrower;
    paul3d.update({ x: t.x, z: t.z, floorY: FLOOR, yaw: 0, walk: t.walk, moving: t.moving, rightHand: t.hand });
    toThree(cupBase(), cup3d.position);
    quatFromGameDir(st.cup.axis, cup3d.quaternion);
    pool.begin();
    const s = st.shot;
    if (s && s.state !== 'in' && s.state !== 'gone' && !(s.state === 'missed' && s.t - s.missAt > 0.45)) {
      const e = shotEnds(s);
      if (e.back[2] > 0.15 && e.cap[2] > 0.15) setRodPose(pool.get(`shot-${s.color.id}`, s.color.hex), e.back, e.cap);
    }
    st.inCup.forEach((cm, i) => {
      const e = inCupEnds(cm);
      setRodPose(pool.get(`cup-${i}-${cm.color.id}`, cm.color.hex), e.back, e.cap);
    });
    st.debris.forEach((d, i) => {
      const half = mul(d.o, ML / 2);
      setRodPose(pool.get(`debris-${i}-${d.color.id}`, d.color.hex), sub(d.p, half), add(d.p, half));
    });
    pool.end();
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    const s = st.shot;
    if (debug && s && s.target) {
      const tp = cam.project(s.target);
      ctx.strokeStyle = 'rgba(215,38,61,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tp.x - 10, tp.y); ctx.lineTo(tp.x + 10, tp.y);
      ctx.moveTo(tp.x, tp.y - 10); ctx.lineTo(tp.x, tp.y + 10);
      ctx.stroke();
    }
    drawHUD();
    popups.draw(ctx);
    if (debug) {
      const lines = [
        `fps ${loop.fps.toFixed(0)}  phase ${st.phase}`,
        `cup speed ${Math.hypot(...st.cup.vel).toFixed(2)} m/s (safe ${C.spill.safeSpeed})  in cup ${st.inCup.length}`,
      ];
      if (s && s.state !== 'held') lines.push(`time to cup ${((s.T - s.t) * 1000).toFixed(0)}ms  T=${s.T.toFixed(2)}s  ${s.style}`);
      drawDebugBox(ctx, cam, lines);
    }
  }

  // ---------- start ----------
  const loop = startLoop({ update, render });

  if (debug) {
    window.__cupCatching = {
      st, cam: () => cam, canvas: view.canvas, stage,
      // move the cup's rim to a world point instantly (for tests)
      placeCup: (p) => { st.cup.rim = p.slice(); st.cup.vel = [0, 0]; st.pointer = null; },
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    };
  }

  return {
    start() {
      if (st.phase !== 'ready') return;
      beginThrow();
    },
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    destroy() {
      loop.stop();
      detachPointer();
      stage.destroy();
    },
  };
}
