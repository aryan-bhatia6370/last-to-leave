// Online rooms: #/online (create / join) and #/room/:code (lobby, then the game).
// Account required. The host's browser runs the referee (referee.js); every
// browser draws the room from the database, plays its own turns, and watches
// other players' turns live.

import { onAccount } from '../core/account.js';
import { DEBUG, escapeHtml, ensureFonts } from '../core/env.js';
import { CHARACTERS, competitionGames, isRaceGame, maxScoreFor } from '../competition/engine.js';
import { ONLINE, isCode, createRoom, roomExists, joinRoom, claimChar, setMeta, subscribeRoom, effectiveHost } from './room.js';
import { buildRun, startReferee } from './referee.js';
import { rtdb } from './net.js';
import { createReceiver, startPublisher } from './mirror.js';
import { runPerformance } from './performance.js';
import { scores } from '../core/scores.js';
import { recordOnlineRun } from '../core/leaderboard.js';

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function whenAccountReady() {
  return new Promise((resolve) => {
    const off = onAccount((s) => { if (s.ready) { queueMicrotask(() => off()); resolve(s); } });
  });
}

function needSignIn(outlet) {
  outlet.innerHTML = `
    <main class="page"><nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a></nav>
      <section class="board account-board"><h1>Play online</h1>
        <p class="sub">Online rooms need an account so everyone knows who's at the table.</p>
        <a class="btn btn-primary btn-big" href="#/account">Sign in with Google</a></section></main>`;
}

// ---------- #/online ----------
export async function renderOnline(outlet) {
  const s = await whenAccountReady();
  if (!s.enabled || !s.user || !s.profile) return needSignIn(outlet);
  outlet.innerHTML = `
    <main class="page">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a><a class="btn btn-small" href="#/leaderboards">Leaderboards</a></nav>
      <section class="board account-board online-home">
        <h1>Play online</h1>
        <p class="sub">Host a table and send your friends the code, or join theirs. Everyone plays their turn while the others watch live.</p>
        <button class="btn btn-primary btn-big" data-create>Host a room</button>
        <form class="join-form" data-join>
          <label class="field"><span>Have a code?</span>
            <input data-code maxlength="${ONLINE.codeLength}" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCDE"></label>
          <button class="btn btn-big" type="submit">Join</button>
        </form>
        <p class="hint bad" data-err></p>
      </section>
    </main>`;
  const err = outlet.querySelector('[data-err]');
  outlet.querySelector('[data-create]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { location.hash = `#/room/${await createRoom(s.user.uid)}`; } catch (x) { err.textContent = x.message; e.target.disabled = false; }
  });
  outlet.querySelector('[data-join]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = outlet.querySelector('[data-code]').value.trim().toUpperCase();
    if (!isCode(code)) { err.textContent = `Room codes are ${ONLINE.codeLength} letters/numbers.`; return; }
    if (!(await roomExists(code))) { err.textContent = 'No room with that code.'; return; }
    location.hash = `#/room/${code}`;
  });
}

