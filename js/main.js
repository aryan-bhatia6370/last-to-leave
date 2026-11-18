import { createRouter } from './core/router.js';
import { renderGamePage } from './core/gameHost.js';
import { renderHome } from './pages/home.js';
import { renderRecords } from './pages/records.js';
import { renderDraw } from './pages/draw.js';
import { renderCompete } from './competition/page.js';

createRouter(
  [
    { pattern: '', render: renderHome },
    { pattern: 'play/:id', render: renderGamePage },
    { pattern: 'records', render: renderRecords },
    { pattern: 'draw', render: renderDraw },
    { pattern: 'compete', render: renderCompete },
  ],
  document.getElementById('app'),
).start();
