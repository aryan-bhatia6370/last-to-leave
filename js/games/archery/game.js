// Archery.
// Flick foam state puzzle pieces (Nevada, Wyoming, Connecticut) at a
// handheld classroom whiteboard that Paul holds up. The board jumps to a new random spot, distance and
// angle after every throw. Optional Wind pushes each throw a little.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { attachPointer } from '../../core/input.js';
import { shade } from '../../shared/colors.js';
import { createCamera, renderRoom, fillPoly, line3 } from '../../shared/scene3d.js';
import { createFlickTracker, flickToVelocity, stepBody, spinBasis, heldFollow, withReleasePoint, bounceOffPaul, SAFE_HALF_WIDTH } from '../../shared/throwing.js';
import { createWind } from '../../shared/wind.js';
import { createPopups, drawLabel } from '../../shared/hud.js';
import { STATE_SHAPES, drawShape2D } from '../../shared/states.js';
import { drawPaul, drawPaulHand } from '../../shared/paul.js';
import { createStage3D } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createHandBoard, createFoamPiece, setPoseFromBasis } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';
import {
  add, sub, mul, dot, cross, norm, len, lerp, lerp3, clamp, deg, rotateAround, easeInOut, easeOut,
} from '../../shared/vec3.js';

const INK = '#1f1f22';
const SOFT = '#565a62';
const MISS_RED = '#d7263d';
const HIT_GREEN = '#1f9d4c';

