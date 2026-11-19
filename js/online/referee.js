// The host's referee for an online room. It reads the room, decides what happens
// next and writes it to rooms/{code}/run. Everything it needs lives in the
// database, so if the host leaves, the next player's browser picks up where it
// stopped (same rules as offline Competition Mode, see competition/engine.js).
//
// run.step.kind: intro -> announce -> (turn ... [tie -> turn ...]) | (race -> raceNext -> race ...)
//                -> out -> announce ... -> done

import { rtdb } from './net.js';
import {
  CHARACTERS, YANK_CHANCE, chooseRound, poolFrom, competitionGames, isRaceGame,
  simulateScore, simulateSolveTime, simulateWrongTimes, randomSkill, lowestScorers, maxScoreFor,
} from '../competition/engine.js';
import { createRng, newSeed } from '../core/rng.js';

export const POINTS = { rounds: 5, award: [3, 2, 1] };

export const REF = {
  introMs: 2500,
  announceMs: 2600,
  cpuTurnMs: [1100, 2000],
  afterTurnMs: 1100,
  tieMs: 2800,
  outMs: 5200,
  raceLeadMs: 3500,     // time to get ready before a race board goes up
  raceGraceSec: 2,      // wait this long past the earliest known solve for late reports
  raceMaxSec: 75,
  nextBoardMs: 2600,
  awayMs: 60000,        // disconnected this long -> a computer takes the seat
};

const SEAT_ORDER = [0, 2, 4, 6, 1, 3, 5, 7];

/** Build the run when the host presses Start. */
export function buildRun(room, now) {
  const rng = createRng(newSeed());
  const pres = room.presence || {};
  const humans = Object.entries(room.members || {})
    .filter(([uid, m]) => m.char && pres[uid])
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const players = {};
  let i = 0;
  for (const [uid, m] of humans) {
    const c = CHARACTERS.find((x) => x.id === m.char);
    players[c.id] = { id: c.id, name: c.name, shirt: c.shirt, uid, username: m.username, seat: SEAT_ORDER[i++], alive: true, skill: 1 };
  }
  const taken = new Set(Object.keys(players));
  const cpus = Math.max(0, Math.min(room.meta?.cpus || 0, 8 - humans.length));
  for (const c of rng.shuffle(CHARACTERS.filter((x) => !taken.has(x.id))).slice(0, cpus)) {
    players[c.id] = { id: c.id, name: c.name, shirt: c.shirt, cpu: true, seat: SEAT_ORDER[i++], alive: true, skill: randomSkill(rng) };
  }
  const total = Object.keys(players).length;
  return {
    seed: newSeed(), total, realCount: humans.length, players, round: 0,
    mode: room.meta?.mode === 'points' ? 'points' : 'elimination',
    points: Object.fromEntries(Object.keys(players).map((id) => [id, 0])),
    firsts: Object.fromEntries(Object.keys(players).map((id) => [id, 0])),
    label: { round: 'Welcome to the table', game: 'Last to Leave', variant: `${total} players` },
    msg: 'Paul is getting the first game ready…',
    step: { id: 1, kind: 'intro', until: now + REF.introMs },
  };
}

