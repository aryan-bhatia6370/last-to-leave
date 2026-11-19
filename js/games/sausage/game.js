// The Sausage Game.
// A whiteboard lies flat (portrait) on the dark-purple picnic table, split into
// horizontal point bands (−2 … +5). The sausage (a marker's ink refill) sits in
// the start box at your end. Press on it, drag back, let go: it slides up the
// board and slows down. Where you grab it matters: off-center grabs spin it and
// change its angle. Stop in a band = those points; off the board = 0. 3 flicks.
//
// Game coords: you're at the origin, x right, y up, z forward; the board is the
// plane y = BOARD_Y. Physics is 2D on that plane (x, z) plus the sausage's angle.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { MARKER_COLORS } from '../../shared/colors.js';
import { createCamera } from '../../shared/scene3d.js';
import { createPopups, drawLabel, drawGlassBar } from '../../shared/hud.js';
import { attachPointer } from '../../core/input.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createStage3D } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createPicnicTable, createHandBoard } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';
import { clamp, easeOut } from '../../shared/vec3.js';

const INK = '#1f1f22';
const GOOD = '#1f9d4c';
const BAD = '#d7263d';

export function createSausageGame(container, host) {
  const spectate = host.options?.spectate || null;
  const mirrorIn = () => { const s = spectate.frame(); if (s) Object.assign(st, s); };
  const { seed, debug = false, onFinish } = host;
  const C = CONFIG;
  const W = C.world;
  const B = C.board;
  const F = C.flick;
  const PH = C.physics;
  const BOARD_Y = -W.eyeAboveBoard;
  const FLOOR = -(W.tableTop + W.eyeAboveBoard);
  const Z0 = B.nearZ, Z1 = B.nearZ + B.length, ZS = Z0 + B.startLen;
  const rng = createRng(seed); // the layout: identical for everyone with the same seed
  const popups = createPopups();

  // ---- the board layout: 4–6 horizontal bands, all different values ----
  function makeBands() {
    const n = rng.int(B.bands[0], B.bands[1]);
    let values = rng.shuffle(B.values).slice(0, n);
    if (!values.some((v) => v >= 3)) values[rng.int(0, n - 1)] = rng.pick([3, 4, 5].filter((v) => !values.includes(v)));
    values = rng.shuffle(values);
    const sizes = values.map(() => rng.range(B.sizeRange));
    const total = sizes.reduce((a, b) => a + b, 0);
    let z = ZS;
    return values.map((v, i) => {
      const len = ((Z1 - ZS) * sizes[i]) / total;
      const band = { value: v, z0: z, z1: z + len };
      z += len;
      return band;
    });
  }
  const colorOrder = rng.shuffle(MARKER_COLORS);

  const st = {
    phase: 'ready', // ready | aim | slide | resolve | done
    phaseT: 0,
    phaseDur: 0,
    time: 0,
    activeSec: 0,
    flick: 0,
    total: 0,
    results: [],
    bands: makeBands(),
    s: null,          // the sausage: { x, z, vx, vz, th, w, off, fall, color }
    aim: null,        // while dragging: { p0, cur, side }
    finished: false,
  };

  let cam = null;
  const stage = createStage3D(container, { onResize, getCam: () => cam });
  const view = stage.hud;
  const { ctx } = view;
  const THREE = stage.THREE;

  buildCourtyard(stage, { floorY: FLOOR, buildingZ: 14, shadowCenter: [0, 1.2], shadowSize: 3, sunElevationDeg: 62 });
  const table = createPicnicTable();
  table.position.set(0, FLOOR - 0.02, -(Z0 + B.length / 2 + 0.12)); // board sits on top of it
  stage.scene.add(table);

  // the whiteboard, lying flat, with the bands painted on it
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = Math.round((640 * B.length) / B.width);
  const board = createHandBoard(B.width, B.length, { frontCanvas: canvas });
  board.rotation.x = -Math.PI / 2;
  board.position.set(0, BOARD_Y - 0.007, -(Z0 + B.length / 2));
  stage.scene.add(board);
  paintBoard();

  const paul = createPaul3D();
  stage.scene.add(paul.group);

  // the sausage mesh: a bright ink refill with rounded ends
  const sausageMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, clearcoat: 0.6 });
  const sausage = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(C.sausage.radius, C.sausage.length - C.sausage.radius * 2, 6, 14), sausageMat);
  body.rotation.x = Math.PI / 2; // lie along z
  body.castShadow = true;
  sausage.add(body);
  stage.scene.add(sausage);

  function onResize(size) {
    cam = createCamera(size, { fovYDeg: W.fovYDeg, cyFrac: W.cyFrac });
  }

  function setPhase(p, sec = 0) {
    st.phase = p;
    st.phaseT = 0;
    st.phaseDur = sec;
  }

  // ---- painting the bands ----
  function paintBoard() {
    const g = canvas.getContext('2d');
    const Wc = canvas.width, Hc = canvas.height;
    g.fillStyle = '#fbfbf9';
    g.fillRect(0, 0, Wc, Hc);
    const zy = (z) => Hc - ((z - Z0) / B.length) * Hc; // far end at the top of the canvas
    const tint = (v) => (v < 0 ? 'rgba(215,38,61,0.16)' : v === 0 ? 'rgba(120,120,130,0.10)' : `rgba(31,111,209,${0.06 + v * 0.035})`);
    for (const b of st.bands) {
      const y0 = zy(b.z1), y1 = zy(b.z0);
      g.fillStyle = tint(b.value);
      g.fillRect(0, y0, Wc, y1 - y0);
      g.strokeStyle = '#2a2a30';
      g.lineWidth = 6;
      g.setLineDash([22, 14]);
      g.beginPath(); g.moveTo(0, y1); g.lineTo(Wc, y1); g.stroke();
      g.setLineDash([]);
      const fs = Math.max(30, Math.min(120, (y1 - y0) * 0.7));
      g.font = `${Math.round(fs)}px "Patrick Hand", "Comic Sans MS", cursive`;
      g.fillStyle = b.value < 0 ? BAD : b.value === 0 ? '#555' : '#1d5fd1';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(b.value > 0 ? `+${b.value}` : `${b.value}`, Wc / 2, (y0 + y1) / 2);
    }
    // start box
    const sy0 = zy(ZS), sy1 = zy(Z0);
    g.fillStyle = 'rgba(60,60,70,0.12)';
    g.fillRect(Wc * 0.3, sy0, Wc * 0.4, sy1 - sy0);
    g.strokeStyle = '#2a2a30';
    g.lineWidth = 4;
    g.strokeRect(Wc * 0.3, sy0 + 2, Wc * 0.4, sy1 - sy0 - 4);
    board.userData.front.needsUpdate = true;
  }

  // ---- flicking ----
  function newSausage() {
    const c = colorOrder[st.flick % colorOrder.length];
    st.s = { x: 0, z: Z0 + B.startLen / 2, vx: 0, vz: 0, th: 0, w: 0, off: false, fall: 0, color: c.hex, moving: false };
  }

  /** where a screen point lands on the board's plane */
  function onPlane(sx, sy) {
    const below = sy - cam.cy;
    if (below <= 1) return null;
    const z = (-BOARD_Y * cam.f) / below;
    return [((sx - cam.cx) * z) / cam.f, z];
  }
  function sausageEnds(s) {
    const h = C.sausage.length / 2;
    const dx = Math.sin(s.th) * h, dz = Math.cos(s.th) * h;
    return [[s.x - dx, BOARD_Y + C.sausage.radius, s.z - dz], [s.x + dx, BOARD_Y + C.sausage.radius, s.z + dz]];
  }

  function onDown(p) {
    if (st.phase !== 'aim' || spectate) return;
    const [a, b] = sausageEnds(st.s).map((q) => cam.project(q));
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / L2, 0, 1);
    const px = a.x + dx * t, py = a.y + dy * t;
    const dist = Math.hypot(p.x - px, p.y - py);
    const grab = p.type === 'touch' ? F.grabPxTouch : F.grabPx;
    if (dist > grab) return;
    // off-center: which side of the sausage, and how far toward an end
    const cross = (dx * (p.y - a.y) - dy * (p.x - a.x)) / Math.sqrt(L2);
    const side = clamp(cross / grab, -1, 1);
    st.aim = { p0: { x: p.x, y: p.y }, cur: { x: p.x, y: p.y }, side, along: t * 2 - 1 };
  }
  function onMove(p) { if (st.aim && p) st.aim.cur = { x: p.x, y: p.y }; }
  function onUp() {
    const a = st.aim;
    st.aim = null;
    if (!a || st.phase !== 'aim') return;
    const power = aimPower(a);
    if (power < F.minPower) return;
    const A = onPlane(a.p0.x, a.p0.y), Bp = onPlane(a.cur.x, a.cur.y);
    let dir = A && Bp ? [A[0] - Bp[0], A[1] - Bp[1]] : [0, 1];
    if (dir[1] < 0.05) dir = [dir[0], 0.05]; // it can only go up the board
    launch(dir, power, a.side, a.along);
  }
  const aimPower = (a) => clamp(Math.hypot(a.cur.x - a.p0.x, a.cur.y - a.p0.y) / (F.maxDragFrac * cam.H), 0, 1);

  function launch(dir, power, side = 0, along = 0) {
    const L = Math.hypot(dir[0], dir[1]) || 1;
    let ang = Math.atan2(dir[0] / L, dir[1] / L) + side * F.deflect;
    const speed = F.maxSpeed * Math.pow(power, F.powerExp);
    const s = st.s;
    s.vx = Math.sin(ang) * speed;
    s.vz = Math.cos(ang) * speed;
    s.w = F.spinGain * side * speed * (0.7 + 0.3 * Math.abs(along));
    s.moving = true;
    st.lastPower = power;
    setPhase('slide');
  }

  function step(dt) {
    const s = st.s;
    if (!s) return;
    if (s.off) { s.fall += dt; s.x += s.vx * dt; s.z += s.vz * dt; return; }
    const sp = Math.hypot(s.vx, s.vz);
    if (sp < PH.stopSpeed) { s.vx = s.vz = 0; s.moving = false; return; }
    const dec = Math.min(sp, PH.friction * dt);
    s.vx -= (s.vx / sp) * dec;
    s.vz -= (s.vz / sp) * dec;
    // spin bends the path a little and turns the sausage
    const bend = s.w * PH.curve * dt;
    const c = Math.cos(bend), si = Math.sin(bend);
    [s.vx, s.vz] = [s.vx * c + s.vz * si, -s.vx * si + s.vz * c];
    s.th += s.w * dt;
    s.w *= Math.exp(-PH.spinDamp * dt);
    s.x += s.vx * dt;
    s.z += s.vz * dt;
    if (Math.abs(s.x) > B.width / 2 || s.z > Z1 || s.z < Z0 - 0.02) s.off = true;
  }

  function bandAt(z) { return st.bands.find((b) => z >= b.z0 && z < b.z1) || null; }

  function resolve() {
    const s = st.s;
    let pts = 0, msg;
    if (s.off) msg = 'Off the board! 0';
    else if (s.z < ZS) msg = 'Too short! 0';
    else {
      const b = bandAt(s.z);
      pts = b ? b.value : 0;
      msg = pts > 0 ? `+${pts}!` : pts < 0 ? `${pts}…` : '0';
    }
    st.total += pts;
    st.results.push(pts);
    const p = cam.project([s.x, BOARD_Y, Math.min(s.z, Z1)]);
    popups.add(msg, clamp(p.x, 80, cam.W - 80), clamp(p.y - 50, 90, cam.H - 60), pts > 0 ? GOOD : pts < 0 ? BAD : '#555a63', 36);
    setPhase('resolve', C.resolvePauseMs / 1000);
  }

  // ---- loop ----
  function update(dt) {
    st.time += dt;
    popups.update(dt);
    if (st.phase === 'ready') return;
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;
    switch (st.phase) {
      case 'slide': {
        const n = Math.max(1, Math.ceil(dt * 240));
        for (let i = 0; i < n; i++) step(dt / n);
        const s = st.s;
        if ((!s.moving && !s.off) || (s.off && s.fall > PH.fallSec)) resolve();
        break;
      }
      case 'resolve':
        if (k >= 1) {
          st.flick++;
          if (st.flick >= C.flicks) setPhase('done', C.finishDelayMs / 1000);
          else { newSausage(); setPhase('aim'); }
        }
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.({
            gameId: 'sausage', variant: 'regular',
            score: Math.max(0, st.total), maxScore: C.flicks * 5,
            passed: st.total >= C.passScore,
            durationMs: Math.round(st.activeSec * 1000),
            stats: { total: st.total, flicks: st.results.join(', '), offBoard: st.results.filter((v, i) => v === 0).length },
            seed: rng.seed,
          });
        }
        break;
      default:
    }
  }

  function sync3D() {
    paul.update({ x: 0.45, z: Z1 + 0.75, floorY: FLOOR, yaw: 0.25 });
    const s = st.s;
    sausage.visible = !!s;
    if (!s) return;
    sausageMat.color.set(s.color);
    const drop = s.off ? Math.min(1, s.fall / PH.fallSec) : 0;
    sausage.position.set(s.x, BOARD_Y + C.sausage.radius - drop * drop * 0.8, -s.z);
    sausage.rotation.set(drop * 2, -s.th, drop * 1.3);
  }

  function drawHUD() {
    const pad = Math.max(14, Math.min(cam.W, cam.H) * 0.025);
    const big = Math.round(clamp(cam.H * 0.065, 30, 56));
    const small = Math.round(big * 0.42);
    drawLabel(ctx, 'POINTS', pad, pad + small, small, '#5b5b66');
    drawLabel(ctx, `${st.total}`, pad, pad + small + big * 0.95, big, INK);
    drawLabel(ctx, `Flick ${Math.min(st.flick + 1, C.flicks)} of ${C.flicks}${st.results.length ? ` · ${st.results.map((v) => (v > 0 ? `+${v}` : v)).join(' ')}` : ''}`, pad, pad + small + big * 0.95 + small * 1.5, small, '#5b5b66');
    // power meter (bottom right) while you drag
    const a = st.aim;
    const power = a ? aimPower(a) : st.phase === 'slide' ? st.lastPower || 0 : 0;
    const mw = 26, mh = Math.min(220, cam.H * 0.34);
    const mx = cam.W - pad - mw, my = cam.H - pad - mh - 24;
    drawGlassBar(ctx, mx - 8, my - 30, mw + 16, mh + 40);
    drawLabel(ctx, 'POWER', mx + mw / 2, my - 12, 12, '#fff', 'center');
    ctx.save();
    const fill = mh * power;
    const grad = ctx.createLinearGradient(0, my + mh, 0, my);
    grad.addColorStop(0, '#1f9d4c'); grad.addColorStop(0.6, '#f2c230'); grad.addColorStop(1, '#d7263d');
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = grad;
    ctx.fillRect(mx, my + mh - fill, mw, fill);
    ctx.restore();
    drawLabel(ctx, `${Math.round(power * 100)}%`, mx + mw / 2, my + mh + 16, 13, '#fff', 'center');
    // while aiming: a faint line showing the way it'll go
    if (a && st.s) {
      const A = onPlane(a.p0.x, a.p0.y), Bp = onPlane(a.cur.x, a.cur.y);
      if (A && Bp) {
        const dx = A[0] - Bp[0], dz = Math.max(0.05, A[1] - Bp[1]);
        const L = Math.hypot(dx, dz) || 1;
        const reach = 0.12 + 0.35 * power;
        const from = cam.project([st.s.x, BOARD_Y, st.s.z]);
        const to = cam.project([st.s.x + (dx / L) * reach, BOARD_Y, st.s.z + (dz / L) * reach]);
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 7]);
        ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
        ctx.restore();
      }
    }
    if (st.phase === 'aim' && !a && st.flick === 0 && !spectate) {
      const p = cam.project([st.s.x, BOARD_Y, st.s.z]);
      drawLabel(ctx, 'Press the sausage, drag back, let go', p.x, p.y + 46, 18, '#fff', 'center');
    }
  }

  function render() {
    sync3D();
    stage.render();
    ctx.clearRect(0, 0, cam.W, cam.H);
    drawHUD();
    popups.draw(ctx);
  }

  const detachPointer = spectate ? () => {} : attachPointer(view.canvas, { down: onDown, move: onMove, up: onUp });
  const loop = startLoop({ update: spectate ? mirrorIn : update, render });

  if (debug) {
    window.__sausage = {
      st,
      /** flick straight-ish: dir [x, z], power 0..1, side -1..1 */
      flick: (dir, power, side = 0) => { if (st.phase === 'aim') launch(dir, power, side); },
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
    };
  }

  return {
    state: () => st, // for live spectating
    start() {
      if (st.phase !== 'ready') return;
      newSausage();
      setPhase('aim');
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
