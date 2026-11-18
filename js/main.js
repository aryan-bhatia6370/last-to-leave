import { createRouter } from './core/router.js';
import { renderGamePage } from './core/gameHost.js';
import { renderHome } from './pages/home.js';
import { renderRecords } from './pages/records.js';
import { renderDraw } from './pages/draw.js';
import { renderCompete } from './competition/page.js';
import { renderAccount, startUsernameGate } from './pages/account.js';
import { initAccounts } from './core/account.js';
import './core/leaderboard.js'; // counts wins + endless scores for the boards
import { renderLeaderboards } from './pages/leaderboards.js';

createRouter(
  [
    { pattern: '', render: renderHome },
    { pattern: 'play/:id', render: renderGamePage },
    { pattern: 'records', render: renderRecords },
    { pattern: 'draw', render: renderDraw },
    { pattern: 'compete', render: renderCompete },
    { pattern: 'account', render: renderAccount },
    { pattern: 'leaderboards', render: renderLeaderboards },
  ],
  document.getElementById('app'),
).start();

startUsernameGate();
initAccounts();
