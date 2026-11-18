// The host's referee for an online room. It reads the room, decides what happens
// next and writes it to rooms/{code}/run. Everything it needs lives in the
// database, so if the host leaves, the next player's browser picks up where it
// stopped (same rules as offline Competition Mode, see competition/engine.js).
//
// run.step.kind: intro -> announce -> (turn ... [tie -> turn ...]) | (race -> raceNext -> race ...)
//                -> out -> announce ... -> done

import { rtdb } from './net.js';
import {
  CHARACTERS, chooseGame, chooseVariant, competitionGames, isRaceGame,
  simulateScore, simulateSolveTime, randomSkill, lowestScorers, maxScoreFor,
} from '../competition/engine.js';
import { createRng, newSeed } from '../core/rng.js';

export const REF = {
  introMs: 2500,
  announceMs: 2600,
  cpuTurnMs: [1100, 2000],
  afterTurnMs: 1100,
  tieMs: 2800,
  outMs: 5200,
  raceLeadMs: 3500,     // time to get ready before a race board goes up
  raceGraceSec: 4,      // wait this long past the earliest known solve for late reports
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
    const fmt = (gid, sc) => { const m = maxScoreFor(gid); return m != null ? `${sc}/${m}` : `${sc}`; };

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

    // 2) the current step
    switch (s.kind) {
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
      const game = chooseGame(round, ids.length, history, rng);
      const variant = chooseVariant(game, room.meta?.versions || {}, rng);
      const vLabel = game.variants.find((v) => v.id === variant)?.label ?? 'Regular';
      const isFinal = ids.length === 2;
      return write({
        ...next({ kind: 'announce', game: game.id, variant, contenders: ids, race: isRaceGame(game.id), until: now + REF.announceMs }),
        'run/round': round + 1,
        'run/history': [...history, game.id],
        [`run/rounds/${round}`]: { kind: isRaceGame(game.id) ? 'race' : 'scored', game: game.id, variant, players: ids },
        'run/statusText': null,
        'run/current': null,
        'run/label': { round: isFinal ? 'FINAL' : `Round ${round + 1}`, game: game.name, variant: vLabel === 'Regular' ? 'Normal' : vLabel },
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
        if (!s.cpuAt) return write({ 'run/step/cpuAt': now + REF.cpuTurnMs[0] + Math.random() * (REF.cpuTurnMs[1] - REF.cpuTurnMs[0]) });
        if (now < s.cpuAt) return;
        return recordScore(cur, simulateScore(s.game, s.variant, p.skill || 1, createRng(newSeed())));
      }
      const sub = room.results?.[s.turnKey]?.[p.uid];
      if (sub && typeof sub.score === 'number') return recordScore(cur, sub.score);
    }

    function recordScore(id, score) {
      return write({
        'run/step/results': { ...(s.results || {}), [id]: score },
        'run/step/nextAt': now + REF.afterTurnMs,
        [`run/statusText/${id}`]: fmt(s.game, score),
        'run/msg': `${name(id)}: ${fmt(s.game, score)}`,
      });
    }

    function endTurns(res) {
      const patch = {};
      if (!s.replay) patch[`run/rounds/${r}/scores`] = res;
      const low = lowestScorers(res);
      if (low.length === 1) return write({ ...patch, ...outPatch(low[0]) });
      const list = low.map(name);
      const names = list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(' and ');
      for (const id of s.contenders) patch[`run/statusText/${id}`] = low.includes(id) ? 'REPLAY' : 'SAFE';
      return write({
        ...patch,
        ...next({ kind: 'tie', game: s.game, variant: s.variant, contenders: low, tieN: (s.tieN || 0) + 1, until: now + REF.tieMs }),
        'run/current': null,
        'run/msg': `Tie for lowest: ${names}! Only they go again.`,
      });
    }

    function startRace(pool, board) {
      const rng = createRng(newSeed());
      const cpuTimes = {};
      for (const id of pool) if (P[id].cpu) cpuTimes[id] = simulateSolveTime(s.game, P[id].skill || 1, rng);
      const patch = {
        ...next({ kind: 'race', game: s.game, variant: s.variant, pool, board, raceKey: `r${r}b${board}`, seed: newSeed(), startAt: now + REF.raceLeadMs, cpuTimes }),
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
        return write({ ...next({ kind: 'raceNext', game: s.game, variant: s.variant, pool: s.pool, board: s.board + 1, until: now + REF.nextBoardMs }), 'run/msg': 'Nobody got it. New board!' });
      }
      const [winner, t] = cand.sort((a, b) => a[1] - b[1])[0];
      const patch = {
        [`run/rounds/${r}/solve/${winner}`]: t,
        [`run/statusText/${winner}`]: 'SAFE',
        'run/msg': `${name(winner)} got it. Safe!`,
      };
      if (s.board === 1) patch[`run/rounds/${r}/first`] = winner;
      const rest = s.pool.filter((id) => id !== winner);
      if (rest.length > 1) return write({ ...patch, ...next({ kind: 'raceNext', game: s.game, variant: s.variant, pool: rest, board: s.board + 1, until: now + REF.nextBoardMs }) });
      return write({ ...patch, ...outPatch(rest[0]) });
    }

    function outPatch(id) {
      return {
        ...next({ kind: 'out', who: id, until: now + REF.outMs }),
        [`run/players/${id}/alive`]: false,
        [`run/players/${id}/place`]: alive().length,
        [`run/statusText/${id}`]: 'OUT',
        'run/current': null,
        'run/msg': `${name(id)} has to leave the table.`,
      };
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