// ---------- #/room/:code ----------
export async function renderRoom(outlet, { code: raw }, { isCurrent }) {
  const code = (raw || '').toUpperCase();
  const s = await whenAccountReady();
  if (!s.enabled || !s.user || !s.profile) return needSignIn(outlet);
  await ensureFonts();
  if (!isCode(code) || !(await roomExists(code))) {
    outlet.innerHTML = `<main class="page"><nav class="topbar"><a class="btn btn-small" href="#/online">← Back</a></nav>
      <section class="board account-board"><h1>Room not found</h1><p class="sub">Check the code and try again.</p></section></main>`;
    return;
  }
  if (!isCurrent()) return;
  const me = { uid: s.user.uid, username: s.profile.username };
  const seat = await joinRoom(code, me);
  let room = {};
  let lobby = null;
  let view = null;
  let referee = null;
  let dead = false;

  const unsub = await subscribeRoom(code, (r) => {
    if (dead) return;
    room = r;
    const status = r.meta?.status;
    // hosting (or taking over when the host is gone)
    const host = effectiveHost(r);
    if (host === me.uid && r.meta?.host !== me.uid) setMeta(code, { host: me.uid }).catch(() => {});
    if (r.meta?.host === me.uid && status === 'playing' && !referee) referee = startReferee(code, () => room);
    if (referee && (r.meta?.host !== me.uid || status !== 'playing')) { referee.stop(); referee = null; }
    referee?.poke();

    if (status === 'lobby') {
      if (!lobby) { view?.destroy(); view = null; lobby = new Lobby(outlet, code, me); }
      lobby.update(r);
    } else if (status === 'playing' || status === 'done') {
      if (!r.run) return;
      seat.lockSeat().catch(() => {});
      if (!view) { lobby = null; view = new RunView(outlet, code, me); }
      view.update(r);
    }
  });

  return () => {
    dead = true;
    unsub();
    referee?.stop();
    view?.destroy();
    seat.leave({ inLobby: room.meta?.status === 'lobby' }).catch(() => {});
  };
}

