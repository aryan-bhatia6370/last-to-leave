// Equations.
// The whiteboard flips over to reveal a problem written in black marker.
// Type the answer before time runs out; wrong answers cost time. 3 rounds.

import { CONFIG } from './config.js';
import { makeProblems, isCorrect } from './problems.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createAnswerBar, createRoundClock } from '../../shared/answerBar.js';
import { createPopups, drawLabel } from '../../shared/hud.js';
import { renderWall, boardRect, drawWhiteboard, drawClock, drawRounds } from '../../shared/boardScene.js';
import { drawMath, measureMath } from '../../shared/mathText.js';
import { createBoardStage } from '../../three/boardStage.js';
import { clamp, easeInOut } from '../../shared/vec3.js';

const GOOD = '#1f9d4c';
const BAD = '#d7263d';

export function createEquations(container, host) {
  const { options = {}, seed, onFinish } = host;
  const C = CONFIG;
  // Competition Mode race: one board, computer players "solve" it at set times
  // ({ racers: [{ name, at (seconds) }] }); the first correct answer wins it.
  const compete = options.compete || null;
  const ROUNDS = compete ? 1 : C.rounds;
  const rng = createRng(seed);
  const problems = makeProblems(rng, ROUNDS, C.tierWeights);
  const popups = createPopups();

  const st = {
    phase: 'ready', // ready | flipIn | solve | reveal | flipOut | done
    phaseT: 0,
    phaseDur: 0,
    round: 0,
    results: [],
    solved: 0,
    wrong: 0,
    solveTimes: [],
    clock: createRoundClock(C.roundSeconds),
    flash: 0,
    lastGuess: '',
    activeSec: 0,
    raceT: 0,
    raceWinner: null,
    finished: false,
  };

  let size = null;
  // Paul holds a real whiteboard in front of you (3D); scores/clock are drawn on the HUD canvas on top.
  const bs = createBoardStage(container, { onResize: (s) => { size = s; } });
  const view = bs.hud;
  const { ctx } = view;
  const bar = createAnswerBar(container, {
    placeholder: 'Answer (e.g. 12, -3, 7/4)',
    onSubmit: guess,
    onPass: () => { if (st.phase === 'solve') endRound(false, 'Passed'); },
  });
  bar.setEnabled(false);

  function setPhase(p, sec = 0) {
    st.phase = p;
    st.phaseT = 0;
    st.phaseDur = sec;
  }

  function guess(text) {
    if (st.phase !== 'solve') return;
    const p = problems[st.round];
    if (isCorrect(text, p.answer)) {
      st.solveTimes.push(C.roundSeconds - st.clock.left);
      st.raceWinner = 'you';
      endRound(true);
    } else {
      st.wrong++;
      st.clock.penalize(C.wrongPenaltySec);
      st.flash = 1;
      bar.shake();
      bar.clear();
      popups.add(`Nope! −${C.wrongPenaltySec}s`, size.w / 2, size.h * 0.24, BAD, 30);
      if (st.clock.expired) endRound(false, "Time's up!");
    }
  }

  function endRound(won, why) {
    if (compete && !won && !st.raceWinner) {
      const first = compete.racers.slice().sort((a, b) => a.at - b.at)[0];
      st.raceWinner = first ? first.name : null;
      if (first && why === "Time's up!") why = `${first.name} got it!`;
    }
    st.results[st.round] = won ? 'win' : 'lose';
    if (won) st.solved++;
    bar.setEnabled(false);
    bar.clear();
    popups.add(won ? 'Correct!' : why, size.w / 2, size.h * 0.24, won ? GOOD : BAD, 40, 1.4);
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
      case 'flipIn':
        if (k >= 1) {
          setPhase('solve');
          bar.setEnabled(true);
          bar.focus();
        }
        break;
      case 'solve':
        st.clock.tick(dt);
        if (compete && st.phase === 'solve') {
          st.raceT += dt;
          const next = compete.racers.filter((r) => st.raceT >= r.at).sort((a, b) => a.at - b.at)[0];
          if (next) {
            st.raceWinner = next.name;
            endRound(false, `${next.name} got it!`);
          }
        }
        if (st.clock.expired) endRound(false, "Time's up!");
        break;
      case 'reveal':
        if (k >= 1) setPhase('flipOut', C.flipMs / 1000);
        break;
      case 'flipOut':
        if (k >= 1) {
          st.round++;
          if (st.round >= ROUNDS) {
            setPhase('done', 0.2);
          } else {
            st.clock = createRoundClock(C.roundSeconds);
            setPhase('flipIn', C.flipMs / 1000);
          }
        }
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          const avg = st.solveTimes.length ? st.solveTimes.reduce((a, b) => a + b, 0) / st.solveTimes.length : null;
          onFinish?.({
            gameId: 'equations',
            variant: 'regular',
            score: st.solved,
            maxScore: ROUNDS,
            passed: st.solved >= C.passScore,
            durationMs: Math.round(st.activeSec * 1000),
            stats: {
              winner: st.raceWinner ?? null,
              raceSeconds: Number((st.raceT || 0).toFixed(1)),
              solved: st.solved,
              wrong: st.wrong,
              avgSeconds: avg == null ? null : Number(avg.toFixed(1)),
              tiers: problems.map((p) => p.tier).join(','),
            },
            seed: rng.seed,
          });
        }
        break;
    }
  }

  // ---------- render ----------
  function flipAngle() {
    // 0 = blank back side facing you, PI = problem side facing you
    const k = st.phaseDur > 0 ? clamp(st.phaseT / st.phaseDur, 0, 1) : 1;
    switch (st.phase) {
      case 'ready': return 0;
      case 'flipIn': return Math.PI * easeInOut(k);
      case 'flipOut': return Math.PI * (1 - easeInOut(k));
      case 'done': return 0;
      default: return Math.PI;
    }
  }

  function drawProblem(g, surf, p, showAnswer, won) {
    const lines = p.lines.slice();
    const n = lines.length + (showAnswer ? 1 : 0);
    let fs = Math.min(surf.h / (n * 1.5 + 0.6), surf.w * 0.12);
    for (const l of lines) {
      const w = measureMath(g, l, fs);
      if (w > surf.w * 0.86) fs *= (surf.w * 0.86) / w;
    }
    const lineH = fs * 1.5;
    const top = surf.y + surf.h / 2 - (lineH * n) / 2 + lineH / 2;
    lines.forEach((l, i) => drawMath(g, l, surf.x + surf.w / 2, top + i * lineH, fs));
    if (showAnswer) drawMath(g, `= ${p.reveal}`, surf.x + surf.w / 2, top + lines.length * lineH, fs * 0.9, won ? GOOD : BAD);
  }

  // Write on the real board: the problem on the front, a faint "?" on the back.
  let painted = '';
  function paintBoard() {
    const p = problems[Math.min(st.round, problems.length - 1)];
    const showAnswer = st.phase === 'reveal';
    const won = st.results[st.round] === 'win';
    const key = `${st.round}|${showAnswer}|${won}`;
    if (key === painted) return;
    painted = key;
    const f = bs.frontCtx, b = bs.backCtx;
    bs.clearSurface(f);
    if (p) drawProblem(f, { x: 0, y: 0, w: f.canvas.width, h: f.canvas.height }, p, showAnswer, won);
    bs.clearSurface(b);
    b.save();
    b.globalAlpha = 0.16;
    drawLabel(b, '?', b.canvas.width / 2, b.canvas.height * 0.68, Math.round(b.canvas.height * 0.55), '#1f1f22', 'center', false);
    b.restore();
    bs.refresh();
  }

  function render() {
    paintBoard();
    bs.pose({ flip: Math.PI - flipAngle() });
    bs.render();
    ctx.clearRect(0, 0, size.w, size.h);
    const p = problems[Math.min(st.round, problems.length - 1)];
    if (compete) drawLabel(ctx, `Race vs ${compete.racers.map((r) => r.name).join(', ')}`, 16, 34, 20, '#1f1f22');
    else drawRounds(ctx, size, 'SOLVED', st.solved, ROUNDS, st.results, st.round);
    if (st.phase === 'solve' || st.phase === 'reveal') drawClock(ctx, size, st.clock.left, C.roundSeconds, st.flash);
    if (p && (st.phase === 'solve' || st.phase === 'flipIn') && p.tier !== 'common') {
      const label = p.tier === 'veryRare' ? 'CALCULUS?!' : 'Bonus: algebra / geometry';
      drawLabel(ctx, label, size.w / 2, 40, 22, p.tier === 'veryRare' ? BAD : '#1d5fd1', 'center');
    }
    popups.draw(ctx);
  }

  const loop = startLoop({ update, render });

  if (debug()) {
    window.__equations = {
      st, problems,
      step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) update(dt); render(); },
      guess,
    };
  }
  function debug() { return !!host.debug; }

  return {
    start() {
      if (st.phase !== 'ready') return;
      setPhase('flipIn', C.flipMs / 1000);
    },
    pause() { loop.pause(); bar.setEnabled(false); },
    resume() {
      loop.resume();
      if (st.phase === 'solve') { bar.setEnabled(true); bar.focus(); }
    },
    destroy() {
      loop.stop();
      bar.destroy();
      bs.destroy();
    },
  };
}