export function createArchery(container, host) {
  // Online watching: st is copied from the player's live feed, nothing is simulated here.
  const spectate = host.options?.spectate || null;
  const mirrorIn = () => { const s = spectate.frame(); if (s) Object.assign(st, s); };
  const { options = {}, seed, debug = false, onFinish } = host;
  const C = CONFIG;
  const W = C.world;
  const FLOOR = -W.eyeHeight;
  const windOn = !!options.wind;
  const zonesOn = !!options.zones; // Hotspots mode
  const HS = C.hotspots;
  const variant = ['zones', 'wind'].filter((k) => options[k]).join('-') || 'regular';
  const rng = createRng(seed);
  const wind = createWind(rng, C.wind, windOn);
  const flick = createFlickTracker(C.throw.sampleMs);
  const popups = createPopups();
  const TOTAL = C.pieces.length;

  const st = {
    phase: 'ready', // ready | setup | aim | flight | resolve | done
    phaseT: 0,
    phaseDur: 0,
    paused: false,
    time: 0,
    activeSec: 0,
    throwIndex: 0,
    hits: 0,
    results: [], // 'hit' | 'miss' per throw
    stats: { short: 0, high: 0, low: 0, wide: 0 },
    boardParams: null,
    boardFrom: null,
    boardTo: null,
    wobble: 0,
    paulWalk: 0,
    paulMoving: 0,
    paulFlinch: 0,
    points: 0,
    bonusHits: 0,
    zone: null,
    bodies: [],
    active: null,
    held: { pos: [0, C.hold.y, C.hold.z], dragging: false, start: null, cur: null },
    everThrew: false,
    lastFlick: null,
    finished: false,
    fps: 60,
  };

  let cam = null;
  let bg = null;
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  const { ctx } = view;
  const detachPointer = attachPointer(view.canvas, { down: onDown, move: onMove, up: onUp });

  st.boardParams = randomBoard();
  st.held.pos = heldBase();

  // ---------- 3D scene ----------
  buildCourtyard(stage, {
    floorY: FLOOR, buildingZ: 20, shadowCenter: [0, 3.5], shadowSize: 6,
    tables: [{ x: -3.6, z: 7.5, rotDeg: 15 }, { x: 4.2, z: 8.5, rotDeg: -20 }],
  });
  const paul3d = createPaul3D();
  stage.scene.add(paul3d.group);
  const board3d = createHandBoard(1, 1, { frontCanvas: boardSurfaceCanvas(), backCanvas: boardSurfaceCanvas() });
  stage.scene.add(board3d);
  const heldMeshes = C.pieces.map((pc) => {
    const m = createFoamPiece(STATE_SHAPES[pc.id], pc.size, pc.thickness, pc.color);
    m.visible = false;
    stage.scene.add(m);
    return m;
  });
  const bodyMeshes = new Map();

  function boardSurfaceCanvas() {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 384;
    const g = c.getContext('2d');
    g.fillStyle = '#fbfbf9';
    g.fillRect(0, 0, 512, 384);
    for (let i = 0; i < 7; i++) {
      const x = Math.random() * 512, y = Math.random() * 384, r = 60 + Math.random() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(120,130,150,0.07)');
      gr.addColorStop(1, 'rgba(120,130,150,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 512, 384);
    }
    return c;
  }

  function sync3D() {
    const wob = Math.sin(st.time * 38) * st.wobble * 0.06;
    const B = boardBasis(st.boardParams, wob);
    paul3d.update(paulPose(B));
    setPoseFromBasis(board3d, B.c, B);
    board3d.scale.set(B.w, B.h, 1);
    // one mesh per thrown piece, by its slot (spectators get fresh state objects every update)
    st.bodies.forEach((b, i) => {
      const key = `${i}:${b.piece.id}`;
      let m = bodyMeshes.get(key);
      if (!m) {
        m = createFoamPiece(STATE_SHAPES[b.piece.id], b.piece.size, b.piece.thickness, b.piece.color);
        stage.scene.add(m);
        bodyMeshes.set(key, m);
      }
      m.visible = true;
      setPoseFromBasis(m, b.p, b);
    });
    for (const [key, m] of bodyMeshes) if (Number(key.split(':')[0]) >= st.bodies.length) m.visible = false;
    const showHeld = st.phase === 'setup' || st.phase === 'aim' || st.phase === 'ready';
    heldMeshes.forEach((m, i) => {
      m.visible = showHeld && i === st.throwIndex;
      if (m.visible) setPoseFromBasis(m, st.held.pos, heldBasis());
    });
  }

  // ---------- layout ----------
  function onResize(size) {
    cam = createCamera(size, { fovYDeg: W.fovYDeg, cyFrac: 0.42 });
  }

  function heldBase() {
    return [0, C.hold.y, C.hold.z];
  }

  function setPhase(phase, durSec = 0) {
    st.phase = phase;
    st.phaseT = 0;
    st.phaseDur = durSec;
  }

  // ---------- the whiteboard ----------
  function randomBoard() {
    const B = C.board;
    const z = rng.range(B.distance);
    const x = rng.range(-1, 1) * Math.min(B.maxOffsetX, z * SAFE_HALF_WIDTH * 0.9); // same spot on every screen
    const y = rng.range(B.centerY);
    let yaw = rng.chance(B.angleChance) ? rng.sign() * rng.range(B.yawDeg) : rng.range(-6, 6);
    const pitch = rng.chance(B.tiltChance) ? rng.range(B.tiltDeg) : 0;
    const w = rng.range(B.width);
    const params = { x, y, z, yaw, pitch, w, h: w * B.aspect };
    // never let it turn so far that it's nearly edge-on to you
    const b = boardBasis(params);
    const toCam = norm(mul(b.c, -1));
    if (dot(b.n, toCam) < 0.4) params.yaw = -yaw;
    return params;
  }

  // ---------- Hotspots ----------
  // A zone in board coordinates: u (right) and v (up) in meters from the board's center.
  function randomZone(bp) {
    const w = bp.w, h = bp.h;
    const kind = rng.weighted(HS.patterns);
    if (kind === 'bull') return { kind, circles: [[0, 0, HS.bullRadius * h]] };
    if (kind === 'corner') {
      const r = HS.cornerRadius * h;
      return { kind, circles: [[rng.sign() * (w / 2 - r * 1.15), rng.sign() * (h / 2 - r * 1.15), r]] };
    }
    if (kind === 'pair') {
      const r = HS.pairRadius * h;
      const a = [rng.range(-1, 1) * (w / 2 - r * 1.3), rng.range(-1, 1) * (h / 2 - r * 1.3)];
      let b;
      for (let i = 0; i < 20; i++) {
        b = [rng.range(-1, 1) * (w / 2 - r * 1.3), rng.range(-1, 1) * (h / 2 - r * 1.3)];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) > r * 3) break;
      }
      return { kind, circles: [[a[0], a[1], r], [b[0], b[1], r]] };
    }
    if (kind === 'stripe') {
      const sw = HS.stripeWidth * w;
      return { kind, rect: [rng.range(-0.3, 0.3) * w - sw / 2, -h / 2, sw, h] };
    }
    const side = rng.int(0, 3); // half: left, right, top, bottom
    const rect = [[-w / 2, -h / 2, w / 2, h], [0, -h / 2, w / 2, h], [-w / 2, 0, w, h / 2], [-w / 2, -h / 2, w, h / 2]][side];
    return { kind, rect };
  }

  function inZone(z, u, v) {
    if (!z) return false;
    if (z.circles) return z.circles.some(([cu, cv, r]) => Math.hypot(u - cu, v - cv) <= r);
    const [x, y, rw, rh] = z.rect;
    return u >= x && u <= x + rw && v >= y && v <= y + rh;
  }

  // Draw the zone on the board's front in orange marker.
  const frontCanvas = board3dFront();
  const frontBase = frontCanvas && (() => { const c = document.createElement('canvas'); c.width = frontCanvas.width; c.height = frontCanvas.height; c.getContext('2d').drawImage(frontCanvas, 0, 0); return c; })();
  function board3dFront() { return board3d.userData.front?.image || null; }
  function paintZone() {
    if (!frontCanvas) return;
    const g = frontCanvas.getContext('2d');
    const W2 = frontCanvas.width, H2 = frontCanvas.height;
    g.drawImage(frontBase, 0, 0);
    const z = st.zone, bp = st.boardTo;
    if (z) {
      const sx = (u) => (u / bp.w + 0.5) * W2, sy = (v) => (0.5 - v / bp.h) * H2;
      g.save();
      g.fillStyle = 'rgba(242,133,29,0.28)';
      g.strokeStyle = '#e0700f';
      g.lineWidth = 9;
      g.lineJoin = 'round';
      if (z.circles) {
        for (const [cu, cv, r] of z.circles) {
          g.beginPath();
          g.ellipse(sx(cu), sy(cv), (r / bp.w) * W2, (r / bp.h) * H2, 0, 0, Math.PI * 2);
          g.fill(); g.stroke();
        }
      } else {
        const [x, y, rw, rh] = z.rect;
        const x0 = sx(x), y0 = sy(y + rh), ww = (rw / bp.w) * W2, hh = (rh / bp.h) * H2;
        g.fillRect(x0, y0, ww, hh);
        g.strokeRect(x0 + 4, y0 + 4, ww - 8, hh - 8);
      }
      // every hotspot gets its own ×2 label
      const spots = z.circles ? z.circles.map(([u, v]) => [u, v]) : [[z.rect[0] + z.rect[2] / 2, z.rect[1] + z.rect[3] / 2]];
      g.fillStyle = '#c45a00';
      g.font = `bold ${Math.round(H2 * 0.13)}px "Permanent Marker", sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      for (const [lu, lv] of spots) g.fillText('×2', sx(lu), sy(lv));
      g.restore();
    }
    board3d.userData.front.needsUpdate = true;
  }

  function boardBasis(bp, wobble = 0) {
    const yaw = deg(bp.yaw);
    const pitch = deg(bp.pitch) + wobble;
    let r = rotateAround([1, 0, 0], [0, 1, 0], yaw);
    let n = rotateAround([0, 0, -1], [0, 1, 0], yaw);
    const u = rotateAround([0, 1, 0], r, pitch);
    n = rotateAround(n, r, pitch);
    return { c: [bp.x, bp.y, bp.z], r, u, n, w: bp.w, h: bp.h };
  }

  function boardPoint(B, a, b, out = 0) {
    return add(add(add(B.c, mul(B.r, a)), mul(B.u, b)), mul(B.n, out));
  }

  function lerpBoard(a, b, t) {
    const o = {};
    for (const k of Object.keys(a)) o[k] = lerp(a[k], b[k], t);
    return o;
  }

  // ---------- the pieces ----------
  function heldBasis() {
    let r = [1, 0, 0];
    let u = rotateAround([0, 1, 0], r, -0.4); // tipped back so you see its thickness
    const sway = Math.sin(st.time * 1.7) * 0.06 - 0.1;
    r = rotateAround(r, [0, 0, 1], sway);
    u = rotateAround(u, [0, 0, 1], sway);
    return { r, u, n: norm(cross(u, r)) };
  }

  function launch(fl) {
    const piece = C.pieces[st.throwIndex];
    const basis = heldBasis();
    const spin = rng.range(C.throw.spinRadPerSec) * (fl.yawTan >= 0 ? -1 : 1);
    const body = {
      piece,
      p: st.held.pos.slice(),
      v: fl.v,
      ...basis,
      w: add(mul(basis.n, spin), mul(basis.r, spin * rng.range(-0.45, 0.45))),
      t: 0,
      decided: false,
      decidedAt: 0,
      settled: false,
      settling: false,
    };
    st.bodies.push(body);
    st.active = body;
    st.everThrew = true;
    st.lastFlick = fl;
    setPhase('flight');
  }

  function decide(body, hit, reason, at, bonus = false) {
    body.decided = true;
    body.decidedAt = st.time;
    const sp = cam.project(at);
    const x = clamp(sp.x, 70, cam.W - 70);
    const y = clamp(sp.y - 20, 80, cam.H - 60);
    if (hit) {
      st.hits++;
      st.points += bonus ? HS.zonePoints : 1;
      if (bonus) st.bonusHits++;
      st.results[st.throwIndex] = bonus ? 'bonus' : 'hit';
      st.wobble = 1;
      popups.add(bonus ? `HOTSPOT! +${HS.zonePoints}` : 'HIT!', x, y, bonus ? '#e0700f' : HIT_GREEN, bonus ? 44 : 40);
    } else {
      st.results[st.throwIndex] = 'miss';
      if (reason) st.stats[reason]++;
      const text = { short: 'Short!', high: 'Too high!', low: 'Too low!', wide: 'Wide!' }[reason] || 'Missed!';
      popups.add(text, x, y, MISS_RED, 30);
      if (reason === 'low' || reason === 'wide') {
        const B = boardBasis(st.boardParams);
        const u = dot(sub(at, B.c), B.r);
        if (Math.abs(u) < 0.3 && at[1] > FLOOR + 0.15 && at[1] < FLOOR + 1.75) popups.add('You hit Paul!', x, y + 34, '#7a3fc4', 24, 1.2);
      }
    }
  }

  function stepPiece(b, dt) {
    const piece = b.piece;
    const steps = Math.max(1, Math.ceil(dt / (1 / 240)));
    const h = dt / steps;
    const B = boardBasis(st.boardParams);
    const paulSpot = paulPose(B);
    const rest = FLOOR + piece.thickness / 2;
    for (let i = 0; i < steps; i++) {
      if (b.settling) break;
      const prev = b.p;
      stepBody(b, h, { gravity: W.gravity, drag: piece.drag, wind: wind.vec });
      spinBasis(b, b.w, h);
      b.t += h;
      if (bounceOffPaul(b, paulSpot)) { if (!b.hitPaul) { b.hitPaul = true; st.paulFlinch = 1; } }

      // through the board's plane?
      if (!b.decided && b === st.active) {
        const s0 = dot(sub(prev, B.c), B.n);
        const s1 = dot(sub(b.p, B.c), B.n);
        if (s0 > 0 && s1 <= 0) {
          const I = lerp3(prev, b.p, s0 / (s0 - s1));
          const u = dot(sub(I, B.c), B.r);
          const v = dot(sub(I, B.c), B.u);
          const hw = B.w / 2 + piece.hitRadius;
          const hh = B.h / 2 + piece.hitRadius;
          if (Math.abs(u) <= hw && Math.abs(v) <= hh) {
            decide(b, true, null, I, zonesOn && inZone(st.zone, u, v));
            // bounce off the board
            const vn = dot(b.v, B.n);
            b.v = mul(sub(b.v, mul(B.n, (1 + C.bounce.board) * vn)), 0.55);
            b.p = add(I, mul(B.n, 0.03));
            b.w = mul(b.w, 0.5);
          } else {
            const reason = v > hh ? 'high' : v < -hh ? 'low' : 'wide';
            decide(b, false, reason, I);
          }
        }
      }

      // floor
      if (b.p[1] < rest) {
        if (!b.decided && b === st.active) decide(b, false, 'short', b.p);
        b.p = [b.p[0], rest, b.p[2]];
        if (b.v[1] < 0) b.v = [b.v[0] * C.bounce.floorFriction, -b.v[1] * C.bounce.floor, b.v[2] * C.bounce.floorFriction];
        b.w = mul(b.w, 0.55);
        if (len(b.v) < 0.6) b.settling = true;
      }
      // back wall
      if (b.p[2] > W.backWallZ - 0.05) {
        b.p = [b.p[0], b.p[1], W.backWallZ - 0.05];
        b.v = [b.v[0] * 0.5, b.v[1], -Math.abs(b.v[2]) * 0.3];
      }
      if (!b.decided && b === st.active && b.t > 4) decide(b, false, null, b.p);
    }

    if (b.settling) {
      // lie flat on the floor
      b.v = [0, 0, 0];
      b.w = [0, 0, 0];
      b.p = [b.p[0], rest, b.p[2]];
      const up = dot(b.n, [0, 1, 0]) >= 0 ? [0, 1, 0] : [0, -1, 0];
      const axis = cross(b.n, up);
      const sinA = len(axis);
      const angle = Math.atan2(sinA, dot(b.n, up));
      if (angle < 0.02 || sinA < 1e-5) {
        b.settled = true;
      } else {
        const a = Math.min(angle, dt * 9);
        const ax = mul(axis, 1 / sinA);
        b.r = rotateAround(b.r, ax, a);
        b.u = rotateAround(b.u, ax, a);
        b.n = norm(cross(b.u, b.r));
      }
    }
  }

  // ---------- input ----------
  function onDown(p) {
    if (st.paused || st.phase !== 'aim') return;
    flick.begin(p);
    st.held.dragging = true;
    st.held.start = p;
    st.held.cur = p;
  }
  function onMove(p) {
    if (!p || !st.held.dragging) return;
    flick.move(p);
    st.held.cur = p;
  }
  function onUp(p) {
    if (!st.held.dragging) return;
    st.held.dragging = false;
    const f = flick.end(p);
    if (st.paused || st.phase !== 'aim') return;
    const fl = flickToVelocity(withReleasePoint(f, p), cam.H, C.throw, cam);
    if (!fl) {
      const hp = cam.project(st.held.pos);
      popups.add('Flick it faster!', hp.x, hp.y - 90, SOFT, 22);
      return;
    }
    launch(fl);
  }

  // ---------- update ----------
  function update(dt) {
    st.time += dt;
    wind.update(dt);
    st.wobble = Math.max(0, st.wobble - dt * 2.2);
    st.paulFlinch = Math.max(0, st.paulFlinch - dt * 3);
    for (const b of st.bodies) if (!b.settled) stepPiece(b, dt);

    if (st.phase === 'ready') return;
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;

    switch (st.phase) {
      case 'setup': {
        st.boardParams = lerpBoard(st.boardFrom, st.boardTo, easeInOut(k));
        const moved = Math.hypot(st.boardTo.x - st.boardFrom.x, st.boardTo.z - st.boardFrom.z) > 0.05;
        st.paulMoving = lerp(st.paulMoving, moved && k < 0.95 ? 1 : 0, Math.min(1, dt * 10));
        st.paulWalk += dt * 11 * st.paulMoving;
        const base = heldBase();
        st.held.pos = [base[0], base[1] - 0.45 * (1 - easeOut(k)), base[2]];
        if (k >= 1) setPhase('aim');
        break;
      }
      case 'aim': {
        const base = heldBase();
        st.held.pos = heldFollow(cam, base, st.held.pos, st.held, dt, C.hold.maxLiftM);
        break;
      }
      case 'flight': {
        const b = st.active;
        if (b.decided && (b.settled || (st.time - b.decidedAt) * 1000 > C.maxResolveWaitMs)) {
          setPhase('resolve', C.resolvePauseMs / 1000);
        }
        break;
      }
      case 'resolve': {
        if (k >= 1) nextThrow();
        break;
      }
      case 'done': {
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.(result());
        }
        break;
      }
    }
  }

  function beginSetup(first) {
    st.boardFrom = { ...st.boardParams };
    st.boardTo = first ? { ...st.boardParams } : randomBoard();
    if (zonesOn) { st.zone = randomZone(st.boardTo); paintZone(); }
    wind.reroll();
    st.held.pos = [0, C.hold.y - 0.45, C.hold.z];
    setPhase('setup', first ? 0.35 : C.boardMoveMs / 1000);
  }

  function nextThrow() {
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
      gameId: 'archery',
      variant,
      score: zonesOn ? st.points : st.hits,
      maxScore: zonesOn ? TOTAL * HS.zonePoints : TOTAL,
      passed: zonesOn ? st.points >= HS.passScore : st.hits >= C.passScore,
      durationMs: Math.round(st.activeSec * 1000),
      stats: { hits: st.hits, misses: TOTAL - st.hits, ...(zonesOn ? { hotspots: st.bonusHits } : {}), ...st.stats },
      seed: rng.seed,
    };
  }

  // ---------- render ----------
  function drawPiece(piece, p, r, u, n) {
    const shape = STATE_SHAPES[piece.id];
    const half = mul(n, piece.thickness / 2);
    const front = [];
    const back = [];
    for (const [sx, sy] of shape) {
      const q = add(add(p, mul(r, sx * piece.size)), mul(u, sy * piece.size));
      front.push(add(q, half));
      back.push(sub(q, half));
    }
    if (front.some((q) => q[2] < 0.12) || back.some((q) => q[2] < 0.12)) return;
    const F = front.map((q) => cam.project(q));
    const Bk = back.map((q) => cam.project(q));
    const facing = dot(n, mul(p, -1)) > 0;
    const near = facing ? F : Bk;
    const far = facing ? Bk : F;
    const side = shade(piece.color, -0.32);
    const lw = Math.max(0.6, cam.f * 0.003 / Math.max(0.3, p[2]));
    fillPoly(ctx, far, shade(piece.color, -0.2));
    for (let i = 0; i < near.length; i++) {
      const j = (i + 1) % near.length;
      fillPoly(ctx, [far[i], far[j], near[j], near[i]], side, side, 0.5);
    }
    // lighter if it faces up/toward you
    const light = clamp(0.5 + 0.5 * Math.abs(dot(n, norm([0.3, 0.8, -0.5]))), 0.5, 1);
    fillPoly(ctx, near, shade(piece.color, (light - 0.75) * 0.5), 'rgba(0,0,0,0.3)', lw);
  }

  // Paul stands just behind the board, holding it by its sides.
  function paulPose(B) {
    const nh = norm([B.n[0], 0, B.n[2]]);
    const at = sub(B.c, mul(nh, C.paul.behindBoard));
    return {
      x: at[0], z: at[2], floorY: FLOOR, yaw: deg(st.boardParams.yaw), walk: st.paulWalk, moving: st.paulMoving, flinch: st.paulFlinch,
      leftHand: boardPoint(B, -(B.w / 2 - 0.02), -B.h * 0.12, -0.03),
      rightHand: boardPoint(B, B.w / 2 - 0.02, -B.h * 0.12, -0.03),
    };
  }

  function drawPaulBehind() {
    drawPaul(ctx, cam, paulPose(boardBasis(st.boardParams)));
  }

  function drawBoard() {
    const wob = Math.sin(st.time * 38) * st.wobble * 0.06;
    const B = boardBasis(st.boardParams, wob);
    ctx.save();
    ctx.lineCap = 'round';

    // frame + surface
    const corners = (inset) => [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) =>
      cam.project(boardPoint(B, a * (B.w / 2 - inset), b * (B.h / 2 - inset))));
    fillPoly(ctx, corners(0), '#aeb4bb', 'rgba(0,0,0,0.35)', 1);
    const surf = corners(C.board.frame);
    fillPoly(ctx, surf, '#fafbf8');
    // faint ghosting
    ctx.save();
    ctx.globalAlpha = 0.5;
    fillPoly(ctx, [
      cam.project(boardPoint(B, -B.w * 0.3, B.h * 0.2)),
      cam.project(boardPoint(B, B.w * 0.1, B.h * 0.25)),
      cam.project(boardPoint(B, B.w * 0.05, B.h * 0.05)),
      cam.project(boardPoint(B, -B.w * 0.32, 0)),
    ], 'rgba(130,140,160,0.12)');
    ctx.restore();
    // Paul's fingers wrapped around the sides
    for (const side of [-1, 1]) drawPaulHand(ctx, cam, boardPoint(B, side * (B.w / 2 + 0.004), -B.h * 0.12, 0.012), 0.032);
    ctx.restore();

    if (debug) {
      const P = st.active?.piece || C.pieces[Math.min(st.throwIndex, TOTAL - 1)];
      const hr = P.hitRadius;
      const hit = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) =>
        cam.project(boardPoint(B, a * (B.w / 2 + hr), b * (B.h / 2 + hr))));
      ctx.save();
      ctx.setLineDash([6, 4]);
      fillPoly(ctx, hit, null, 'rgba(31,157,76,0.8)', 2);
      ctx.restore();
    }
  }

  function drawBodyShadow(b) {
    const fp = cam.project([b.p[0], FLOOR, b.p[2]]);
    const height = b.p[1] - FLOOR;
    const a = 0.2 * clamp(1 - height / 2.5, 0.1, 1);
    ctx.fillStyle = `rgba(40,30,15,${a.toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(fp.x, fp.y, b.piece.size * 0.45 * fp.s, b.piece.size * 0.12 * fp.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawScene() {
    const B0 = boardBasis(st.boardParams);
    const paulZ = sub(B0.c, mul(norm([B0.n[0], 0, B0.n[2]]), C.paul.behindBoard))[2];
    const items = [{ z: st.boardParams.z, draw: drawBoard }, { z: paulZ, draw: drawPaulBehind }];
    for (const b of st.bodies) {
      items.push({
        z: b.p[2],
        draw: () => {
          if (!b.settled) drawBodyShadow(b);
          drawPiece(b.piece, b.p, b.r, b.u, b.n);
        },
      });
    }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) it.draw();
  }

  function drawHeld() {
    if (st.phase !== 'setup' && st.phase !== 'aim' && st.phase !== 'ready') return;
    const piece = C.pieces[st.throwIndex];
    if (!piece) return;

    if (st.phase === 'aim' && !st.everThrew && !st.held.dragging) {
      const hp = cam.project(st.held.pos);
      const bob = Math.sin(st.time * 4) * 8;
      const x = hp.x, y0 = hp.y - piece.size * hp.s * 0.7 - 16 + bob;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 - 70);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x, y0 - 88);
      ctx.lineTo(x - 13, y0 - 66);
      ctx.lineTo(x + 13, y0 - 66);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      drawLabel(ctx, 'Press, flick up, let go!', x, y0 - 100, 24, '#1f1f22', 'center');
    }
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawLabel(ctx, zonesOn ? 'POINTS' : 'HITS', pad, pad + small, small, SOFT);
    drawLabel(ctx, zonesOn ? `${st.points} / ${TOTAL * HS.zonePoints}` : `${st.hits} / ${TOTAL}`, pad, pad + small + big * 0.95, big, INK);
    const piece = C.pieces[Math.min(st.throwIndex, TOTAL - 1)];
    let line = `Throw ${Math.min(st.throwIndex + 1, TOTAL)} of ${TOTAL} · ${piece.name}`;
    drawLabel(ctx, line, pad, pad + small + big * 0.95 + small * 1.5, small, SOFT);

    // piece rack (bottom left)
    const icon = Math.round(clamp(cam.H * 0.05, 26, 40));
    const y = cam.H - pad - icon * 0.6;
    C.pieces.forEach((pc, i) => {
      const x = pad + icon * 0.6 + i * icon * 1.45;
      const res = st.results[i];
      ctx.save();
      ctx.globalAlpha = res ? 0.9 : i === st.throwIndex ? 1 : 0.45;
      const sz = icon * (0.55 + 0.45 * (pc.size / C.pieces[0].size));
      drawShape2D(ctx, STATE_SHAPES[pc.id], x, y, sz, pc.color);
      ctx.restore();
      if (res) {
        // result badge at the icon's top-right
        const bx = x + icon * 0.42, by = y - icon * 0.42, br = icon * 0.26;
        ctx.save();
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(31,31,34,0.35)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.lineWidth = Math.max(2.5, br * 0.32);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = res === 'bonus' ? '#e0700f' : res === 'hit' ? HIT_GREEN : MISS_RED;
        const m = br * 0.5;
        ctx.beginPath();
        if (res === 'hit' || res === 'bonus') {
          ctx.moveTo(bx - m, by); ctx.lineTo(bx - m * 0.2, by + m * 0.75); ctx.lineTo(bx + m, by - m * 0.7);
        } else {
          ctx.moveTo(bx - m, by - m); ctx.lineTo(bx + m, by + m);
          ctx.moveTo(bx + m, by - m); ctx.lineTo(bx - m, by + m);
        }
        ctx.stroke();
        ctx.restore();
      } else if (i === st.throwIndex && st.phase !== 'done') {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - icon * 0.5, y + icon * 0.65);
        ctx.lineTo(x + icon * 0.5, y + icon * 0.65);
        ctx.stroke();
        ctx.restore();
      }
    });

    wind.drawIndicator(ctx, cam.W - pad, pad + 52);
  }

  function drawDebug() {
    const B = st.boardParams;
    const lines = [
      `fps ${st.fps.toFixed(0)}  phase ${st.phase}`,
      `board ${B.z.toFixed(2)}m away, x ${B.x.toFixed(2)}, y ${B.y.toFixed(2)}, yaw ${B.yaw.toFixed(0)}°, tilt ${B.pitch.toFixed(0)}°`,
      `wind ${wind.mph.toFixed(1)} mph  [${wind.vec.map((v) => v.toFixed(2)).join(', ')}] m/s`,
    ];
    if (st.lastFlick) lines.push(`last flick ${st.lastFlick.upH.toFixed(2)} screens/s -> ${st.lastFlick.speed.toFixed(2)} m/s, aim ${st.lastFlick.yawTan.toFixed(2)}`);
    ctx.save();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    const w = 470;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(cam.W - w - 10, cam.H - 16 * lines.length - 18, w, 16 * lines.length + 8);
    ctx.fillStyle = '#9ef0b5';
    ctx.textAlign = 'left';
    lines.forEach((l, i) => ctx.fillText(l, cam.W - w - 2, cam.H - 16 * (lines.length - i) - 6));
    ctx.restore();
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    if (debug) {
      const B = boardBasis(st.boardParams);
      const P = st.active?.piece || C.pieces[Math.min(st.throwIndex, TOTAL - 1)];
      const hr = P.hitRadius;
      const hit = [[-1, 1], [1, 1], [1, -1], [-1, -1]].map(([a, b]) => cam.project(boardPoint(B, a * (B.w / 2 + hr), b * (B.h / 2 + hr))));
      ctx.save();
      ctx.setLineDash([6, 4]);
      fillPoly(ctx, hit, null, 'rgba(31,157,76,0.8)', 2);
      ctx.restore();
    }
    wind.drawStreaks(ctx, cam);
    drawHeld();
    drawHUD();
    popups.draw(ctx);
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
    if (spectate) mirrorIn();
    else if (!st.paused) {
      update(dt);
      popups.update(dt);
    }
    render();
  }
  raf = requestAnimationFrame(frame);

  if (debug) {
    window.__archery = {
      st, wind, cam: () => cam, canvas: view.canvas,
      flickToVelocity: (f) => flickToVelocity(f, cam.H, C.throw),
      launch: (fl) => launch(fl),
      // advance the game by `sec` without the animation loop (for automated tests)
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { update(dt); popups.update(dt); } render(); },
    };
  }

  return {
    state: () => st, // for live spectating
    start() {
      if (st.phase !== 'ready') return;
      beginSetup(true);
    },
    pause() {
      st.paused = true;
      st.held.dragging = false;
      flick.cancel();
    },
    resume() { st.paused = false; last = performance.now(); },
    destroy() {
      cancelAnimationFrame(raf);
      detachPointer();
      stage.destroy();
    },
  };
}
