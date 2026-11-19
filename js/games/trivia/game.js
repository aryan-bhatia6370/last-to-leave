// Trivia.
// Same as Equations (board flips, clock, penalties, races, Rush), but the board
// shows a trivia question and you type the answer (spelling slips are OK).

import { CONFIG } from './config.js';
import { TRIVIA_TIERS } from './questions.js';
import { judgeGuess } from '../pictionary/drawings.js';
import { createRng } from '../../core/rng.js';
import { createCanvas } from '../../core/canvas.js';
import { startLoop } from '../../shared/gameLoop.js';
import { createAnswerBar, createRoundClock } from '../../shared/answerBar.js';
import { createPopups, drawLabel, drawRacerLockouts } from '../../shared/hud.js';
import { renderWall, boardRect, drawWhiteboard, drawClock, drawRounds } from '../../shared/boardScene.js';
import { createBoardStage } from '../../three/boardStage.js';
import { clamp, easeInOut } from '../../shared/vec3.js';

const GOOD = '#1f9d4c';
const BAD = '#d7263d';

// pick questions: by tier weight, no repeats in a run, skipping ones you saw recently (offline)
const RECENT_KEY = 'ltl.trivia.recent.v1';
function makeQuestionPicker(rng, avoidRecent) {
  let recent = [];
  try { recent = avoidRecent ? JSON.parse(localStorage.getItem(RECENT_KEY)) || [] : []; } catch { recent = []; }
  const used = new Set();
  return function pick(weights) {
    for (let i = 0; i < 80; i++) {
      const tier = rng.weighted(weights);
      const list = TRIVIA_TIERS[tier];
      const q = list[rng.int(0, list.length - 1)];
      if (used.has(q.q) || (i < 60 && recent.includes(q.q))) continue;
      used.add(q.q);
      if (avoidRecent) {
        recent = [q.q, ...recent].slice(0, 120);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* fine */ }
      }
      return { ...q, tier, reveal: q.answer };
    }
    return { ...TRIVIA_TIERS.easy[0], tier: 'easy', reveal: TRIVIA_TIERS.easy[0].answer };
  };
}

