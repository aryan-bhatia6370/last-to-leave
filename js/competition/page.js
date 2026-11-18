// Competition Mode (#/compete): solo vs 1–7 computer players at the table.
// Setup screen -> the run (rounds, turns, ties, races, eliminations, final).

import {
  CHARACTERS, competitionGames, chooseGame, chooseVariant, isRaceGame,
  simulateScore, simulateSolveTime, randomSkill, lowestScorers, maxScoreFor,
} from './engine.js';
import { playTurn } from './playTurn.js';
import { createRng, newSeed } from '../core/rng.js';
import { DEBUG, escapeHtml, ensureFonts } from '../core/env.js';
import { scores } from '../core/scores.js';

const SETTINGS_KEY = 'ltl.compete.v1';
const ABORT = Symbol('abort');
// spread players around the table: one per bench first, then fill in
const SEAT_ORDER = [0, 2, 4, 6, 1, 3, 5, 7];

function loadSettings() {
  try { return { character: 'aryan', cpus: 3, versions: {}, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; }
  catch { return { character: 'aryan', cpus: 3, versions: {} }; }
}
function saveSettings(s) { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ } }
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

export async function renderCompete(outlet) {
  await ensureFonts();
  let run = null;
  const settings = loadSettings();
  renderSetup();
  return () => { run?.destroy(); document.body.classList.remove('playing'); };

  function renderSetup() {
    const games = competitionGames();
    outlet.innerHTML = `
      <main class="page">
        <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a><a class="btn btn-small btn-ghost" href="#/records">Records</a></nav>
        <section class="board setup comp-setup" style="--c: var(--m-purple)">
          <h1 class="game-title">Competition Mode</h1>
          <p class="tagline">Take a seat at the table. Paul runs a game each round, everyone plays one by one, and the lowest score has to leave. Be the last one sitting.</p>
          <h2>Your seat</h2>
          <div class="char-grid">
            ${CHARACTERS.map((c) => `
              <button class="char-card ${c.id === settings.character ? 'selected' : ''}" data-char="${c.id}" style="--seat:${hex(c.shirt)}">
                <span class="swatch" aria-hidden="true"></span><strong>${escapeHtml(c.name)}</strong>
              </button>`).join('')}
          </div>
          <div class="setup-grid">
            <div>
              <h2>Computer players</h2>
              <div class="stepper">
                <button class="btn btn-small" data-cpu="-1" aria-label="Fewer computer players">−</button>
                <span class="stepper-num" data-cpucount>${settings.cpus}</span>
                <button class="btn btn-small" data-cpu="1" aria-label="More computer players">+</button>
              </div>
              <p class="muted" data-tablesize></p>
              <h2 style="margin-top:22px">How it works</h2>
              <ul class="howto">
                <li>Round 1 is always <strong>Marker Catching</strong>. After that Paul picks the game.</li>
                <li>Everyone plays one at a time. <strong>Lowest score leaves the table.</strong> Ties replay.</li>
                <li><strong>Pictionary / Equations</strong> are races: first to get it is safe, until one is left.</li>
                <li>The last two play a final. The winner is the <strong>Last to Leave</strong>.</li>
              </ul>
            </div>
            <div>
              <h2>Game versions</h2>
              <div class="versions">
                ${games.map((g) => {
                  const alts = g.variants.filter((v) => v.id !== 'regular');
                  const cur = settings.versions[g.id] || 'random';
                  return `<label class="version-row"><span>${escapeHtml(g.name)}</span>
                    ${alts.length ? `<select data-ver="${g.id}">
                      <option value="random" ${cur === 'random' ? 'selected' : ''}>Random (mostly normal)</option>
                      <option value="normal" ${cur === 'normal' ? 'selected' : ''}>Normal only</option>
                      ${alts.map((v) => `<option value="${v.id}" ${cur === v.id ? 'selected' : ''}>Only ${escapeHtml(v.label)}</option>`).join('')}
                    </select>` : '<span class="muted">One version</span>'}
                  </label>`;
                }).join('')}
              </div>
              <button class="btn btn-primary btn-big" data-start>Take your seat</button>
            </div>
          </div>
        </section>
      </main>`;

    const sizeLine = () => {
      outlet.querySelector('[data-cpucount]').textContent = settings.cpus;
      outlet.querySelector('[data-tablesize]').textContent = `${settings.cpus + 1} at the table (you + ${settings.cpus} computer${settings.cpus === 1 ? '' : 's'})`;
    };
    sizeLine();
    outlet.querySelectorAll('[data-char]').forEach((b) => b.addEventListener('click', () => {
      settings.character = b.dataset.char;
      outlet.querySelectorAll('[data-char]').forEach((x) => x.classList.toggle('selected', x === b));
      saveSettings(settings);
    }));
    outlet.querySelectorAll('[data-cpu]').forEach((b) => b.addEventListener('click', () => {
      settings.cpus = Math.max(1, Math.min(7, settings.cpus + Number(b.dataset.cpu)));
      sizeLine();
      saveSettings(settings);
    }));
    outlet.querySelectorAll('[data-ver]').forEach((sel) => sel.addEventListener('change', () => {
      settings.versions[sel.dataset.ver] = sel.value;
      saveSettings(settings);
    }));
    outlet.querySelector('[data-start]').addEventListener('click', start);
  }

  async function start() {
    saveSettings(settings);
    const { createTableScene } = await import('./tableScene.js');
    run = new Run(outlet, settings, createTableScene, {
      onExit: () => { run?.destroy(); run = null; renderSetup(); },
      onAgain: () => { run?.destroy(); run = null; start(); },
    });
  }
}