// ---------- lobby ----------
class Lobby {
  constructor(outlet, code, me) {
    this.code = code;
    this.me = me;
    const link = `${location.origin}${location.pathname}#/room/${code}`;
    const games = competitionGames();
    outlet.innerHTML = `
      <main class="page">
        <nav class="topbar"><a class="btn btn-small" href="#/online">← Leave room</a></nav>
        <section class="board setup comp-setup lobby">
          <p class="kicker">Room code</p>
          <div class="room-code"><span>${code}</span><button class="btn btn-small" data-copy>Copy invite link</button></div>
          <div class="setup-grid">
            <div>
              <h2>At the table</h2>
              <ol class="lobby-list" data-members></ol>
              <h2>Your seat</h2>
              <div class="char-grid" data-chars>
                ${CHARACTERS.map((c) => `<button class="char-card" data-char="${c.id}" style="--seat:${hex(c.shirt)}"><span class="swatch" aria-hidden="true"></span><strong>${escapeHtml(c.name)}</strong><small data-taken></small></button>`).join('')}
              </div>
            </div>
            <div>
              <div data-hostonly>
                <h2>Computer players</h2>
                <div class="stepper">
                  <button class="btn btn-small" data-cpu="-1" aria-label="Fewer computer players">−</button>
                  <span class="stepper-num" data-cpucount>0</span>
                  <button class="btn btn-small" data-cpu="1" aria-label="More computer players">+</button>
                </div>
                <h2 style="margin-top:22px">Game versions</h2>
                <div class="versions">
                  ${games.map((g) => {
                    const alts = g.variants.filter((v) => v.id !== 'regular');
                    return `<label class="version-row"><span>${escapeHtml(g.name)}</span>
                      ${alts.length ? `<select data-ver="${g.id}"><option value="random">Random (mostly normal)</option><option value="normal">Normal only</option>
                      ${alts.map((v) => `<option value="${v.id}">Only ${escapeHtml(v.label)}</option>`).join('')}</select>` : '<span class="muted">One version</span>'}</label>`;
                  }).join('')}
                </div>
              </div>
              <p class="muted" data-summary></p>
              <button class="btn btn-primary btn-big" data-start hidden>Start the game</button>
              <p class="hint" data-wait></p>
            </div>
          </div>
        </section>
      </main>`;
    this.$ = (q) => outlet.querySelector(q);
    this.$('[data-copy]').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(link); e.target.textContent = 'Copied!'; } catch { prompt('Invite link:', link); }
    });
    outlet.querySelectorAll('[data-char]').forEach((b) => b.addEventListener('click', async () => {
      const mine = this.room?.members?.[me.uid]?.char;
      if (!(await claimChar(code, me.uid, b.dataset.char, mine))) b.classList.add('shake');
    }));
    outlet.querySelectorAll('[data-cpu]').forEach((b) => b.addEventListener('click', () => {
      const cur = this.room?.meta?.cpus || 0;
      setMeta(code, { cpus: Math.max(0, Math.min(ONLINE.maxSeats - this.humans().length, cur + Number(b.dataset.cpu))) });
    }));
    outlet.querySelectorAll('[data-ver]').forEach((sel) => sel.addEventListener('change', () => setMeta(code, { [`versions/${sel.dataset.ver}`]: sel.value })));
    this.$('[data-start]').addEventListener('click', async (e) => {
      e.target.disabled = true;
      const { now, D, ref } = await rtdb();
      const run = buildRun(this.room, now());
      await D.update(ref(`rooms/${code}`), { run, 'meta/status': 'playing', 'meta/startedAt': now() });
    });
  }

  humans() {
    const r = this.room || {};
    return Object.entries(r.members || {}).filter(([uid, m]) => m.char && r.presence?.[uid]);
  }

  update(r) {
    this.room = r;
    const isHost = r.meta?.host === this.me.uid;
    const members = Object.entries(r.members || {}).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
    this.$('[data-members]').innerHTML = members.map(([uid, m]) => {
      const c = CHARACTERS.find((x) => x.id === m.char);
      const here = !!r.presence?.[uid];
      return `<li class="${here ? '' : 'away'}" style="--seat:${c ? hex(c.shirt) : '#555'}"><span class="dot"></span>
        <strong>${escapeHtml(m.username)}</strong>${uid === this.me.uid ? ' <em>you</em>' : ''}${uid === r.meta?.host ? ' <span class="tag">host</span>' : ''}
        <span class="muted">${c ? escapeHtml(c.name) : 'picking…'}${here ? '' : ' · offline'}</span></li>`;
    }).join('');
    const chars = r.chars || {};
    const mine = r.members?.[this.me.uid]?.char;
    document.querySelectorAll('[data-char]').forEach((b) => {
      const owner = chars[b.dataset.char];
      b.classList.toggle('selected', b.dataset.char === mine);
      b.disabled = !!owner && owner !== this.me.uid;
      b.querySelector('[data-taken]').textContent = owner && owner !== this.me.uid ? (r.members?.[owner]?.username || 'taken') : '';
    });
    const humans = this.humans().length;
    const cpus = Math.min(r.meta?.cpus || 0, ONLINE.maxSeats - humans);
    this.$('[data-hostonly]').classList.toggle('readonly', !isHost);
    this.$('[data-hostonly]').querySelectorAll('button, select').forEach((x) => { x.disabled = !isHost; });
    this.$('[data-cpucount]').textContent = cpus;
    document.querySelectorAll('[data-ver]').forEach((sel) => { const v = r.meta?.versions?.[sel.dataset.ver] || 'random'; if (sel.value !== v) sel.value = v; });
    const total = humans + cpus;
    this.$('[data-summary]').textContent = `${total} at the table: ${humans} player${humans === 1 ? '' : 's'}${cpus ? ` + ${cpus} computer${cpus === 1 ? '' : 's'}` : ''}.${humans >= ONLINE.minRealForBoards ? ' Counts for online leaderboards.' : ` Online leaderboards need ${ONLINE.minRealForBoards}+ players.`}`;
    const start = this.$('[data-start]');
    start.hidden = !isHost;
    start.disabled = total < 2 || !mine;
    this.$('[data-wait]').textContent = isHost
      ? (!mine ? 'Pick your seat first.' : total < 2 ? 'Need at least 2 at the table (add a computer or wait for a friend).' : 'Players without a seat will watch.')
      : (mine ? 'Waiting for the host to start…' : 'Pick a seat to play, or just watch.');
  }
}

