// Paul's Pocket (3D).
// You're on the bench; Paul stands right in front of you holding all 8
// markers fanned out. Tap the one you want. He pushes them all into his khaki
// pocket, scrambles them around, and pulls one out. Match = you survive.

import { CONFIG } from './config.js';
import { createRng } from '../../core/rng.js';
import { attachPointer } from '../../core/input.js';
import { MARKER_COLORS } from '../../shared/colors.js';
import { createPopups, drawLabel } from '../../shared/hud.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createCamera } from '../../shared/scene3d.js';
import { clamp, lerp, lerp3, norm, add, mul, easeInOut, distToSegment } from '../../shared/vec3.js';
import { createStage3D } from '../../three/stage.js';
import { buildCourtyard } from '../../three/courtyard.js';
import { createMarker3D, setRodPose } from '../../three/props.js';
import { createPaul3D } from '../../three/paul3d.js';

const EYE = 1.15;
const FLOOR = -EYE;
const PAUL_Z = 1.55;
const HOLD = [0.17, -0.1, 1.2];                 // his hand holding the fan out toward you
const MOUTH = [0.13, FLOOR + 0.9, PAUL_Z - 0.12]; // the pocket opening (his +x side)
const INSIDE = [0.11, FLOOR + 0.8, PAUL_Z - 0.03]; // hand inside the pocket
const SHOW = [0.12, 0.0, 1.2];                     // holding up the one he pulled

