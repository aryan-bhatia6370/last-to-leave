// Pictionary.
// A black dry-erase marker sketches a quick drawing on the whiteboard, live.
// Guess it (typed) before the clock runs out. Wrong guesses cost time. 3 rounds.

import { CONFIG } from './config.js';
import { DRAWINGS, toPolylines, judgeGuess, loadMyDrawings } from './drawings.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createAnswerBar, createRoundClock } from '../../shared/answerBar.js';
import { createPopups, drawLabel } from '../../shared/hud.js';
import { renderWall, boardRect, drawWhiteboard, drawClock, drawRounds } from '../../shared/boardScene.js';
import { drawMarker } from '../../shared/marker.js';
import { clamp } from '../../shared/vec3.js';
import { createBoardStage } from '../../three/boardStage.js';

const GOOD = '#1f9d4c';
const BAD = '#d7263d';
const INK = '#1f1f22';

export function createPictionary(container, host) {
  const { options = {}, seed, onFinish } = host;
  const C = CONFIG;
  // Competition Mode race: one board, computer players "solve" it at set times
  // ({ racers: [{ name, at (seconds) }] }); the first correct answer wins it.
  const compete = options.compete || null;
  const ROUNDS = compete ? 1 : C.rounds;
  const rng = createRng(seed);
  const mine = !!options.mine;
  const pool = mine ? DRAWINGS.concat(loadMyDrawings()) : DRAWINGS;
  // Offline: skip drawings you've seen recently (races use the shared pick so everyone gets the same one).
  const RECENT_KEY = 'ltl.pictionary.recent.v1';
  let recent = [];
  try { recent = compete ? [] : JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch { recent = []; }
  const fresh = pool.filter((d) => !recent.includes(d.answer));
  const picks = rng.shuffle(fresh.length >= ROUNDS ? fresh : pool).slice(0, ROUNDS);
  if (!compete) {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([...picks.map((d) => d.answer), ...recent].slice(0, 40))); } catch { /* fine */ }
  }
  const rounds = picks.map((d) => buildTimeline(d, toPolylines(d, rng)));
  // Offline the clock runs out a few seconds after Paul finishes the sketch.
  // Competition/online there's no clock: only a cap after the sketch is done.
  const roundSecs = rounds.map((r) => (compete ? r.end + C.raceNewBoardSec : r.end + rng.range(C.afterDrawSec)));
  const popups = createPopups();

  const st = {
    phase: 'ready', // ready | draw | reveal | erase | done
    phaseT: 0,
    phaseDur: 0,
    round: 0,
    drawT: 0,
    results: [],
    guessed: 0,
    wrong: 0,
    guessTimes: [],
    clock: null, // set when each round starts
    lockUntil: 0, // Competition/online: after a wrong guess you wait a few seconds
    flash: 0,
    activeSec: 0,
    raceT: 0,
    raceWinner: null,
    finished: false,
  };

  let size = null;
  // Paul holds a real whiteboard and draws on it (3D); scores/clock go on the HUD canvas on top.
  const bs = createBoardStage(container, { onResize: (s) => { size = s; } });
  const view = bs.hud;
  const { ctx } = view;
  const bar = createAnswerBar(container, {
    placeholder: 'What is it?',
    onSubmit: guess,
    onPass: () => { if (st.phase === 'draw') endRound(false, 'Passed'); },
  });
  bar.setEnabled(false);

  function buildTimeline(drawing, lines) {
    const lens = lines.map((pts) => pts.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0));
    const total = lens.reduce((a, b) => a + b, 0);
    const lift = C.penLiftMs / 1000;
    const drawTime = clamp(total / C.penSpeed, C.minDrawSec, C.maxDrawSec) - lift * (lines.length - 1);
    const speed = total / Math.max(1, drawTime);
    let t = 0;
    const strokes = lines.map((pts, i) => {
      const s = { pts, start: t, dur: lens[i] / speed, len: lens[i] };
      t += s.dur + lift;
      return s;
    });
    return { drawing, strokes, end: t - lift };
  }

  function setPhase(p, sec = 0) {
    st.phase = p;
    st.phaseT = 0;
    st.phaseDur = sec;
  }

  function guess(text) {
    if (st.phase !== 'draw') return;
    const verdict = judgeGuess(text, rounds[st.round].drawing);
    if (verdict === 'yes') {
      st.guessTimes.push(st.clock.total - st.clock.left);
      st.raceWinner = 'you';
      endRound(true);
      return;
    }
    bar.shake();
    bar.clear();
    if (verdict === 'close') {
      popups.add('So close! Check the spelling', size.w / 2, size.h * 0.22, '#c46a00', 26);
      return;
    }
    st.wrong++;
    st.flash = 1;
    if (compete) {
      st.lockUntil = st.raceT + C.raceLockoutSec;
      bar.setEnabled(false);
      popups.add(`Nope! Wait ${C.raceLockoutSec}s`, size.w / 2, size.h * 0.22, BAD, 30);
      return;
    }
    st.clock.penalize(C.wrongPenaltySec);
    popups.add(`Nope! −${C.wrongPenaltySec}s`, size.w / 2, size.h * 0.22, BAD, 30);
    if (st.clock.expired) endRound(false, "Time's up!");
  }

  function endRound(won, why) {
    if (compete && !won && !st.raceWinner && why === "Time's up!") why = 'Nobody got it. New drawing!';
    st.results[st.round] = won ? 'win' : 'lose';
    if (won) st.guessed++;
    st.drawT = rounds[st.round].end + 1; // finish the sketch
    bar.setEnabled(false);
    bar.clear();
    popups.add(won ? 'Got it!' : why, size.w / 2, size.h * 0.22, won ? GOOD : BAD, 40, 1.4);
    setPhase('reveal', C.revealMs / 1000);
  }

  function update(dt) {
    popups.update(dt);
    st.flash = Math.max(0, st.flash - dt * 3);
    if (st.phase === 'ready') return;
    st.activeSec += dt;
    st.phaseT += dt;
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;
    switch (st.phase) {
      case 'draw':
        st.drawT += dt;
        st.clock.tick(dt);
        if (compete && st.phase === 'draw') {
          st.raceT += dt;
          const next = compete.racers.filter((r) => st.raceT >= r.at).sort((a, b) => a.at - b.at)[0];
          if (next) {
            st.raceWinner = next.name;
            endRound(false, `${next.name} got it!`);
          } else if (st.lockUntil && st.raceT >= st.lockUntil) {
            st.lockUntil = 0;
            bar.setEnabled(true);
            bar.focus();
          }
        }
        if (st.phase === 'draw' && st.clock.expired) endRound(false, "Time's up!");
        break;
      case 'reveal':
        if (k >= 1) setPhase('erase', C.eraseMs / 1000);
        break;
      case 'erase':
        if (k >= 1) {
          st.round++;
          if (st.round >= ROUNDS) setPhase('done', 0.2);
          else startRound();
        }
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          const avg = st.guessTimes.length ? st.guessTimes.reduce((a, b) => a + b, 0) / st.guessTimes.length : null;
          onFinish?.({
            gameId: 'pictionary',
            variant: mine ? 'mine' : 'regular',
            score: st.guessed,
            maxScore: ROUNDS,
            passed: st.guessed >= C.passScore,
            durationMs: Math.round(st.activeSec * 1000),
            stats: {
              winner: st.raceWinner ?? null,
              raceSeconds: Number((st.raceT || 0).toFixed(1)),
              guessed: st.guessed,
              wrong: st.wrong,
              avgSeconds: avg == null ? null : Number(avg.toFixed(1)),
              drawings: picks.map((d) => d.answer).join(','),
            },
            seed: rng.seed,
          });
        }
        break;
    }
  }

  function startRound() {
    st.drawT = 0;
    st.clock = createRoundClock(roundSecs[st.round]);
    st.lockUntil = 0;
    setPhase('draw');
    bar.setEnabled(true);
    bar.focus();
  }

  // ---------- render ----------
  function drawSketch(ctx, area, tl, alpha) {
    const s = area.size / 100;
    const map = ([x, y]) => [area.x + x * s, area.y + y * s];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = INK;
    ctx.lineWidth = Math.max(2, C.strokeWidth * s * 1.0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let pen = null;
    for (const stroke of tl.strokes) {
      if (st.drawT <= stroke.start) break;
      const frac = clamp((st.drawT - stroke.start) / stroke.dur, 0, 1);
      const target = frac * stroke.len;
      ctx.beginPath();
      let acc = 0;
      let [px, py] = map(stroke.pts[0]);
      ctx.moveTo(px, py);
      for (let i = 1; i < stroke.pts.length; i++) {
        const a = stroke.pts[i - 1], b = stroke.pts[i];
        const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (acc + seg >= target) {
          const f = seg > 0 ? (target - acc) / seg : 0;
          [px, py] = map([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
          ctx.lineTo(px, py);
          break;
        }
        acc += seg;
        [px, py] = map(b);
        ctx.lineTo(px, py);
      }
      ctx.stroke();
      if (frac < 1) pen = [px, py];
    }
    ctx.restore();
    return pen;
  }

  // Draw the sketch (and the answer / erasing) onto the real board's front.
  function paintBoard() {
    const g = bs.frontCtx;
    const W = g.canvas.width, H = g.canvas.height;
    bs.clearSurface(g);
    const tl = rounds[Math.min(st.round, rounds.length - 1)];
    const side = Math.min(W, H) * 0.84;
    const area = { x: (W - side) / 2, y: (H - side) / 2 - (st.phase === 'reveal' ? side * 0.05 : 0), size: side };
    let alpha = 1;
    let eraseUV = null;
    if (st.phase === 'erase') {
      const k = clamp(st.phaseT / st.phaseDur, 0, 1);
      alpha = 1 - k;
      eraseUV = [0.12 + k * 0.76, 0.35 + Math.sin(k * 14) * 0.18];
    }
    let pen = null;
    if (st.phase !== 'ready' && st.phase !== 'done' && tl) pen = drawSketch(g, area, tl, alpha);
    if (st.phase === 'reveal' && tl) {
      const won = st.results[st.round] === 'win';
      drawLabel(g, `It was: ${tl.drawing.answer.toUpperCase()}`, W / 2, H - H * 0.06, Math.round(H * 0.085), won ? GOOD : BAD, 'center', false);
    }
    bs.refresh();
    return { penUV: pen ? [pen[0] / W, pen[1] / H] : null, eraseUV };
  }

  function render() {
    const { penUV, eraseUV } = paintBoard();
    bs.pose({ flip: 0, penUV, eraseUV });
    bs.render();
    ctx.clearRect(0, 0, size.w, size.h);
    if (compete) drawLabel(ctx, `Race vs ${compete.racers.map((r) => r.name).join(', ')}`, 16, 34, 20, '#1f1f22');
    else drawRounds(ctx, size, 'GUESSED', st.guessed, ROUNDS, st.results, st.round);
    if (!compete && st.clock && (st.phase === 'draw' || st.phase === 'reveal')) drawClock(ctx, size, st.clock.left, st.clock.total, st.flash);
    if (compete && st.phase === 'draw' && st.lockUntil) drawLabel(ctx, `Wait ${Math.ceil(st.lockUntil - st.raceT)}…`, size.w / 2, size.h * 0.16, 30, BAD, 'center');
    popups.draw(ctx);
  }

  const loop = startLoop({ update, render });

  if (host.debug) {
    window.__pictionary = {
      st, rounds,
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
      guess,
    };
  }

  return {
    start() {
      if (st.phase !== 'ready') return;
      startRound();
    },
    pause() { loop.pause(); bar.setEnabled(false); },
    resume() {
      loop.resume();
      if (st.phase === 'draw') { bar.setEnabled(true); bar.focus(); }
    },
    destroy() {
      loop.stop();
      bar.destroy();
      bs.destroy();
    },
  };
}
