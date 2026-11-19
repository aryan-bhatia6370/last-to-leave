// "What's new": a short changelog that pops up once for returning players the
// first time they open the site after an update (newest first). Add a new entry
// at the top of CHANGELOG with every update; its `id` must sort after the last one.

import { escapeHtml } from './env.js';

export const CHANGELOG = [
  {
    id: '2026-11-19b',
    title: 'Cup Catching: no more spilling',
    items: [
      'Markers no longer fall out of the cup when you move it. Swing away.',
      'Because that makes it easier, Cup Catching best scores and the Endless Cup Catching leaderboard were reset.',
    ],
  },
  {
    id: '2026-11-19',
    title: 'Rush, Streak & Fastest',
    items: [
      '<strong>Equations Rush</strong>: endless problems that get harder while the clock shrinks. One miss ends it.',
      '<strong>Pictionary Streak</strong>: endless drawings with less and less time. 3 strikes and you’re out.',
      'New leaderboards: Rush and Streak on the Endless tab, plus a new <strong>Fastest</strong> tab (best average time when you get all 3 in Equations or Pictionary).',
      'This “What’s new” box. You can open it any time from the bottom of the home page.',
    ],
  },
  {
    id: '2026-11-18b',
    title: 'Playtest update',
    items: [
      'Online lobby: everyone picks a seat and presses <strong>Ready</strong> before the host can start.',
      'Performance score reworked and shown for every player at the end. Speed Up / Skip to Results when only bots are left.',
      'Pictionary: 112 prompts, clock ends 5–10 s after the drawing, Paul draws over the board. Equations: 20 s, more algebra.',
      'Throwing games: throw from anywhere, aim where you flick, stronger wind, things bounce off Paul. New Archery <strong>Hotspots</strong> mode.',
      'Bowling eraser hops and can stand on its side. Cup Catching and Cup Throwing are much fairer. Bots rebalanced.',
      'Old best scores and Endless leaderboards were reset because the games changed.',
    ],
  },
  {
    id: '2026-11-18',
    title: 'Accounts, leaderboards & online rooms',
    items: [
      'Sign in with Google and pick a username. Your best scores follow you to any device.',
      'Leaderboards: Endless, Competition and Minigames, this week and all time.',
      'Online rooms: share a code, pick characters, and watch each other’s turns live.',
    ],
  },
];

const SEEN_KEY = 'ltl.whatsnew.seen.v1';
const latest = () => CHANGELOG[0].id;

function getSeen() { try { return localStorage.getItem(SEEN_KEY); } catch { return null; } }
function setSeen(id) { try { localStorage.setItem(SEEN_KEY, id); } catch { /* fine */ } }

/** Has this browser played before? (New players don't need a changelog.) */
function returningPlayer() {
  try { return ['ltl.scores.v1', 'ltl.player.v1', 'ltl.compete.v1'].some((k) => localStorage.getItem(k)); } catch { return false; }
}

/** Call when the home page shows. Pops up once per update for returning players. */
export function maybeShowWhatsNew() {
  const seen = getSeen();
  if (seen === latest()) return;
  if (!seen && !returningPlayer()) { setSeen(latest()); return; } // brand-new: nothing to catch up on
  const fresh = CHANGELOG.filter((e) => !seen || e.id > seen);
  showWhatsNew(seen ? fresh : fresh.slice(0, 1));
}

/** Open the box (all updates when `entries` is left out). */
export function showWhatsNew(entries = CHANGELOG) {
  if (document.querySelector('.whatsnew')) return;
  const el = document.createElement('div');
  el.className = 'overlay gate whatsnew';
  el.innerHTML = `
    <div class="panel board" role="dialog" aria-modal="true" aria-labelledby="wn-title">
      <p class="kicker">Last to Leave</p>
      <h2 id="wn-title">What’s new</h2>
      <div class="wn-list">
        ${entries.map((e) => `<section><h3>${escapeHtml(e.title)}</h3><ul>${e.items.map((i) => `<li>${i}</li>`).join('')}</ul></section>`).join('')}
      </div>
      <div class="btn-row"><button class="btn btn-primary" data-close>Let’s play</button></div>
    </div>`;
  const close = () => { setSeen(latest()); el.remove(); window.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  el.querySelector('[data-close]').addEventListener('click', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  window.addEventListener('keydown', onKey);
  document.body.append(el);
  el.querySelector('[data-close]').focus();
}