export function createTrivia(container, host) {
  const { options = {}, seed, onFinish } = host;
  const C = CONFIG;
  // Competition Mode race: one board, computer players "solve" it at set times
  // ({ racers: [{ name, at (seconds) }] }); the first correct answer wins it.
  const compete = options.compete || null;
  // Trivia Rush: endless, harder and quicker as you go; one miss ends it.
  const rush = !!options.rush && !compete;
  const R = C.rush;
  const ROUNDS = compete ? 1 : rush ? Infinity : C.rounds;
  const rng = createRng(seed);
  const rushWeights = (n) => R.levels.find((l) => n >= l.from).weights;
  const rushSecs = (n) => clamp(R.startSeconds + R.secondsPerSolve * n, R.minSeconds, R.startSeconds);
  const pickQ = makeQuestionPicker(rng, !compete);
  function nextRushProblem(n) { return pickQ(rushWeights(n)); }
  const problems = rush ? [nextRushProblem(0)] : Array.from({ length: ROUNDS }, () => pickQ(C.tierWeights));
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
    // offline: a 20 s clock. Competition/online: no clock (just a cap before a new problem)
    clock: createRoundClock(compete ? C.raceNewBoardSec : rush ? rushSecs(0) : C.roundSeconds),
    rushOver: false,
    lockUntil: 0, // Competition/online: after a wrong answer you wait a few seconds
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
    placeholder: 'Your answer',
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
    const verdict = judgeGuess(text, p);
    if (verdict === 'close') {
      bar.shake();
      popups.add('So close! Check the spelling', size.w / 2, size.h * 0.24, '#c46a00', 26);
      return;
    }
    if (verdict === 'yes') {
      st.solveTimes.push(st.clock.total - st.clock.left);
      st.raceWinner = 'you';
      endRound(true);
    } else {
      st.wrong++;
      st.flash = 1;
      bar.shake();
      bar.clear();
      if (compete) {
        st.lockUntil = st.raceT + C.raceLockoutSec;
        bar.setEnabled(false);
        compete.onWrong?.(); // let the other racers see it
        popups.add(`Nope! Wait ${C.raceLockoutSec}s`, size.w / 2, size.h * 0.24, BAD, 30);
        return;
      }
      if (rush) { endRound(false, 'Wrong! Run over.'); return; }
      st.clock.penalize(C.wrongPenaltySec);
      popups.add(`Nope! −${C.wrongPenaltySec}s`, size.w / 2, size.h * 0.24, BAD, 30);
      if (st.clock.expired) endRound(false, "Time's up!");
    }
  }

  function endRound(won, why) {
    if (compete && !won && !st.raceWinner && why === "Time's up!") why = 'Nobody got it. New problem!';
    st.results[st.round] = won ? 'win' : 'lose';
    if (won) st.solved++;
    if (rush && !won) st.rushOver = true;
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
          } else if (st.lockUntil && st.raceT >= st.lockUntil) {
            st.lockUntil = 0;
            bar.setEnabled(true);
            bar.focus();
          }
        }
        if (st.phase !== 'solve') break;
        if (st.clock.expired) endRound(false, "Time's up!");
        break;
      case 'reveal':
        if (k >= 1) setPhase('flipOut', C.flipMs / 1000);
        break;
      case 'flipOut':
        if (k >= 1) {
          st.round++;
          if (rush ? st.rushOver : st.round >= ROUNDS) {
            setPhase('done', 0.2);
          } else {
            if (rush) problems.push(nextRushProblem(st.solved));
            st.clock = createRoundClock(rush ? rushSecs(st.solved) : C.roundSeconds);
            setPhase('flipIn', C.flipMs / 1000);
          }
        }
        break;
      case 'done':
        if (k >= 1 && !st.finished) {
          st.finished = true;
          const avg = st.solveTimes.length ? st.solveTimes.reduce((a, b) => a + b, 0) / st.solveTimes.length : null;
          onFinish?.({
            gameId: 'trivia',
            variant: rush ? 'rush' : 'regular',
            score: st.solved,
            maxScore: rush ? null : ROUNDS,
            passed: st.solved >= (rush ? R.passScore : C.passScore),
            durationMs: Math.round(st.activeSec * 1000),
            stats: {
              winner: st.raceWinner ?? null,
              raceSeconds: Number((st.raceT || 0).toFixed(1)),
              solved: st.solved,
              wrong: st.wrong,
              avgSeconds: avg == null ? null : Number(avg.toFixed(1)),
              tiers: rush ? null : problems.map((p) => p.tier).join(','),
              questions: rush ? null : problems.length,
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

  // handwritten question, wrapped to fit the board
  function wrap(g, text, maxW) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? `${line} ${w}` : w;
      if (g.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function drawProblem(g, surf, p, showAnswer, won) {
    let fs = Math.round(surf.h * 0.13);
    let lines;
    for (;;) {
      g.font = `${fs}px "Patrick Hand", "Comic Sans MS", cursive`;
      lines = wrap(g, p.q, surf.w * 0.86);
      if ((lines.length + (showAnswer ? 1.4 : 0)) * fs * 1.25 < surf.h * 0.86 || fs < 18) break;
      fs -= 4;
    }
    const n = lines.length + (showAnswer ? 1.4 : 0);
    const lineH = fs * 1.25;
    const top = surf.y + surf.h / 2 - (lineH * n) / 2 + lineH / 2;
    g.save();
    g.fillStyle = '#1f1f22';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, surf.x + surf.w / 2, top + i * lineH));
    if (showAnswer) {
      g.fillStyle = won ? GOOD : BAD;
      g.font = `${Math.round(fs * 1.05)}px "Patrick Hand", "Comic Sans MS", cursive`;
      g.fillText(p.answer, surf.x + surf.w / 2, top + (lines.length + 0.4) * lineH);
    }
    g.restore();
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
    if (compete) drawRacerLockouts(ctx, size, compete.racers, st.raceT, C.raceLockoutSec);
    else if (rush) {
      drawLabel(ctx, 'RUSH · ANSWERED', 16, 26, 15, '#5b5b66');
      drawLabel(ctx, `${st.solved}`, 16, 70, 44, '#1f1f22');
    } else drawRounds(ctx, size, 'ANSWERED', st.solved, ROUNDS, st.results, st.round);
    if (!compete && (st.phase === 'solve' || st.phase === 'reveal')) drawClock(ctx, size, st.clock.left, st.clock.total, st.flash);
    if (compete && st.phase === 'solve' && st.lockUntil) {
      drawLabel(ctx, `Wait ${Math.ceil(st.lockUntil - st.raceT)}…`, size.w / 2, size.h * 0.16, 30, BAD, 'center');
    }
    const TAG = { hard: ['Hard one!', BAD] };
    if (p && (st.phase === 'solve' || st.phase === 'flipIn') && TAG[p.tier]) {
      drawLabel(ctx, TAG[p.tier][0], size.w / 2, 40, 22, TAG[p.tier][1], 'center');
    }
    popups.draw(ctx);
  }

  const loop = startLoop({ update, render });

  if (debug()) {
    window.__trivia = {
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