export function createPaulsPocket(container, host) {
  const { seed, onFinish } = host;
  const C = CONFIG;
  const rng = createRng(seed);
  const pulledIndex = rng.int(0, MARKER_COLORS.length - 1); // decided up front: same seed, same pull
  const luck = createRng((seed ^ 0x9e3779b9) >>> 0);
  const popups = createPopups();
  const N = MARKER_COLORS.length;

  const st = {
    phase: 'ready', // ready | pick | lockIn | toPocket | insert | scramble | pull | reveal | done
    phaseT: 0,
    phaseDur: 0,
    time: 0,
    picked: -1,
    hover: -1,
    hand: HOLD.slice(),
    fan: 1,        // 1 = fanned out, 0 = bundled together
    holding: MARKER_COLORS.map((_, i) => i),
    bulge: 0,
    rustleAt: 0,
    activeSec: 0,
    won: false,
    finished: false,
  };

  let cam = null;
  let size = null;
  const stage = createStage3D(container, {
    onResize: (s) => { size = s; cam = createCamera(s, { fovYDeg: 46, cyFrac: 0.5, maxFocalW: 1.2 }); },
    getCam: () => cam,
  });
  const view = stage.hud;
  const { ctx } = view;
  view.canvas.style.cursor = 'pointer';
  buildCourtyard(stage, {
    floorY: FLOOR, buildingZ: 16, shadowCenter: [0, 1.4], shadowSize: 4,
    tables: [{ x: -2.4, z: 5, rotDeg: 15 }, { x: 2.9, z: 6.2, rotDeg: -20 }],
  });
  const paul = createPaul3D();
  stage.scene.add(paul.group);
  const meshes = MARKER_COLORS.map((c) => {
    const m = createMarker3D(c.hex);
    stage.scene.add(m);
    return m;
  });

  // where each marker is right now: back end at the hand, cap end out
  function markerEnds(i) {
    const n = st.holding.length;
    const j = st.holding.indexOf(i);
    if (j < 0) return null;
    const spread = n > 1 ? (j / (n - 1) - 0.5) * 1.9 * st.fan : 0;
    const jiggle = st.phase === 'scramble' ? Math.sin(st.time * 17 + i) * 0.12 : 0;
    const dir = norm([Math.sin(spread + jiggle), Math.cos(spread + jiggle), -0.3 * st.fan]);
    const lift = i === st.picked && (st.phase === 'pick' || st.phase === 'lockIn') ? 0.025 : i === st.hover ? 0.012 : 0;
    const back = add(st.hand, mul(dir, -0.03 + lift));
    return { back, cap: add(back, mul(dir, 0.14)) };
  }

  function markerAt(p) {
    let best = -1, bd = Math.max(26, Math.min(size.w, size.h) * 0.035);
    for (let i = 0; i < N; i++) {
      const e = markerEnds(i);
      if (!e) continue;
      const a = cam.project(e.back), b = cam.project(e.cap);
      const d = distToSegment(p.x, p.y, a.x, a.y, b.x, b.y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  function pickMarker(i) {
    if (st.phase !== 'pick' || i < 0) return;
    st.picked = i;
    popups.add(`You picked ${MARKER_COLORS[i].name.toUpperCase()}`, size.w / 2, size.h * 0.16, MARKER_COLORS[i].hex, 32, 1.2);
    setPhase('lockIn', C.lockInMs / 1000);
    chips.hidden = true;
  }

  // Big color buttons to pick with (shown on small/touch screens, where the
  // markers on the bench are small and close together).
  const chips = document.createElement('div');
  chips.className = 'pocket-chips';
  chips.hidden = true;
  chips.innerHTML = MARKER_COLORS.map((c, i) => `<button type="button" data-i="${i}" style="--c:${c.hex}" aria-label="${c.name}"><span></span>${c.name}</button>`).join('');
  chips.addEventListener('pointerdown', (e) => e.stopPropagation());
  chips.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pickMarker(Number(b.dataset.i)); });
  container.appendChild(chips);
  const smallScreen = () => matchMedia('(max-width: 760px), (pointer: coarse)').matches;

  const detachPointer = attachPointer(view.canvas, {
    down: (p) => {
      if (st.phase !== 'pick') return;
      pickMarker(markerAt(p));
    },
    move: (p) => { st.hover = p && st.phase === 'pick' ? markerAt(p) : -1; },
  });

  function setPhase(p, sec = 0) {
    st.phase = p;
    st.phaseT = 0;
    st.phaseDur = sec;
    chips.hidden = !(p === 'pick' && smallScreen() && !host.options?.spectate);
  }

  function update(dt) {
    st.time += dt;
    popups.update(dt);
    if (st.phase === 'ready' || st.phase === 'pick') {
      st.hand = [HOLD[0] + Math.sin(st.time * 1.3) * 0.006, HOLD[1] + Math.sin(st.time * 1.7) * 0.006, HOLD[2]];
      return;
    }
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;
    switch (st.phase) {
      case 'lockIn':
        if (k >= 1) setPhase('toPocket', (C.reachMs + C.liftMs) / 1000);
        break;
      case 'toPocket':
        st.hand = lerp3(HOLD, MOUTH, easeInOut(k));
        st.fan = 1 - easeInOut(Math.min(1, k * 1.4));
        if (k >= 1) setPhase('insert', C.insertMs / 1000);
        break;
      case 'insert':
        st.hand = lerp3(MOUTH, INSIDE, easeInOut(k));
        st.bulge = k;
        if (k >= 1) setPhase('scramble', C.scrambleMs / 1000);
        break;
      case 'scramble':
        st.hand = [INSIDE[0] + Math.sin(st.time * 13) * 0.02, INSIDE[1] + Math.cos(st.time * 11) * 0.018, INSIDE[2]];
        st.bulge = 1;
        if (st.time - st.rustleAt > 0.45) {
          st.rustleAt = st.time;
          const word = luck.pick(['*rustle*', '*clack*', '*shuffle*', '*clink*', '*scrunch*']);
          const sp = cam.project(MOUTH);
          popups.add(word, sp.x + luck.range(-80, 80), sp.y - luck.range(30, 90), '#565a62', 20, 0.7);
        }
        if (k >= 1) {
          st.holding = [pulledIndex];
          setPhase('pull', C.pullMs / 1000);
        }
        break;
      case 'pull':
        st.hand = k < 0.4 ? lerp3(INSIDE, MOUTH, easeInOut(k / 0.4)) : lerp3(MOUTH, SHOW, easeInOut((k - 0.4) / 0.6));
        st.bulge = Math.max(0, 1 - k * 2);
        if (k >= 1) {
          st.won = pulledIndex === st.picked;
          const c = MARKER_COLORS[pulledIndex];
          popups.add(`It's ${c.name.toUpperCase()}!`, size.w / 2, size.h * 0.14, c.hex, 40, 2);
          setPhase('reveal', C.revealMs / 1000);
        }
        break;
      case 'reveal':
        if (k >= 1) setPhase('done', 0.1);
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          onFinish?.({
            gameId: 'pauls-pocket',
            variant: 'regular',
            score: st.won ? 1 : 0,
            maxScore: 1,
            passed: st.won,
            durationMs: Math.round(st.activeSec * 1000),
            stats: { picked: MARKER_COLORS[st.picked].name, pulled: MARKER_COLORS[pulledIndex].name },
            seed: rng.seed,
          });
        }
        break;
    }
  }

  function render() {
    paul.update({ x: 0, z: PAUL_Z, floorY: FLOOR, yaw: 0, rightHand: st.hand, bulge: st.bulge });
    meshes.forEach((m, i) => {
      const e = markerEnds(i);
      m.visible = !!e;
      if (e) setRodPose(m, e.back, e.cap);
    });
    stage.render();
    ctx.clearRect(0, 0, size.w, size.h);

    // highlight the picked / hovered marker
    for (const i of [st.picked, st.hover]) {
      if (i < 0 || (st.phase !== 'pick' && st.phase !== 'lockIn')) continue;
      const e = markerEnds(i);
      if (!e) continue;
      const c = cam.project(e.cap);
      ctx.save();
      ctx.strokeStyle = MARKER_COLORS[i].hex;
      ctx.lineWidth = i === st.picked ? 4 : 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(16, c.s * 0.03), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const fs = Math.round(clamp(size.h * 0.05, 22, 40));
    if (st.phase === 'pick') drawLabel(ctx, 'Pick a marker!', size.w / 2, fs + 14, fs, '#1f1f22', 'center');
    else if (st.phase === 'scramble') drawLabel(ctx, 'Paul is scrambling…', size.w / 2, fs + 14, fs, '#1f1f22', 'center');
    else if (st.phase === 'reveal' || st.phase === 'done') {
      drawLabel(ctx, st.won ? 'YOUR MARKER! You survive!' : `Nope. You picked ${MARKER_COLORS[st.picked].name.toLowerCase()}.`, size.w / 2, fs + 14, fs, st.won ? '#1f9d4c' : '#d7263d', 'center');
    }
    popups.draw(ctx);
  }

  const loop = startLoop({ update, render });

  if (host.debug) {
    window.__paulsPocket = {
      st, pulledIndex, canvas: view.canvas,
      pick: (i) => pickMarker(i),
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
      screenOf: (i) => { const e = markerEnds(i); return e && cam.project(lerp3(e.back, e.cap, 0.75)); },
    };
  }
  void lerp;

  return {
    start() {
      if (st.phase !== 'ready') return;
      setPhase('pick');
    },
    pause() { loop.pause(); },
    resume() { loop.resume(); },
    destroy() {
      loop.stop();
      detachPointer();
      chips.remove();
      stage.destroy();
    },
  };
}