// ---------- the game ----------
class RunView {
  constructor(outlet, code, me) {
    this.code = code;
    this.me = me;
    this.playing = null;     // the turn/race key I'm playing
    this.watching = null;    // { key, handle, off }
    this.submitted = new Set();
    this.finished = false;
    outlet.innerHTML = '';
    document.body.classList.add('playing');
    this.root = document.createElement('div');
    this.root.className = 'stage comp-stage';
    this.root.innerHTML = `
      <div class="stage-canvas" data-table></div>
      <aside class="comp-panel">
        <div class="comp-round" data-round></div>
        <h2 class="comp-game" data-game></h2>
        <p class="comp-variant" data-variant></p>
        <ol class="comp-players" data-players></ol>
        <p class="comp-msg" data-msg></p>
        <div class="btn-row" data-actions></div>
        <p class="room-tag">Room ${code}</p>
      </aside>
      <a class="btn btn-small comp-quit" href="#/online">Leave</a>
      <div class="overlay" hidden></div>`;
    outlet.appendChild(this.root);
    this.$ = (q) => this.root.querySelector(q);
    this.ready = import('../competition/tableScene.js').then(({ createTableScene }) => {
      this.table = createTableScene(this.$('[data-table]'));
    });
  }

  myId(run) { return Object.values(run.players || {}).find((p) => p.uid === this.me.uid && !p.left)?.id || null; }

  async update(room) {
    await this.ready;
    if (!this.table) return;
    const run = room.run;
    const P = run.players || {};
    const myId = this.myId(run);
    // players at the table
    const sig = Object.keys(P).sort().join();
    if (sig !== this.sig) {
      this.sig = sig;
      this.table.setPlayers(Object.values(P).map((p) => ({ id: p.id, name: p.cpu ? p.name : `${p.name} · ${p.username}`, shirt: p.shirt, seat: p.seat, human: p.id === myId })));
      for (const p of Object.values(P)) if (!p.alive && p.place) this.table.eliminate(p.id); // joined late: already gone
    }
    this.$('[data-round]').textContent = run.label?.round || '';
    this.$('[data-game]').textContent = run.label?.game || '';
    this.$('[data-variant]').textContent = run.label?.variant || '';
    this.$('[data-msg]').textContent = run.msg || '';
    const status = run.statusText || {};
    this.$('[data-players]').innerHTML = Object.values(P).sort((a, b) => a.seat - b.seat).map((p) => {
      const st = !p.alive ? 'OUT' : (status[p.id] ?? '');
      const cls = [!p.alive ? 'out' : '', p.id === run.current ? 'current' : '', p.id === myId ? 'you' : ''].join(' ');
      const who = p.cpu ? (p.left ? 'computer (left)' : 'computer') : escapeHtml(p.username);
      return `<li class="${cls}" style="--seat:${hex(p.shirt)}"><span class="dot"></span><span class="pname">${escapeHtml(p.name)} <em>${p.id === myId ? 'you' : who}</em></span><span class="pstat">${escapeHtml(st)}</span></li>`;
    }).join('');
    for (const p of Object.values(P)) this.table.setStatus(p.id, !p.alive ? 'OUT' : (status[p.id] ?? ''), p.id === run.current);

    const s = run.step;
    if (s.kind === 'out' && this.outFor !== s.id) { this.outFor = s.id; this.table.eliminate(s.who); }
    this.handleStep(room, run, s, myId);
  }