export function startReferee(code, getRoom) {
  let rt = null;
  let stopped = false;
  let busy = false;
  const iv = setInterval(tick, 400);
  rtdb().then((r) => { rt = r; tick(); });

  async function tick() {
    if (stopped || busy || !rt) return;
    const room = getRoom();
    if (!room?.run?.step || room.meta?.status !== 'playing') return;
    busy = true;
    try { await advance(room, room.run); } catch (e) { console.warn('referee', e); } finally { busy = false; }
  }

  const write = (patch) => rt.D.update(rt.ref(`rooms/${code}`), patch);

  async function advance(room, run) {
    const now = rt.now();
    const s = run.step;
    const P = run.players;
    const games = competitionGames();
    const gameName = (id) => games.find((g) => g.id === id)?.name ?? id;
    const name = (id) => P[id]?.name ?? id;
    const alive = () => Object.values(P).filter((p) => p.alive).map((p) => p.id);
    const present = (p) => p.cpu || !!room.presence?.[p.uid];
    const r = Math.max(0, (run.round || 1) - 1); // index of the current round
    const next = (step) => ({ 'run/step': { ...step, id: s.id + 1 } });
    const T = (ms) => (run.fast ? ms * 0.25 : ms); // "Speed up": everything 4x faster
    const fmt = (gid, sc) => { const m = maxScoreFor(gid, s.variant); return m != null ? `${sc}/${m}` : `${sc}`; };

    // 1) disconnected players: after REF.awayMs a computer takes their seat
    const awayPatch = {};
    for (const p of Object.values(P)) {
      if (p.cpu || !p.alive) continue;
      const since = run.away?.[p.id];
      if (!present(p) && !since) awayPatch[`run/away/${p.id}`] = now;
      else if (present(p) && since) awayPatch[`run/away/${p.id}`] = null;
      else if (!present(p) && since && now - since > REF.awayMs) {
        Object.assign(awayPatch, {
          [`run/players/${p.id}/cpu`]: true, [`run/players/${p.id}/left`]: true, [`run/away/${p.id}`]: null,
          'run/msg': `${p.username} lost connection. A computer takes the ${p.name} seat.`,
        });
      }
    }
    if (Object.keys(awayPatch).length) return write(awayPatch);

    // 2) everyone real is out and only computers are left: players can speed it up or skip
    const humansIn = Object.values(P).some((p) => p.alive && !p.cpu);
    const reqs = Object.values(room.requests || {});
    if (!humansIn && s.kind !== 'done') {
      if (reqs.includes('skip')) return skipToEnd();
      if (reqs.includes('fast') && !run.fast) return write({ 'run/fast': true });
    }

    // 3) the current step
    switch (s.kind) {
      case 'pointsAfter':
        if (now < s.until) return;
        return (run.round || 0) >= POINTS.rounds ? finishPoints() : startRound();
      case 'intro':
      case 'out':
        if (now < s.until) return;
        if (s.kind === 'out' && alive().length <= 1) return finish();
        return startRound();
      case 'announce':
        if (now < s.until) return;
        return s.race ? startRace(s.contenders, 1) : startTurns(s.contenders, 0);
      case 'tie':
        if (now < s.until) return;
        return startTurns(s.contenders, s.tieN);
      case 'turn':
        return handleTurn();
      case 'race':
        return handleRace();
      case 'raceNext':
        if (now < s.until) return;
        return startRace(s.pool, s.board);
      default:
    }

    function startRound() {
      const ids = alive();
      const round = run.round || 0;
      const rng = createRng((run.seed + round * 7919) >>> 0);
      const history = run.history || [];
      const pointsMode = run.mode === 'points';
      const { game, variant } = chooseRound(round, pointsMode ? 99 : ids.length, history, room.meta?.versions || {}, rng, {
        allowed: poolFrom(room.meta?.off),
        canUse: pointsMode ? (id) => id !== 'sausage' || round >= POINTS.rounds - 2 : null, // Points: Sausage only in the last 2 rounds
        pointsMode,
      });
      const vLabel = game.variants.find((v) => v.id === variant)?.label ?? 'Regular';
      const isFinal = !pointsMode && ids.length === 2;
      return write({
        ...next({ kind: 'announce', game: game.id, variant, contenders: ids, race: isRaceGame(game.id), until: now + T(REF.announceMs) }),
        'run/round': round + 1,
        'run/history': [...history, `${game.id}:${variant}`],
        [`run/rounds/${round}`]: { kind: isRaceGame(game.id) ? 'race' : 'scored', game: game.id, variant, players: ids },
        'run/statusText': null,
        'run/current': null,
        'run/label': { round: isFinal ? 'FINAL' : pointsMode ? `Round ${round + 1} of ${POINTS.rounds}` : `Round ${round + 1}`, game: game.name, variant: vLabel === 'Regular' ? 'Normal' : vLabel },
        'run/msg': isFinal ? `It's down to ${name(ids[0])} and ${name(ids[1])}.` : `Paul picks… ${game.name}${vLabel !== 'Regular' ? ` (${vLabel})` : ''}!`,
      });
    }

    function startTurns(contenders, tieN) {
      const sorted = contenders.slice().sort((a, b) => P[a].seat - P[b].seat);
      const k = (r + tieN) % sorted.length;
      const order = sorted.slice(k).concat(sorted.slice(0, k));
      const first = order[0];
      return write({
        ...next({ kind: 'turn', game: s.game, variant: s.variant, seed: newSeed(), order, idx: 0, contenders, tieN, replay: tieN > 0, turnKey: `r${r}t${tieN}` }),
        'run/current': first,
        [`run/statusText/${first}`]: 'UP NEXT',
        'run/msg': P[first].cpu ? `${name(first)} is up…` : `${name(first)}'s turn: ${gameName(s.game)}.`,
      });
    }

    function handleTurn() {
      const cur = s.order[s.idx];
      const res = s.results || {};
      if (res[cur] != null) {
        if (now < s.nextAt) return;
        if (s.idx + 1 < s.order.length) {
          const nx = s.order[s.idx + 1];
          return write({
            ...next({ ...s, idx: s.idx + 1, nextAt: null, cpuAt: null }),
            'run/current': nx,
            [`run/statusText/${nx}`]: 'UP NEXT',
            'run/msg': P[nx].cpu ? `${name(nx)} is up…` : `${name(nx)}'s turn: ${gameName(s.game)}.`,
          });
        }
        return endTurns(res);
      }
      const p = P[cur];
      if (p.cpu) {
        if (!s.cpuAt) return write({ 'run/step/cpuAt': now + T(REF.cpuTurnMs[0] + Math.random() * (REF.cpuTurnMs[1] - REF.cpuTurnMs[0])) });
        if (now < s.cpuAt) return;
        return recordScore(cur, simulateScore(s.game, s.variant, p.skill || 1, createRng(newSeed())));
      }
      const sub = room.results?.[s.turnKey]?.[p.uid];
      if (sub && typeof sub.score === 'number') return recordScore(cur, sub.score);
    }

    function recordScore(id, score) {
      return write({
        'run/step/results': { ...(s.results || {}), [id]: score },
        'run/step/nextAt': now + T(REF.afterTurnMs),
        [`run/statusText/${id}`]: fmt(s.game, score),
        'run/msg': `${name(id)}: ${fmt(s.game, score)}`,
      });
    }

    function endTurns(res) {
      const patch = {};
      if (!s.replay) patch[`run/rounds/${r}/scores`] = res;
      if (run.mode === 'points') {
        const sorted = Object.entries(res).sort((a, b) => b[1] - a[1]);
        return awardPoints(sorted.map(([id, sc]) => [id, 1 + sorted.filter(([, o]) => o > sc).length]), patch);
      }
      const low = lowestScorers(res);
      if (low.length === 1) return write({ ...patch, ...outPatch(low[0]) });
      const list = low.map(name);
      const names = list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(' and ');
      for (const id of s.contenders) patch[`run/statusText/${id}`] = low.includes(id) ? 'REPLAY' : 'SAFE';
      return write({
        ...patch,
        ...next({ kind: 'tie', game: s.game, variant: s.variant, contenders: low, tieN: (s.tieN || 0) + 1, until: now + T(REF.tieMs) }),
        'run/current': null,
        'run/msg': `Tie for lowest: ${names}! Only they go again.`,
      });
    }

    function startRace(pool, board) {
      const rng = createRng(newSeed());
      const cpuTimes = {};
      const cpuWrongs = {};
      for (const id of pool) if (P[id].cpu) { cpuTimes[id] = simulateSolveTime(s.game, P[id].skill || 1, rng); const w = simulateWrongTimes(cpuTimes[id], rng); if (w.length) cpuWrongs[id] = w; }
      const patch = {
        ...next({ kind: 'race', game: s.game, variant: s.variant, pool, board, raceKey: `r${r}b${board}`, seed: newSeed(), startAt: now + T(REF.raceLeadMs), cpuTimes, cpuWrongs }),
        'run/current': null,
        'run/msg': `Board ${board}: first to get it is safe. ${pool.length} still racing.`,
      };
      for (const id of pool) patch[`run/statusText/${id}`] = 'RACING';
      return write(patch);
    }

    function handleRace() {
      const el = (now - s.startAt) / 1000;
      if (el < 0) return;
      const reps = room.race?.[s.raceKey] || {};
      const cand = [];
      for (const [id, t] of Object.entries(s.cpuTimes || {})) cand.push([id, t]);
      const humans = s.pool.filter((id) => !P[id].cpu || P[id].left);
      for (const id of humans) { const rep = P[id].uid && reps[P[id].uid]; if (rep?.solved) cand.push([id, rep.t]); }
      const pending = humans.filter((id) => !P[id].cpu && present(P[id]) && !reps[P[id].uid]);
      const min = cand.length ? Math.min(...cand.map((c) => c[1])) : null;
      let decide = el > REF.raceMaxSec;
      if (min != null) decide ||= pending.length === 0 ? el >= Math.min(min, 1.5) : el >= min + REF.raceGraceSec;
      else decide ||= pending.length === 0 && el > 1.5;
      if (!decide) return;
      if (min == null) {
        return write({ ...next({ kind: 'raceNext', game: s.game, variant: s.variant, pool: s.pool, board: s.board + 1, until: now + T(REF.nextBoardMs) }), 'run/msg': 'Nobody got it. New board!' });
      }
      const [winner, t] = cand.sort((a, b) => a[1] - b[1])[0];
      const patch = {
        [`run/rounds/${r}/solve/${winner}`]: t,
        [`run/statusText/${winner}`]: 'SAFE',
        'run/msg': `${name(winner)} got it. Safe!`,
      };
      if (s.board === 1) patch[`run/rounds/${r}/first`] = winner;
      patch[`run/rounds/${r}/safe/b${s.board}`] = winner; // order players got safe (performance score)
      const rest = s.pool.filter((id) => id !== winner);
      const safeSoFar = Object.keys(run.rounds?.[r]?.safe || {}).filter((k) => k !== `b${s.board}`).length + 1;
      const pointsDone = run.mode === 'points' && safeSoFar >= POINTS.award.length; // only the top 3 score
      if (rest.length > 1 && !pointsDone) return write({ ...patch, ...next({ kind: 'raceNext', game: s.game, variant: s.variant, pool: rest, board: s.board + 1, until: now + T(REF.nextBoardMs) }) });
      if (run.mode === 'points') {
        // ranking = the order everyone got safe (board 1 first), the last one ranks last
        const safe = Object.entries(run.rounds?.[r]?.safe || {}).map(([k, id]) => [Number(k.slice(1)), id]).sort((a, b) => a[0] - b[0]).map((e) => e[1]);
        const order = [...safe.filter((id) => id !== winner), winner];
        const ranking = order.map((id, i) => [id, i + 1]);
        for (const id of rest) ranking.push([id, order.length + 1]); // everyone still racing shares the next place
        return awardPoints(ranking, patch);
      }
      return write({ ...patch, ...outPatch(rest[0]) });
    }

    // Points mode: 1st = 3, 2nd = 2, 3rd = 1 (ties share the rank); nobody leaves
    function awardPoints(ranking, patch = {}) {
      const pts = { ...(run.points || {}) };
      const firsts = { ...(run.firsts || {}) };
      for (const [id, rank] of ranking) {
        const add = POINTS.award[rank - 1] || 0;
        pts[id] = (pts[id] || 0) + add;
        if (rank === 1) firsts[id] = (firsts[id] || 0) + 1;
        patch[`run/statusText/${id}`] = add ? `+${add} · ${pts[id]} pts` : `${pts[id]} pts`;
      }
      const leader = Object.keys(pts).sort((a, b) => pts[b] - pts[a])[0];
      return write({
        ...patch,
        'run/points': pts,
        'run/firsts': firsts,
        'run/current': null,
        ...next({ kind: 'pointsAfter', until: now + T(2600) }),
        'run/msg': `After round ${run.round}: ${name(leader)} leads with ${pts[leader]}.`,
      });
    }

    function finishPoints() {
      const pts = run.points || {}, firsts = run.firsts || {};
      const rng = createRng((run.seed ^ 0x7777) >>> 0);
      const tiebreak = Object.fromEntries(Object.keys(P).map((id) => [id, rng.next()]));
      const order = Object.keys(P).sort((a, b) => ((pts[b] || 0) - (pts[a] || 0)) || ((firsts[b] || 0) - (firsts[a] || 0)) || (tiebreak[a] - tiebreak[b]));
      const patch = {};
      order.forEach((id, i) => { patch[`run/players/${id}/place`] = i + 1; });
      const w = order[0];
      return write({
        ...patch,
        ...next({ kind: 'done', winner: w }),
        [`run/statusText/${w}`]: `WINNER · ${pts[w] || 0} pts`,
        'run/label': { round: 'Last to Leave', game: name(w), variant: `wins on points (${pts[w] || 0})` },
        'run/msg': `${name(w)} wins with ${pts[w] || 0} points!`,
        'meta/status': 'done',
      });
    }

    function outPatch(id) {
      return {
        ...next({ kind: 'out', who: id, yank: !!P[id].cpu && Math.random() < YANK_CHANCE, until: now + T(REF.outMs) }),
        [`run/players/${id}/alive`]: false,
        [`run/players/${id}/place`]: alive().length,
        [`run/statusText/${id}`]: 'OUT',
        'run/current': null,
        'run/msg': `${name(id)} has to leave the table.`,
      };
    }

    /** Play out the rest instantly (computers only), then show results. */
    function skipToEnd() {
      const rng = createRng(newSeed());
      let ids = alive();
      let round = run.round || 0;
      const history = (run.history || []).slice();
      const patch = {};
      while (ids.length > 1) {
        const { game, variant } = chooseRound(round, ids.length, history, room.meta?.versions || {}, rng, { allowed: poolFrom(room.meta?.off) });
        history.push(`${game.id}:${variant}`);
        let loser;
        if (isRaceGame(game.id)) {
          loser = ids.map((id) => [id, simulateSolveTime(game.id, P[id].skill || 1, rng)]).sort((a, b) => b[1] - a[1])[0][0];
        } else {
          let pool = ids;
          for (;;) {
            const sc = Object.fromEntries(pool.map((id) => [id, simulateScore(game.id, variant, P[id].skill || 1, rng)]));
            const low = lowestScorers(sc);
            if (low.length === 1) { loser = low[0]; break; }
            pool = low;
          }
        }
        patch[`run/players/${loser}/alive`] = false;
        patch[`run/players/${loser}/place`] = ids.length;
        ids = ids.filter((x) => x !== loser);
        round++;
      }
      const w = ids[0];
      return write({
        ...patch,
        ...next({ kind: 'done', winner: w }),
        [`run/players/${w}/place`]: 1,
        'run/round': round,
        'run/history': history,
        'run/statusText': { [w]: 'WINNER' },
        'run/current': null,
        'run/label': { round: 'Last to Leave', game: name(w), variant: 'is the last one at the table' },
        'run/msg': `Skipped to the end. ${name(w)} is the LAST TO LEAVE!`,
        'meta/status': 'done',
      });
    }

    function finish() {
      const w = alive()[0];
      return write({
        ...next({ kind: 'done', winner: w }),
        [`run/players/${w}/place`]: 1,
        [`run/statusText/${w}`]: 'WINNER',
        'run/label': { round: 'Last to Leave', game: name(w), variant: 'is the last one at the table' },
        'run/msg': `${name(w)} is the LAST TO LEAVE!`,
        'meta/status': 'done',
      });
    }
  }

  return { stop() { stopped = true; clearInterval(iv); }, poke: tick };
}