class Run {
  constructor(outlet, settings, createTableScene, { onExit, onAgain }) {
    this.settings = settings;
    this.onExit = onExit;
    this.onAgain = onAgain;
    this.rng = createRng(newSeed());
    this.dead = false;
    this.fast = false;
    this.timers = [];
    this.startedAt = performance.now();
    this.autoHuman = DEBUG && !!window.__competeAutoHuman; // tests: simulate your turns too

    // players: you + random other characters as computers
    const me = CHARACTERS.find((c) => c.id === settings.character) || CHARACTERS[0];
    const others = this.rng.shuffle(CHARACTERS.filter((c) => c.id !== me.id)).slice(0, settings.cpus);
    this.players = [me, ...others].map((c, i) => ({
      id: c.id, name: c.name, shirt: c.shirt, human: i === 0, skill: randomSkill(this.rng),
      seat: SEAT_ORDER[i], alive: true, place: null,
    }));
    this.total = this.players.length;

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
      </aside>
      <button class="btn btn-small comp-quit" data-quit>Quit</button>
      <div class="overlay" hidden></div>`;
    outlet.appendChild(this.root);
    this.$ = (sel) => this.root.querySelector(sel);
    this.$('[data-quit]').addEventListener('click', () => {
      if (confirm('Leave this game? It won\'t be saved.')) this.onExit();
    });
    this.table = createTableScene(this.$('[data-table]'));
    this.table.setPlayers(this.players);
    this.results = {};
    this.statusText = {};
    if (DEBUG) window.__competition = this;
    this.main().catch((e) => { if (e !== ABORT) console.error(e); });
  }

  // ---------- helpers ----------
  check() { if (this.dead) throw ABORT; }
  wait(ms) {
    return new Promise((resolve) => this.timers.push(setTimeout(resolve, this.fast ? Math.min(ms, 250) : ms))).then(() => this.check());
  }
  alive() { return this.players.filter((p) => p.alive); }
  name(id) { const p = this.players.find((x) => x.id === id); return p ? (p.human ? `${p.name} (you)` : p.name) : id; }
  say(text) { this.$('[data-msg]').textContent = text; }

  setRound(label, game, variantLabel) {
    this.$('[data-round]').textContent = label;
    this.$('[data-game]').textContent = game;
    this.$('[data-variant]').textContent = variantLabel;
  }

  renderPanel(current = null) {
    const rows = this.players.slice().sort((a, b) => a.seat - b.seat).map((p) => {
      const st = !p.alive ? 'OUT' : (this.statusText[p.id] ?? '');
      const cls = [!p.alive ? 'out' : '', p.id === current ? 'current' : '', p.human ? 'you' : ''].join(' ');
      return `<li class="${cls}" style="--seat:${hex(p.shirt)}"><span class="dot"></span><span class="pname">${escapeHtml(p.name)}${p.human ? ' <em>you</em>' : ''}</span><span class="pstat">${escapeHtml(st)}</span></li>`;
    });
    this.$('[data-players]').innerHTML = rows.join('');
    for (const p of this.players) this.table.setStatus(p.id, !p.alive ? 'OUT' : (this.statusText[p.id] ?? ''), p.id === current);
  }

  /** Show a button and wait for it (or don't, in fast/auto mode). */
  action(label, { primary = true } = {}) {
    const box = this.$('[data-actions]');
    if (this.autoHuman) return Promise.resolve();
    return new Promise((resolve) => {
      box.innerHTML = `<button class="btn ${primary ? 'btn-primary' : ''}" data-go>${escapeHtml(label)}</button>`;
      const b = box.querySelector('[data-go]');
      b.focus();
      b.addEventListener('click', () => { box.innerHTML = ''; resolve(); }, { once: true });
    }).then(() => this.check());
  }

  async playHuman(game, variant, extra = {}, banner = '') {
    if (this.autoHuman) {
      await this.wait(300);
      if (extra.compete) {
        const youAt = simulateSolveTime(game.id, 1, this.rng);
        const first = extra.compete.racers.slice().sort((a, b) => a.at - b.at)[0];
        return { score: 0, stats: { winner: !first || youAt < first.at ? 'you' : first.name } };
      }
      return { score: simulateScore(game.id, variant, 1, this.rng), stats: {} };
    }
    this.table.pause();
    const r = await playTurn(document.body, { gameId: game.id, variant, seed: newSeed(), extra, banner });
    this.check();
    this.table.resume();
    return r;
  }

  // ---------- the run ----------
  async main() {
    this.setRound('Welcome to the table', 'Last to Leave', `${this.total} players`);
    this.renderPanel();
    this.say('Paul is getting the first game ready…');
    await this.wait(1800);
    let round = 0;
    const history = [];
    while (this.alive().length > 1) {
      const alive = this.alive();
      const isFinal = alive.length === 2;
      const game = chooseGame(round, alive.length, history, this.rng);
      history.push(game.id);
      const variant = chooseVariant(game, this.settings.versions, this.rng);
      const vLabel = game.variants.find((v) => v.id === variant)?.label ?? 'Regular';
      this.statusText = {};
      this.setRound(isFinal ? 'FINAL' : `Round ${round + 1}`, game.name, vLabel === 'Regular' ? 'Normal' : vLabel);
      this.renderPanel();
      this.say(isFinal ? `It's down to ${this.name(alive[0].id)} and ${this.name(alive[1].id)}.` : `Paul picks… ${game.name}${vLabel !== 'Regular' ? ` (${vLabel})` : ''}!`);
      await this.wait(2200);
      const loser = isRaceGame(game.id) ? await this.race(game, variant, alive) : await this.scored(game, variant, alive, round);
      await this.knockOut(loser);
      round++;
    }
    await this.finish(this.alive()[0]);
  }

  async scored(game, variant, contenders, round) {
    const max = maxScoreFor(game.id);
    const fmt = (s) => (max != null ? `${s}/${max}` : `${s}`);
    const sorted = contenders.slice().sort((a, b) => a.seat - b.seat);
    const k = round % sorted.length;
    const order = sorted.slice(k).concat(sorted.slice(0, k));
    const results = {};
    for (const p of order) {
      this.statusText[p.id] = 'UP NEXT';
      this.renderPanel(p.id);
      let score;
      if (p.human) {
        this.say(`Your turn: ${game.name}.`);
        await this.action(`Play your turn`);
        const r = await this.playHuman(game, variant, {}, `Competition: ${game.name}`);
        score = r.score;
      } else {
        this.say(`${p.name} is up…`);
        await this.wait(1000 + this.rng.next() * 900);
        score = simulateScore(game.id, variant, p.skill, this.rng);
      }
      results[p.id] = score;
      this.statusText[p.id] = fmt(score);
      this.renderPanel();
      this.say(`${this.name(p.id)}: ${fmt(score)}`);
      await this.wait(p.human ? 900 : 650);
    }
    const low = lowestScorers(results);
    if (low.length === 1) return low[0];
    const list = low.map((id) => this.name(id));
    const names = list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list.join(' and ');
    this.say(`Tie for lowest: ${names}! Only they go again.`);
    for (const id of low) this.statusText[id] = 'REPLAY';
    for (const id of Object.keys(results)) if (!low.includes(id)) this.statusText[id] = 'SAFE';
    this.renderPanel();
    await this.wait(2400);
    const tied = contenders.filter((p) => low.includes(p.id));
    const keep = { ...this.statusText };
    const loser = await this.scored(game, variant, tied, round + 1);
    for (const id of Object.keys(keep)) if (keep[id] === 'SAFE') this.statusText[id] = 'SAFE';
    return loser;
  }

  async race(game, variant, contenders) {
    let pool = contenders.slice();
    let board = 1;
    while (pool.length > 1) {
      const human = pool.find((p) => p.human);
      const racers = pool.filter((p) => !p.human).map((p) => ({ id: p.id, name: p.name, at: simulateSolveTime(game.id, p.skill, this.rng) }));
      for (const p of pool) this.statusText[p.id] = 'RACING';
      this.renderPanel();
      let winner;
      if (human) {
        this.say(`Board ${board}: first to get it is safe. ${pool.length} still racing.`);
        await this.action(board === 1 ? 'Start the race' : 'Next board');
        const r = await this.playHuman(game, variant, { compete: { racers: racers.map(({ name, at }) => ({ name, at })) } }, `Race · board ${board}`);
        const w = r.stats?.winner;
        winner = w === 'you' ? human.id : racers.find((x) => x.name === w)?.id;
        if (!winner) winner = racers.slice().sort((a, b) => a.at - b.at)[0]?.id ?? human.id;
      } else {
        this.say(`Board ${board}: Paul holds it up…`);
        await this.wait(1600);
        winner = racers.slice().sort((a, b) => a.at - b.at)[0].id;
      }
      this.statusText[winner] = 'SAFE';
      pool = pool.filter((p) => p.id !== winner);
      this.renderPanel();
      this.say(`${this.name(winner)} got it. Safe!`);
      await this.wait(1300);
      board++;
    }
    return pool[0].id;
  }

  async knockOut(id) {
    const p = this.players.find((x) => x.id === id);
    p.alive = false;
    p.place = this.alive().length + 1;
    this.statusText[id] = 'OUT';
    this.renderPanel();
    this.say(`${this.name(id)} has to leave the table.`);
    await this.table.eliminate(id);
    this.check();
    if (p.human && this.alive().length > 1) {
      this.say(`You're out, ${this.ordinal(p.place)} of ${this.total}.`);
      const box = this.$('[data-actions]');
      const choice = this.autoHuman ? 'watch' : await new Promise((resolve) => {
        box.innerHTML = '<button class="btn btn-primary" data-w>Watch the rest (fast)</button><button class="btn" data-e>See results</button>';
        box.querySelector('[data-w]').addEventListener('click', () => resolve('watch'));
        box.querySelector('[data-e]').addEventListener('click', () => resolve('end'));
      });
      box.innerHTML = '';
      this.check();
      this.fast = true;
      if (choice === 'end') {
        // play the rest out instantly
        this.skipToEnd = true;
      }
    }
  }

  ordinal(n) { return `${n}${['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th'}`; }

  async finish(winner) {
    winner.place = 1;
    this.statusText[winner.id] = 'WINNER';
    this.renderPanel(winner.id);
    this.setRound('Last to Leave', this.name(winner.id), 'is the last one at the table');
    this.say(`${this.name(winner.id)} is the LAST TO LEAVE!`);
    const me = this.players.find((p) => p.human);
    const won = me.place === 1;
    const rounds = this.total - me.place; // rounds survived
    await scores.submit({
      gameId: 'competition',
      variant: `${this.total}p`,
      score: rounds,
      maxScore: this.total - 1,
      passed: won,
      durationMs: Math.round(performance.now() - this.startedAt),
      stats: { place: me.place, players: this.total },
      seed: this.rng.seed,
    });
    await this.wait(this.fast ? 400 : 1600);
    const overlay = this.$('.overlay');
    overlay.hidden = false;
    overlay.innerHTML = `
      <div class="board panel">
        <p class="kicker">Competition Mode · ${this.total} players</p>
        <h2 class="verdict ${won ? 'pass' : 'fail'}">${won ? 'You are the Last to Leave!' : `${escapeHtml(this.name(winner.id))} won it.`}</h2>
        <div class="big-score">${this.ordinal(me.place)}<small> / ${this.total}</small></div>
        <p class="muted">You survived ${rounds} round${rounds === 1 ? '' : 's'}.</p>
        <ol class="final-order">${this.players.slice().sort((a, b) => a.place - b.place).map((p) => `<li${p.human ? ' class="you"' : ''}>${escapeHtml(this.name(p.id))}</li>`).join('')}</ol>
        <div class="btn-row">
          <button class="btn btn-primary" data-again>Play again</button>
          <button class="btn" data-setup>Change setup</button>
          <a class="btn" href="#/">Menu</a>
        </div>
      </div>`;
    overlay.querySelector('[data-again]').addEventListener('click', () => this.onAgain());
    overlay.querySelector('[data-setup]').addEventListener('click', () => this.onExit());
  }

  destroy() {
    this.dead = true;
    this.timers.forEach(clearTimeout);
    this.table?.destroy();
    this.root?.remove();
    document.body.classList.remove('playing');
    if (window.__competition === this) delete window.__competition;
  }
}