  handleStep(room, run, s, myId) {
    const P = run.players;
    const actions = this.$('[data-actions]');
    // stop watching when that turn is over
    if (this.watching && !(s.kind === 'turn' && s.turnKey + ':' + s.idx === this.watching.key && (s.results || {})[s.order[s.idx]] == null)) this.stopWatching();

    if (s.kind === 'turn') {
      const cur = s.order[s.idx];
      const done = (s.results || {})[cur] != null;
      const key = `${s.turnKey}:${s.idx}`;
      if (!done && cur === myId) {
        if (this.playing !== key && !this.submitted.has(key)) {
          if (!actions.querySelector('[data-go]')) {
            actions.innerHTML = '<button class="btn btn-primary" data-go>Play your turn</button>';
            actions.querySelector('[data-go]').addEventListener('click', () => { actions.innerHTML = ''; this.playMyTurn(run, s, key); }, { once: true });
          }
        }
        return;
      }
      actions.innerHTML = '';
      if (!done && P[cur] && !P[cur].cpu && !this.watching && this.declined !== key) this.watch(run, s, key);
      return;
    }
    if (s.kind === 'race') {
      actions.innerHTML = '';
      if (myId && s.pool.includes(myId) && this.playing !== s.raceKey && !this.submitted.has(s.raceKey) && !(room.race?.[s.raceKey]?.[this.me.uid])) {
        this.playRace(run, s);
      }
      return;
    }
    actions.innerHTML = '';
    if (s.kind === 'done' && !this.finished) { this.finished = true; this.showResults(run, myId); }
  }

  async playMyTurn(run, s, key) {
    this.playing = key;
    const { D, ref } = await rtdb();
    const liveRef = ref(`rooms/${this.code}/live/${s.turnKey}`);
    let stopPub = null;
    this.table.pause();
    const { playTurn } = await import('../competition/playTurn.js');
    const result = await playTurn(document.body, {
      gameId: s.game, variant: s.variant, seed: s.seed, online: true,
      banner: `${run.label?.round || ''}: ${run.label?.game || ''}`,
      onInstance: (inst) => { stopPub = startPublisher(() => inst.state?.(), (f) => D.set(liveRef, f).catch(() => {})); },
    });
    stopPub?.();
    this.table.resume();
    this.submitted.add(key);
    this.playing = null;
    await D.set(ref(`rooms/${this.code}/results/${s.turnKey}/${this.me.uid}`), { score: result.score, at: D.serverTimestamp() });
    D.remove(liveRef).catch(() => {});
  }

  async watch(run, s, key) {
    const cur = run.players[s.order[s.idx]];
    const { D, ref } = await rtdb();
    const receiver = createReceiver();
    const { watchTurn } = await import('../competition/playTurn.js');
    if (this.watching) return;
    this.watching = { key, handle: null, off: null };
    this.watching.off = D.onValue(ref(`rooms/${this.code}/live/${s.turnKey}`), (snap) => receiver.push(snap.val()));
    this.table.pause();
    const handle = await watchTurn(document.body, {
      gameId: s.game, variant: s.variant, seed: s.seed, receiver,
      banner: `Watching ${cur.name} (${cur.username}): ${run.label?.game || ''}`,
      onBack: () => { this.declined = key; this.stopWatching(); },
    });
    if (!this.watching || this.watching.key !== key) { handle.destroy(); return; }
    this.watching.handle = handle;
  }

  stopWatching() {
    const w = this.watching;
    this.watching = null;
    if (!w) return;
    w.off?.();
    w.handle?.destroy();
    this.table.resume();
  }

  async playRace(run, s) {
    this.playing = s.raceKey;
    const { D, ref, now } = await rtdb();
    // everyone's board goes up at the same moment
    const wait = s.startAt - now() - 1900; // the countdown takes ~1.9 s
    if (wait > 0) {
      this.$('[data-msg]').textContent = `Board ${s.board} goes up in a moment. Get ready!`;
      await new Promise((r) => setTimeout(r, wait));
    }
    const P = run.players;
    const racers = s.pool.filter((id) => id !== this.myId(run)).map((id) => ({ id, name: P[id].name, at: s.cpuTimes?.[id] ?? 1e9 }));
    // other real players: when one of them solves, their time is filled in and the board ends
    const off = D.onValue(ref(`rooms/${this.code}/race/${s.raceKey}`), (snap) => {
      for (const [uid, rep] of Object.entries(snap.val() || {})) {
        const p = Object.values(P).find((x) => x.uid === uid);
        const r = p && racers.find((x) => x.id === p.id);
        if (r && rep.solved) r.at = rep.t;
      }
    });
    this.table.pause();
    const { playTurn } = await import('../competition/playTurn.js');
    const result = await playTurn(document.body, {
      gameId: s.game, variant: s.variant, seed: s.seed, online: true,
      extra: { compete: { racers } }, banner: `Race · board ${s.board}`,
    });
    off();
    this.table.resume();
    this.submitted.add(s.raceKey);
    this.playing = null;
    const solved = result.stats?.winner === 'you';
    await D.set(ref(`rooms/${this.code}/race/${s.raceKey}/${this.me.uid}`), solved ? { solved: true, t: result.stats.raceSeconds } : { solved: false });
  }

