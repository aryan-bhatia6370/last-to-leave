import { GAMES } from '../games/registry.js';
import { scores, formatScore, getPlayer, setPlayer } from '../core/scores.js';
import { escapeHtml } from '../core/env.js';
import { accountState, onAccount } from '../core/account.js';

const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch { return ''; }
}

export async function renderRecords(outlet, _params, { isCurrent }) {
  const playable = GAMES.filter((g) => g.load);
  const defs = playable; // registry entries carry the variant names
  const bests = await scores.getBests();
  const history = await scores.getHistory({ limit: 25 });
  if (!isCurrent()) return;
  const player = getPlayer();
  const acct = accountState();
  const signedIn = !!(acct.user && acct.profile);

  const variantLabel = (gameId, variant) =>
    defs.find((d) => d.id === gameId)?.variants.find((v) => v.id === variant)?.label ?? variant;
  const gameName = (gameId) => (gameId === 'competition' ? 'Competition Mode' : GAMES.find((g) => g.id === gameId)?.name ?? gameId);

  // Competition Mode: best run for each table size
  const compRows = [2, 3, 4, 5, 6, 7, 8].map((n) => {
    const b = bests[`competition:${n}p`];
    return b ? `<tr><td>${n} players</td><td class="num">${b.passed ? 'Won' : ordinal(b.stats?.place ?? n - b.score)}</td><td>${fmtDate(b.playedAt)}</td></tr>` : '';
  }).join('');
  const compSection = compRows
    ? `<div class="records-game" style="--c: var(--m-purple)"><h2>Competition Mode</h2><div class="table-wrap"><table class="records-table"><thead><tr><th>Table</th><th>Best finish</th><th>When</th></tr></thead><tbody>${compRows}</tbody></table></div></div>`
    : '';

  const perGame = playable.map((g, i) => {
    const def = defs[i];
    const rows = def.variants.map((v) => {
      const b = bests[`${g.id}:${v.id}`];
      return `<tr>
        <td>${escapeHtml(v.label)}</td>
        <td class="num">${b ? formatScore(b.score, b.maxScore) : '<span class="muted">—</span>'}</td>
        <td>${b ? fmtDate(b.playedAt) : ''}</td>
      </tr>`;
    }).join('');
    return `
      <div class="records-game" style="--c: var(--m-${g.color})">
        <h2>${escapeHtml(g.name)}</h2>
        <div class="table-wrap"><table class="records-table">
          <thead><tr><th>Mode</th><th>Best</th><th>When</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>
      </div>`;
  }).join('');

  const recent = history.length
    ? `<div class="table-wrap"><table class="records-table">
        <thead><tr><th>Game</th><th>Mode</th><th>Score</th><th></th><th>When</th></tr></thead>
        <tbody>${history.map((r) => `<tr>
          <td>${escapeHtml(gameName(r.gameId))}</td>
          <td>${escapeHtml(r.gameId === 'competition' ? r.variant.replace('p', ' players') : variantLabel(r.gameId, r.variant))}</td>
          <td class="num">${formatScore(r.score, r.maxScore)}</td>
          <td>${r.gameId === 'competition' ? (r.passed ? '<span class="pass-dot">won</span>' : `<span class="fail-dot">${r.stats?.place ?? '?'} of ${r.stats?.players ?? '?'}</span>`) : r.passed ? '<span class="pass-dot">survived</span>' : '<span class="fail-dot">out</span>'}</td>
          <td>${fmtDate(r.playedAt)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<p class="muted">No games played yet.</p>';

  outlet.innerHTML = `
    <main class="page records">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a><a class="btn btn-small" href="#/leaderboards">Leaderboards</a></nav>
      <section class="board">
        <h1>My Records</h1>
        ${signedIn
          ? `<p class="sub">Signed in as <strong>${escapeHtml(acct.profile.username)}</strong>. Your best scores are saved to your account too.</p>`
          : acct.enabled
            ? `<p class="sub">Saved on this device only. <a href="#/account">Sign in</a> to keep them on every device.</p>`
            : `<p class="sub">Saved on this device only.</p>
        <label class="name-field">
          <span>Your name</span>
          <input type="text" maxlength="20" autocomplete="nickname" placeholder="Who's playing?" value="${escapeHtml(player.name)}" data-name>
        </label>`}
        ${compSection}
        ${perGame}
        <div class="records-game">
          <h2>Recent games</h2>
          ${recent}
        </div>
        <button class="btn btn-small btn-danger" data-clear>Clear my scores</button>
      </section>
    </main>`;

  const nameInput = outlet.querySelector('[data-name]');
  nameInput?.addEventListener('input', () => setPlayer({ ...getPlayer(), name: nameInput.value.trim() }));

  outlet.querySelector('[data-clear]').addEventListener('click', async () => {
    const msg = signedIn
      ? 'Erase the scores saved on this device? Your account keeps its best scores and brings them back next time you sign in.'
      : 'Erase every saved score on this device? This cannot be undone.';
    if (!confirm(msg)) return;
    await scores.clear();
    renderRecords(outlet, _params, { isCurrent });
  });

  // redraw once the account finishes loading, signs in/out, or syncs new bests
  const seen = { ready: acct.ready, profile: acct.profile, sync: acct.lastSync };
  let done = false;
  const off = onAccount((s) => {
    if (done) return;
    if (!isCurrent()) { done = true; queueMicrotask(() => off()); return; }
    if (s.ready !== seen.ready || s.profile !== seen.profile || s.lastSync !== seen.sync) {
      done = true;
      queueMicrotask(() => { off(); renderRecords(outlet, _params, { isCurrent }); });
    }
  });
}
