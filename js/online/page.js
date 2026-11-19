// Online rooms: #/online (create / join) and #/room/:code (lobby, then the game).
// Account required. The host's browser runs the referee (referee.js); every
// browser draws the room from the database, plays its own turns, and watches
// other players' turns live.

import { onAccount } from '../core/account.js';
import { DEBUG, escapeHtml, ensureFonts } from '../core/env.js';
import { CHARACTERS, competitionGames, isRaceGame, maxScoreFor } from '../competition/engine.js';
import { ONLINE, boardsFor, isCode, createRoom, roomExists, joinRoom, claimChar, setMeta, setReady, sendRequest, subscribeRoom, effectiveHost } from './room.js';
import { buildRun, startReferee } from './referee.js';
import { MODE_INFO } from '../competition/page.js';
import { rtdb } from './net.js';
import { createReceiver, startPublisher } from './mirror.js';
import { runPerformance } from './performance.js';
import { scores } from '../core/scores.js';
import { recordOnlineRun, recordBotMajorityRun } from '../core/leaderboard.js';

const PER_PLAYER_ORDER = ['marker-catching'];
const mixSeed = (seed, uid) => { let h = seed >>> 0; for (const ch of uid) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0; return h; };
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
    setReady(code, me.uid, false).catch(() => {}); // a new game: everyone presses Ready again
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
                <h2 style="margin-top:22px">How to win</h2>
                <div class="seg mode-seg" data-modes>
                  <button type="button" data-mode="elimination">Elimination</button>
                  <button type="button" data-mode="points">Points (5 rounds)</button>
                </div>
                <p class="muted small" data-modeinfo></p>
                <h2 style="margin-top:22px">Games &amp; versions</h2>
                <p class="muted small">Untick a game to leave it out of the pool.</p>
                <div class="versions">
                  ${games.map((g) => {
                    const alts = g.variants.filter((v) => v.id !== 'regular');
                    return `<div class="version-row"><label class="pool-pick"><input type="checkbox" data-pool="${g.id}" checked><span>${escapeHtml(g.name)}</span></label>
                      ${alts.length ? `<select data-ver="${g.id}"><option value="random">Random (mostly normal)</option><option value="normal">Normal only</option>
                      ${alts.map((v) => `<option value="${v.id}">Only ${escapeHtml(v.label)}</option>`).join('')}</select>` : '<span class="muted">One version</span>'}</div>`;
                  }).join('')}
                </div>
              </div>
              <p class="muted" data-summary></p>
              <button class="btn btn-primary btn-big" data-start hidden>Start the game</button>
              <button class="btn btn-primary btn-big" data-ready hidden>Ready</button>
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
    outlet.querySelectorAll('[data-pool]').forEach((cb) => cb.addEventListener('change', () => setMeta(code, { [`off/${cb.dataset.pool}`]: !cb.checked })));
    outlet.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMeta(code, { mode: b.dataset.mode })));
    this.$('[data-ready]').addEventListener('click', () => {
      const m = this.room?.members?.[me.uid];
      if (m?.char) setReady(code, me.uid, !m.ready);
    });
    this.$('[data-start]').addEventListener('click', async (e) => {
      // only the host, and only once everyone has a seat and is Ready
      if (this.room?.meta?.host !== me.uid || !this.allReady() || e.target.disabled) return;
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

  /** Everyone here (except the host) has a seat and pressed Ready. */
  allReady() {
    const r = this.room || {};
    return Object.entries(r.members || {}).filter(([uid]) => r.presence?.[uid]).every(([uid, m]) => m.char && (uid === r.meta?.host || m.ready));
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
        <span class="muted">${c ? escapeHtml(c.name) : 'picking…'}${here ? '' : ' · offline'}</span>${uid === r.meta?.host ? '' : `<span class="ready-tag ${m.ready ? 'on' : ''}">${m.ready ? 'Ready' : 'Not ready'}</span>`}</li>`;
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
    this.$('[data-hostonly]').querySelectorAll('button, select, input').forEach((x) => { x.disabled = !isHost; });
    this.$('[data-cpucount]').textContent = cpus;
    document.querySelectorAll('[data-ver]').forEach((sel) => { const v = r.meta?.versions?.[sel.dataset.ver] || 'random'; if (sel.value !== v) sel.value = v; });
    document.querySelectorAll('[data-pool]').forEach((cb) => { cb.checked = !r.meta?.off?.[cb.dataset.pool]; });
    const mode = r.meta?.mode || 'elimination';
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
    this.$('[data-modeinfo]').textContent = MODE_INFO[mode] || '';
    const total = humans + cpus;
    this.$('[data-summary]').textContent = `${total} at the table: ${humans} player${humans === 1 ? '' : 's'}${cpus ? ` + ${cpus} computer${cpus === 1 ? '' : 's'}` : ''}.${{ online: ' Counts for the online leaderboards.', offline: ' More computers than players: counts for the computer (offline) leaderboards.' }[boardsFor(humans, total)] || ' Leaderboards need 3+ at the table.'}`;
    const start = this.$('[data-start]');
    const ready = this.$('[data-ready]');
    const meReady = !!r.members?.[this.me.uid]?.ready;
    const everyone = this.allReady();
    start.hidden = !isHost;
    start.disabled = total < 2 || !mine || !everyone;
    ready.hidden = isHost;
    ready.disabled = !mine;
    ready.textContent = meReady ? 'Ready ✓ (tap to undo)' : 'Ready';
    ready.classList.toggle('btn-primary', !meReady);
    this.$('[data-wait]').textContent = isHost
      ? (!mine ? 'Pick your seat first.' : !everyone ? 'Waiting for everyone to pick a seat and press Ready…' : total < 2 ? 'Need at least 2 at the table (add a computer or wait for a friend).' : 'Everyone is ready!')
      : (!mine ? 'Pick a seat, then press Ready.' : meReady ? 'Waiting for the host to start…' : 'Press Ready when you are.');
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
        <div class="btn-row" data-skip></div>
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
    this.room = room;
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
      this.gone = new Set();
    }
    // anyone out stands up and walks away (also covers joining late and "skip to results")
    for (const p of Object.values(P)) {
      if (p.alive || this.gone.has(p.id)) continue;
      this.gone.add(p.id);
      const s = run.step || {};
      this.table.eliminate(p.id, { yank: s.kind === 'out' && s.who === p.id && !!s.yank });
    }
    this.$('[data-round]').textContent = run.label?.round || '';
    this.$('[data-game]').textContent = run.label?.game || '';
    this.$('[data-variant]').textContent = run.label?.variant || '';
    this.$('[data-msg]').textContent = run.msg || '';
    const status = run.statusText || {};
    this.$('[data-players]').innerHTML = Object.values(P).sort((a, b) => a.seat - b.seat).map((p) => {
      const st = !p.alive ? 'OUT' : (status[p.id] ?? (run.mode === 'points' ? `${run.points?.[p.id] || 0} pts` : ''));
      const cls = [!p.alive ? 'out' : '', p.id === run.current ? 'current' : '', p.id === myId ? 'you' : ''].join(' ');
      const who = p.cpu ? (p.left ? 'computer (left)' : 'computer') : escapeHtml(p.username);
      return `<li class="${cls}" style="--seat:${hex(p.shirt)}"><span class="dot"></span><span class="pname">${escapeHtml(p.name)} <em>${p.id === myId ? 'you' : who}</em></span><span class="pstat">${escapeHtml(st)}</span></li>`;
    }).join('');
    for (const p of Object.values(P)) this.table.setStatus(p.id, !p.alive ? 'OUT' : (status[p.id] ?? (run.mode === 'points' ? `${run.points?.[p.id] || 0} pts` : '')), p.id === run.current);

    const s = run.step;
    this.handleStep(room, run, s, myId);
  }

  /** All real players are out and computers are still going: speed it up or skip to the end. */
  offerSkip(room, run, s) {
    const box = this.$('[data-skip]');
    const humansIn = Object.values(run.players).some((p) => p.alive && !p.cpu);
    const show = !humansIn && s.kind !== 'done' && Object.values(run.players).some((p) => p.alive && p.cpu);
    if (!show) { box.innerHTML = ''; return; }
    if (box.childElementCount) { box.querySelector('[data-fast]').disabled = !!run.fast; return; }
    box.innerHTML = '<button class="btn btn-small" data-fast>Speed up</button><button class="btn btn-small" data-skipto>Skip to results</button>';
    box.querySelector('[data-fast]').disabled = !!run.fast;
    box.querySelector('[data-fast]').addEventListener('click', () => sendRequest(this.code, this.me.uid, 'fast'));
    box.querySelector('[data-skipto]').addEventListener('click', () => sendRequest(this.code, this.me.uid, 'skip'));
  }

  handleStep(room, run, s, myId) {
    const P = run.players;
    const actions = this.$('[data-actions]');
    this.offerSkip(room, run, s);
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
      if (!actions.querySelector('[data-rewatch]')) actions.innerHTML = '';
      if (!done && P[cur] && !P[cur].cpu && !this.watching && this.declined !== key) this.watch(run, s, key);
      // went back to the table? you can always go back to watching
      if (!done && P[cur] && !P[cur].cpu && this.declined === key && !this.watching && !actions.querySelector("[data-rewatch]")) {
        actions.innerHTML = `<button class="btn btn-primary" data-rewatch>Watch ${escapeHtml(P[cur].name)} live</button>`;
        actions.querySelector('[data-rewatch]').addEventListener('click', () => { this.declined = null; actions.innerHTML = ''; this.watch(run, s, key); }, { once: true });
      }
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
    // Marker Catching: same set of throws for everyone, but your own order and spots.
    // Every other game: exactly the same layout for everyone.
    const own = PER_PLAYER_ORDER.includes(s.game);
    const result = await playTurn(document.body, {
      gameId: s.game, variant: s.variant, seed: own ? mixSeed(s.seed, this.me.uid) : s.seed, online: true,
      extra: own ? { shareSeed: s.seed } : {},
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
    const racers = s.pool.filter((id) => id !== this.myId(run)).map((id) => ({ id, name: P[id].name, at: s.cpuTimes?.[id] ?? 1e9, wrongs: s.cpuWrongs?.[id] || [] }));
    // other real players: when one of them solves, their time is filled in and the board ends
    const off = D.onValue(ref(`rooms/${this.code}/race/${s.raceKey}`), (snap) => {
      for (const [uid, rep] of Object.entries(snap.val() || {})) {
        const p = Object.values(P).find((x) => x.uid === uid);
        const r = p && racers.find((x) => x.id === p.id);
        if (r && rep.solved) r.at = 0; // someone else got it: end your board right away
      }
    });
    // other real players' wrong guesses: show their 5 s wait
    const seenWrong = {};
    const offWrong = D.onValue(ref(`rooms/${this.code}/racewrong/${s.raceKey}`), (snap) => {
      for (const [uid, n] of Object.entries(snap.val() || {})) {
        if (uid === this.me.uid || seenWrong[uid] === n) continue;
        seenWrong[uid] = n;
        const p = Object.values(P).find((x) => x.uid === uid);
        const r = p && racers.find((x) => x.id === p.id);
        if (r) r.lockUntilMs = performance.now() + 5000;
      }
    });
    // safety: if the referee has already moved past this board (it decided without us), end it now
    const offStep = D.onValue(ref(`rooms/${this.code}/run/step`), (snap) => {
      if (snap.val()?.raceKey !== s.raceKey) for (const r of racers) r.at = 0;
    });
    let myWrongs = 0;
    this.table.pause();
    const { playTurn } = await import('../competition/playTurn.js');
    const result = await playTurn(document.body, {
      gameId: s.game, variant: s.variant, seed: s.seed, online: true,
      extra: { compete: { racers, onWrong: () => D.set(ref(`rooms/${this.code}/racewrong/${s.raceKey}/${this.me.uid}`), ++myWrongs).catch(() => {}) } }, banner: `Race · board ${s.board}`,
    });
    off();
    offWrong();
    offStep();
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
      perf = runPerformance(run, myId);
      topRounds = mine.filter((r) => (r.kind === 'race' ? r.first === myId : r.scores[myId] >= Math.max(...Object.values(r.scores)))).length;
      // save it (once per room) to records + online leaderboards
      const key = `ltl.online.saved.${this.code}.${run.seed}`;
      let saved = false;
      try { saved = !!sessionStorage.getItem(key); sessionStorage.setItem(key, '1'); } catch { /* ignore */ }
      if (!saved && !me.left && !DEBUG) { // debug test runs aren't saved
        const won = me.place === 1;
        const pts = run.mode === 'points';
        scores.submit({
          gameId: 'competition', variant: pts ? `${total}p-points` : `${total}p`,
          score: pts ? (run.points?.[myId] || 0) : total - me.place, maxScore: pts ? 15 : total - 1, passed: won,
          durationMs: 0, stats: { place: me.place, players: total, online: true, real: run.realCount, performance: perf }, seed: run.seed,
        });
        const kind = boardsFor(run.realCount, total);
        if (kind === 'online') recordOnlineRun({ won, roundWins: topRounds, performance: perf });
        else if (kind === 'offline') recordBotMajorityRun({ won, roundWins: topRounds });
      }
    }
    const overlay = this.$('.overlay');
    overlay.hidden = false;
    const order = Object.values(P).sort((a, b) => (a.place || 99) - (b.place || 99));
    overlay.innerHTML = `
      <div class="board panel">
        <p class="kicker">Online · ${total} players${run.mode === 'points' ? ' · Points' : ''} · room ${this.code}</p>
        <h2 class="verdict ${me?.place === 1 ? 'pass' : 'fail'}">${me?.place === 1 ? 'You are the Last to Leave!' : `${escapeHtml(winner?.name || '')}${winner && !winner.cpu ? ` (${escapeHtml(winner.username)})` : ''} won it.`}</h2>
        ${me ? `<div class="big-score">${ordinal(me.place)}<small> / ${total}</small></div>
          <p class="muted">Performance <strong>${perf.toFixed(1)}</strong> / 100 · top score in ${topRounds} round${topRounds === 1 ? '' : 's'}${{ online: ' · online leaderboards', offline: ' · counts as a computer game' }[boardsFor(run.realCount, total)] || ' · leaderboards need 3+ at the table'}</p>` : '<p class="muted">You watched this one.</p>'}
        <ol class="final-order">${order.map((p) => `<li${p.id === myId ? ' class="you"' : ''}>${escapeHtml(p.name)} <span class="muted">${p.uid ? escapeHtml(p.username) : 'computer'}</span>${run.mode === 'points' ? `<span class="perf">${run.points?.[p.id] || 0} pts</span>` : ''}${p.uid ? `<span class="perf" title="Performance">${runPerformance(run, p.id).toFixed(1)}</span>` : ''}</li>`).join('')}</ol>
        <p class="muted small-note">Numbers are each player's performance out of 100: how well they played each round against the table and for the game, plus where they finished.</p>
        <div class="btn-row">
          ${this.isHost() ? '<button class="btn btn-primary" data-relobby>Back to lobby (same code)</button>' : '<span class="muted">The host can take everyone back to the lobby.</span>'}
          <a class="btn" href="#/online">New room</a><a class="btn" href="#/leaderboards">Leaderboards</a><a class="btn" href="#/">Menu</a>
        </div>
      </div>`;
    overlay.querySelector('[data-relobby]')?.addEventListener('click', (e) => { e.target.disabled = true; this.backToLobby(); });
  }

  isHost() { return this.room?.meta?.host === this.me.uid; }

  /** Host: everyone back to the lobby with the same code (seats kept, everyone re-readies). */
  async backToLobby() {
    const { D, ref } = await rtdb();
    await D.update(ref(`rooms/${this.code}`), {
      'meta/status': 'lobby', run: null, results: null, race: null, racewrong: null, live: null, requests: null,
    });
  }

  destroy() {
    this.stopWatching();
    this.table?.destroy();
    this.root?.remove();
    document.body.classList.remove('playing');
  }
}