  async showResults(run, myId) {
    const P = run.players;
    const me = myId ? P[myId] : null;
    const total = run.total;
    const winner = Object.values(P).find((p) => p.place === 1);
    // my rounds, for the performance score and minigame wins
    const rounds = Object.values(run.rounds || {}).filter(Boolean);
    let perf = null;
    let topRounds = 0;
    if (me) {
      const mine = rounds.filter((r) => (r.players || []).includes(myId) && (r.kind === 'race' || r.scores));
      perf = runPerformance(mine.map((r) => (r.kind === 'race'
        ? { kind: 'race', game: r.game, t: r.solve?.[myId] ?? null }
        : { kind: 'scored', game: r.game, variant: r.variant, score: r.scores[myId] ?? 0 })));
      topRounds = mine.filter((r) => (r.kind === 'race' ? r.first === myId : r.scores[myId] >= Math.max(...Object.values(r.scores)))).length;
      // save it (once per room) to records + online leaderboards
      const key = `ltl.online.saved.${this.code}.${run.seed}`;
      let saved = false;
      try { saved = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      if (!saved && !me.left && !DEBUG) { // debug test runs aren't saved
        const won = me.place === 1;
        scores.submit({
          gameId: 'competition', variant: `${total}p`, score: total - me.place, maxScore: total - 1, passed: won,
          durationMs: 0, stats: { place: me.place, players: total, online: true, real: run.realCount, performance: perf }, seed: run.seed,
        });
        if (run.realCount >= ONLINE.minRealForBoards) recordOnlineRun({ won, roundWins: topRounds, performance: perf });
      }
    }
    const overlay = this.$('.overlay');
    overlay.hidden = false;
    const order = Object.values(P).sort((a, b) => (a.place || 99) - (b.place || 99));
    overlay.innerHTML = `
      <div class="board panel">
        <p class="kicker">Online · ${total} players · room ${this.code}</p>
        <h2 class="verdict ${me?.place === 1 ? 'pass' : 'fail'}">${me?.place === 1 ? 'You are the Last to Leave!' : `${escapeHtml(winner?.name || '')}${winner && !winner.cpu ? ` (${escapeHtml(winner.username)})` : ''} won it.`}</h2>
        ${me ? `<div class="big-score">${ordinal(me.place)}<small> / ${total}</small></div>
          <p class="muted">Performance <strong>${perf.toFixed(1)}</strong> / 100 · top score in ${topRounds} round${topRounds === 1 ? '' : 's'}${run.realCount >= ONLINE.minRealForBoards ? '' : ' · leaderboards need 3+ players'}</p>` : '<p class="muted">You watched this one.</p>'}
        <ol class="final-order">${order.map((p) => `<li${p.id === myId ? ' class="you"' : ''}>${escapeHtml(p.name)} <span class="muted">${p.cpu ? 'computer' : escapeHtml(p.username)}</span></li>`).join('')}</ol>
        <div class="btn-row"><a class="btn btn-primary" href="#/online">New room</a><a class="btn" href="#/leaderboards">Leaderboards</a><a class="btn" href="#/">Menu</a></div>
      </div>`;
  }

  destroy() {
    this.stopWatching();
    this.table?.destroy();
    this.root?.remove();
    document.body.classList.remove('playing');
  }
}
