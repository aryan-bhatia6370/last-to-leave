import { GAMES } from '../games/registry.js';
import { scores, formatScore, getPlayer, setPlayer } from '../core/scores.js';
import { escapeHtml } from '../core/env.js';

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

  const variantLabel = (gameId, variant) =>
    defs.find((d) => d.id === gameId)?.variants.find((v) => v.id === variant)?.label ?? variant;
  const gameName = (gameId) => GAMES.find((g) => g.id === gameId)?.name ?? gameId;

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
          <td>${escapeHtml(variantLabel(r.gameId, r.variant))}</td>
          <td class="num">${formatScore(r.score, r.maxScore)}</td>
          <td>${r.passed ? '<span class="pass-dot">survived</span>' : '<span class="fail-dot">out</span>'}</td>
          <td>${fmtDate(r.playedAt)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`
    : '<p class="muted">No games played yet.</p>';

  outlet.innerHTML = `
    <main class="page records">
      <nav class="topbar"><a class="btn btn-small" href="#/">← Menu</a></nav>
      <section class="board">
        <h1>My Records</h1>
        <p class="sub">Saved on this device only. Online leaderboards come in a later phase.</p>
        <label class="name-field">
          <span>Your name</span>
          <input type="text" maxlength="20" autocomplete="nickname" placeholder="Who's playing?" value="${escapeHtml(player.name)}" data-name>
        </label>
        ${perGame}
        <div class="records-game">
          <h2>Recent games</h2>
          ${recent}
        </div>
        <button class="btn btn-small btn-danger" data-clear>Clear my scores</button>
      </section>
    </main>`;

  const nameInput = outlet.querySelector('[data-name]');
  nameInput.addEventListener('input', () => setPlayer({ ...getPlayer(), name: nameInput.value.trim() }));

  outlet.querySelector('[data-clear]').addEventListener('click', async () => {
    if (!confirm('Erase every saved score on this device? This cannot be undone.')) return;
    await scores.clear();
    renderRecords(outlet, _params, { isCurrent });
  });
}
