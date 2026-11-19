# Last to Leave — project rules

**What this is:** a minigame website that adapts an improvised game show a few friends ran at a school table. Players survive challenges to be the *last to leave* the table. Everything traces back to real games, real objects (dry-erase markers, whiteboards, foam puzzle pieces, a red solo cup, Paul's khakis) and real inside jokes.

## Fixed rules
- **Name:** Last to Leave
- **Marker colors (exactly 8):** black, red, blue, green, orange, brown, purple, pink. Single source of truth: `js/shared/colors.js` (CSS mirrors them as `--m-*` in `css/base.css`).
- **Logo:** always written in **purple marker**.
- **Markers are drawn one way everywhere:** `drawMarker()` / `markerSVG()` in `js/shared/marker.js` (2D icons) and `createMarker3D()` in `js/three/props.js` (3D).
- **Look:** realistic, not cartoony. UI uses Inter on dark glass. Permanent Marker is only for the logo; Patrick Hand is for writing on whiteboards (Equations/Pictionary boards).
- **Hosting:** static site on **GitHub Pages**, no server and no build step. Plain HTML/CSS/JS ES modules, hash routing (`#/…`), relative paths, `.nojekyll`. Three.js 0.170.0 loads from jsDelivr through the import map in `index.html` (only the 3D games import it). Firebase will be added later for online leaderboards.
- **Devices:** optimize for PC first, but everything must work with touch and at phone width.

## The games (menu order: Marker Catching, Pictionary, Equations, Trivia, Archery, Bowling, Paul's Pocket, Sausage, Cup Catching, Cup Throwing)
| # | Game | Variants | Phase |
|---|------|----------|-------|
| 1 | Marker Catching | Regular, Bullet toggle, Endless toggle (can combine), **Memory** toggle (not with Endless: Paul shows 4 markers first, two +2 and two −1, random per person/game; `CONFIG.memory`). Regular: ~3% much-faster and ~3% much-slower throws (`regular.rare`). Online: everyone gets the same set of throw kinds (`options.shareSeed`) in their own order/spots. Spam clicks: hidden escalating cooldown (`fumbleStackMs`), no visual | 1 ✅ |
| 2 | Pictionary | 3 rounds; offline clock runs out 5–10 s after the sketch finishes, wrong guess = −5 s. Competition/online: no clock, wrong guess = 5 s wait (shown as a lockout timer for everyone, incl. computers), new drawing 30 s after the sketch if nobody gets it. Paul stands beside the board drawing with a fixed-length (IK) arm; whatever blocks the board is see-through. 182 sketches (`drawings.js` + `drawings2.js` + `drawings3.js` niche/weird ones) + your own (`#/draw`); offline skips the last 40 seen; **Rush** toggle (was Streak; endless, built-in drawings, one miss ends it, after-sketch time shrinks; variant id `rush`) | 5 ✅ |
| 3 | Equations | 3 rounds; offline 20 s, wrong = −5 s; Competition/online: no clock, wrong = 5 s wait, new problem after 60 s. Mix: 63% mental math / 25% algebra / 6% geometry / 3% super easy / 3% calculus; **Rush** toggle (endless: harder problems, clock 20→10 s, one miss ends it) | 5 ✅ |
| 3b | Trivia | Same flow as Equations (board flip, 20 s, −5 s, races, lockouts, new board after 60 s), 239 questions in easy/medium/hard tiers (`questions.js`), recent ones avoided; **Rush** toggle (one miss ends it) | ✅ |
| 4 | Archery | Foam Nevada/Wyoming/Connecticut at a handheld whiteboard **Paul holds up**, somewhere new every throw; Wind toggle; **Hotspots** toggle (orange bonus zone each throw: board 1 pt, zone 2 pts, max 6, pass 3; never more than half the board, every zone labeled ×2) | 2 ✅ |
| 5 | Bowling | Yellow-black eraser vs 3 standing markers, 3 throws, max 9; Wind; Hard (1/2/3 pts); the eraser hops a little on landing; **Eraser: flat / on its side** button (or F) while aiming | 3 ✅ |
| 6 | Paul's Pocket | Pick 1 of 8 markers; Paul scoops them into his khaki pocket, scrambles, pulls one out; 1-in-8 luck. Phones/touch: big color buttons to pick with | 6 ✅ |
| 6b | Sausage Game | Portrait whiteboard flat on the table, 4–6 bands each a different value −2..+5 (same for everyone with the seed), start box at the near end; drag back on the ink refill and let go (grab point = spin/angle), power meter in the corner; 3 flicks, off the board = 0; max 15, pass 5. Competition: only when 3 or fewer players are left (Points mode: last 2 rounds only) | ✅ |
| 7 | Cup Catching | Red solo cup at waist height, fixed depth again (`cupDepth`), left/right + up/down only, with a dashed landing-hint ring shortly before each marker lands (`hint`); slower, steadier lobs than Marker Catching; midday sun so marker shadows fall under them; the cup tips a little toward an incoming marker; **no spilling** (removed 2026-11-19; `spill.enabled` in config brings it back); Endless: Paul empties the cup at 8 (still counted), 3 misses in a row ends it | 4 ✅ |
| 8 | Cup Throwing | Throw all 8 markers into a cup **Paul holds** at his hip (`cup.heldByPaul`); fixed or moving cup; markers stay where they land; dotted path of your last throw + the cup's distance in meters above it; hardest game | 3 ✅ |

## Throwing games (Archery, Bowling, Cup Throwing, and any future ones)
- Press anywhere: the held object goes to your pointer (wide area, `heldFollow` in shared/throwing.js), so you can throw from any spot.
- Aim follows the flick's on-screen line to the horizon (`flickToVelocity` with the release point), so a straight-up flick from the left goes up the left.
- Throwing far takes a harder flick (powerScale lowered after playtest). Wind is stronger (Archery 2.8, Bowling 3.0).
- Thrown things bounce off Paul (`bounceOffPaul`) and he flinches a little (`flinch` in paul3d).
- Targets are placed within `SAFE_HALF_WIDTH` (visible on every screen) so online players all get identical spots, wind and boards (same seed; outcome-dependent randomness uses `luck`).

## What's new (changelog popup)
- `js/core/whatsNew.js` → `CHANGELOG` (newest first). **Add an entry at the top with every update you publish** (short, player-facing; `id` must sort after the previous one, e.g. a date). Returning players see the new entries once on the home page; brand-new players don't. Reopen from the home footer.

## Records versions
- `rv` per game in `games/registry.js`. Bump it when a game changes enough that old bests don't compare: old bests are then ignored locally and in the cloud. Leaderboard boards have their own `v` in `core/leaderboard.js` (board id gets `.v2`), which starts that board fresh. Last resets: 2026-11-18 (all games except Paul's Pocket; the three Endless boards); 2026-11-19 Cup Catching rv 3 + endless-cup v3 (spilling removed); 2026-11-19c Marker Catching rv 3, Pictionary rv 3, Cup Catching rv 4, Cup Throwing rv 3, endless-catch/bullet v3, endless-cup v4, endless-streak v2 (= Pictionary Rush). New boards: endless-trivia, fast-trivia.

## The real setting (use this for theming)
- **The table:** a square, perforated (expanded-metal) outdoor picnic table with four separate benches, one on each side, and a black tube frame. It's painted **dark purple, close to black**.
- **Seating:** 2 people per bench, sitting **facing away from the table**. Paul stands out in front of them, running each game. So the player's first-person view looks *outward* from the bench toward Paul, with the table behind them.
- Paul's Pocket already uses the dark purple perforated-metal bench in the foreground.

## Publishing (live)
- Repo: https://github.com/aryan-bhatia6370/last-to-leave (public). Live site: https://aryan-bhatia6370.github.io/last-to-leave/ (GitHub Pages from `main`, root folder).
- To publish an update: commit, then `git push`. Pages rebuilds automatically in about a minute. Commit and push only when the user asks.
- The GitHub CLI lives in `.tools/` (git-ignored): `.tools/gh_2.105.0_macOS_arm64/bin/gh`. It's already signed in as the user.
- Commits are signed with the user's GitHub no-reply email (repo-local git config), so their real email stays private.

## Privacy (the site is public)
- Paul and the other Members are real people (teenagers). Use reference photos **only** as visual reference. Never copy them into the project, and never put real last names, the school's name, IDs or photos on the site. Paul's look: fair skin, short messy dark-brown hair, school uniform (white polo, navy lanyard + ID card, khaki trousers).

## Competition Mode + online rules (decided 2026-11-18)
- **Table:** 2–8 seats. Characters: Aryan, Nate, Jayden, Jardel, Aldrich, Andres, Nevin, Ivan (looks modeled from the user's reference photos, never the photos themselves, in `CHARACTERS[].look`: Nate curly/polo/shorts, Jayden fringe/zip hoodie/backpack, Jardel curtains/open hoodie/glasses, Aldrich spiky/hoodie/mustache+goatee, Andres shaggy/polo, Nevin messy dirty-blond/glasses, Ivan mop/hoodie/mustache; each keeps his marker-color clothing; Aryan is his own thing, to be redone later). Each character can be taken by only one player.
- **Rounds:** Paul picks a random game and a variant each round. **Variants are weighted: the normal version about 2/3 of the time**, alternates (Bullet, Wind, Hard, Moving Cup...) the rest; never Endless modes. **The host (or the solo player) can override per game:** random (weighted, the default), normal only (no alternates), or always one specific version (e.g. only Bullet for Marker Catching). **Round 1 is always Marker Catching** (any non-endless variant). **Paul's Pocket is left out** of Competition Mode for now. Players play **one at a time around the table** while everyone else watches. The **lowest scorer is eliminated** (stands up and walks away from the table).
- **Ties for lowest:** only the tied players replay the same game; the lower one is out (repeat if they tie again).
- **Pictionary / Equations race:** everyone sees Paul's board at once. The first correct answer is safe, then a **new** drawing/problem goes up for the rest, until one player never got one; they're eliminated.
- **Game pool:** the host (or solo player) can take any game out (`settings.off` / `meta/off`, `poolFrom`). **No game version repeats in a run** except Marker Catching (`chooseRound`).
- **Points mode** (`settings.mode` / `meta/mode` = 'points'): nobody leaves; 5 rounds; 1st = 3, 2nd = 2, 3rd = 1 (ties share the rank; races rank by the order players got safe and stop once 3 are safe); Marker Catching is round 1; Sausage only in the last 2 rounds; most points wins, then most 1st places, then a coin flip. Records variant `${n}p-points`.
- **Paul at the table** (`tableScene.js`, `TABLE_PAUL`): walks around the table to stand in front of whoever's turn it is (see-through when he'd block the front bench), and leads each eliminated player away with a hand on their shoulder. `YANK_CHANCE` (5%, engine.js): a computer refuses and Paul yanks them off the bench (online the host decides it in the `out` step).
- **Final:** the last 2 players play a random game (not Pictionary or Equations); the winner is the Last to Leave. Final Rounds (special finale games) come later.
- **Solo vs computers:** choose 1–7 computer players (doesn't have to fill all 8). Computers take open characters and get simulated scores.
- **Accounts:** **Google sign-in.** On first sign-in the player **creates a username**. That username (never their Google name or email) is what other players and leaderboards see. Leaderboard metrics: see Leaderboards below.
- **Online rooms:** **Google sign-in, account required** (no guests). Host creates a room code; others join and pick an untaken character; the host may add any number of computers (or none) to empty seats. Turns go one at a time while everyone spectates live. Scores are saved to accounts.
- **Built (Phase 8 ✅):** `#/compete`. Code in `js/competition/`: `engine.js` (rules, game/version picking, computer scores and race solve times, ties), `tableScene.js` (3D table, seated players, walk-away, name tags), `playTurn.js` (runs one real minigame turn full-screen), `page.js` (setup screen + the run). Pictionary/Equations take `options.compete = { racers: [{ name, at }] }` for race boards. 3D people: `createPerson3D(look)` in `three/paul3d.js` (placeholder looks for Members). Debug: `?debug=1` + `window.__competeAutoHuman = true` lets a bot play your turns.
- **Accounts (Phase 9 ✅, sign-in tested on localhost):** Firebase project `last-to-leave-207b8` (Spark/free, owned by the user's personal Gmail; Analytics off; Firestore in nam5; authorized domains: localhost + `aryan-bhatia6370.github.io`). Config in `js/core/firebaseConfig.js` (public by design; setting it to `null` switches accounts off). Rules changes: edit `firestore.rules`, then paste into Console → Firestore → Rules → Publish (the console editor won't take a clipboard paste from the browser pane; typing a one-line version works). `js/core/account.js` lazy-loads Firebase 10.14.1 from gstatic: Google sign-in (popup, redirect fallback), usernames (3–16 `[A-Za-z0-9_]`, unique case-insensitive, claimed once in a transaction, small blocklist), cloud sync of best scores (two-way merge, higher wins) + per-game history. `js/pages/account.js`: `#/account`, the home account chip, and the required username gate shown to new accounts. Firestore layout and `firestore.rules` (paste into the console): `usernames/{lower}`, `users/{uid}` (username only, nothing from Google), `users/{uid}/bests/{game:variant}` (public), `users/{uid}/history` (private). `scores.onScoreSaved()` / `scores.mergeBests()` are the hooks.
- **Leaderboards (decided 2026-11-18, built in `js/core/leaderboard.js` + `js/pages/leaderboards.js`, route `#/leaderboards`):** three tabs, each board both **This week** (resets Monday 00:00 Pacific) and **All time**. Only signed-in players appear; `?debug=1` never counts.
  - **Endless:** best score in Marker Catching Endless, Marker Catching Bullet + Endless, Cup Catching Endless, Equations Rush, Pictionary Streak.
  - **Fastest:** best average solve time (tenths of a second, lower wins) in a regular Equations / built-in Pictionary game where you got all 3.
  - **Competition:** total wins, offline wins, online wins (3+ real players, Phase 10), best performance (Phase 10: whole-run score **out of 100 with one decimal**, online only).
  - **Minigames:** total, offline, online wins. A minigame win = passing a minigame played solo, OR the top score in a Competition round (ties for top count, tie-break replays don't; in Pictionary/Equations races = first to solve board 1).
  - **Offline Competition counts only with 3+ players at the table (you + 2 computers)**, matching online's 3+ real players.
  - Firestore `boards/{period~kind}/entries/{uid}`; rules allow counters only +1, endless bests only up (cap 5000), no online boards yet. Delete fake entries in the console (console bypasses rules).
- **Online rooms (Phase 10, built 2026-11-18; tested with 1 real player + computers, not yet with 2+ real players):** `#/online` (host / join by code) and `#/room/:code`. Code in `js/online/`:
  - `net.js` loads the Firebase **Realtime Database** (`databaseURL` in firebaseConfig.js; rules in `database.rules.json`, paste into Console → Realtime Database → Rules).
  - `room.js`: rooms/{CODE} = meta, members, presence (auto-removed on disconnect), chars (one owner each), run, results, race, live. 5-char codes.
  - `referee.js`: the **host's browser** runs the game as a state machine stored in `run` (intro → announce → turn/tie or race/raceNext → out → … → done), so if the host leaves, the next player (earliest joined, still connected) takes over. **Disconnected 60 s → a computer takes the seat.** Same rules/engine as offline. All players get the same seed per round.
  - `page.js`: lobby (pick an untaken character, host sets computers 0–7 and versions) and the run view (reuses tableScene + playTurn). Online turns can't be paused.
  - **Live spectating** (`mirror.js`): the player's game `st` is sent ~10×/s as JSON text to `live/{turnKey}`; watchers run the same game with `options.spectate = receiver`, which copies the blended state into `st` instead of simulating (each game has a 3-line hook + `state()` on its instance). About 1.3 KB per update.
  - Races (Pictionary/Equations): every real player plays the board at once; reports `{solved, t}`; the host picks the fastest (computer times are simulated), with a 4 s grace for late reports.
  - `performance.js`: 70% rounds (each = half standing vs the others that round + half quality vs a typical player for that game; races: order you got safe + solve speed) + 30% where you finished. 0–100, one decimal. Shown for every real player on the results screen. Online leaderboards (3+ real players) are written at the end of the run by each player (`recordOnlineRun`).
  - Lobby: everyone must pick a seat and press **Ready**, and only the host can Start. After a run the host can take everyone **back to the lobby with the same code**. Leaderboards (`boardsFor`): fewer than 3 at the table = none; real players ≥ computers = online boards; more computers than people = offline boards (`recordBotMajorityRun`). Race wrong guesses go to `racewrong/{raceKey}/{uid}` so every screen shows the lockout. When all real players are out, anyone can **Speed up** (4×) or **Skip to results** (`requests/{uid}`).
  - Computer players: `BOTS` in competition/engine.js (per-turn form so scores vary; targets from the playtest notes).
- **Build order:** Phase 8 = Competition Mode solo vs computers. Phase 9 = Google accounts + cloud scores (Firebase; the user creates the Firebase project in their own Google account and Claude walks them through it). Phase 10 = online rooms with live spectating.

## Phase plan
1. Foundations + menu + whiteboard/marker style + **Marker Catching** ✅
2. Shared flick-throw engine + Wind system + **Archery** ✅
3. **Bowling** + **Cup Throwing** ✅
4. **Cup Catching** ✅
5. **Equations** + **Pictionary** (+ drawing recorder tool for authoring sketches) ✅
6. **Paul's Pocket** + **the Paul model** ✅. Paul is the show's host: he walked around running the events while everyone sat at the table. `js/shared/paul.js` draws him (Caucasian, khaki trousers; shirt and hair colors are placeholders). He throws in Marker/Cup Catching, holds the handheld whiteboard in Archery, and holds the cup in Cup Throwing.
7. Theming pass: lore, Members as characters, references/inside jokes, sound, art. **The user wants a much more realistic look, not cartoony/animated, and chose Three.js.**
   - ✅ Shared 3D layer in `js/three/`: stage (Three.js camera matched exactly to each game's `cam`, so physics and hit-testing don't change), courtyard (sky, sun and shadows, concrete, stucco school building with a covered walkway), procedural textures, props (3D markers, the dark-purple perforated picnic table), realistic Paul.
   - ✅ **All games render in 3D.** The 3D catching/throwing games use `createStage3D` + `buildCourtyard`, with a `sync3D()` each frame that puts the 3D objects where the physics says. Equations and Pictionary use `three/boardStage.js` (Paul holds a real whiteboard whose sides are canvas textures; in Pictionary he draws with the marker, then erases). Paul's Pocket is a 3D close-up (he fans out the 8 markers; his hand really goes into the khaki pocket).
   - The HUD (scores, clock, popups, badges, debug) stays 2D on a transparent canvas on top.
   - ✅ **Menus and HUD restyled** to match: dark glass panels over a dark-purple perforated-metal backdrop (like the table), Inter for UI text, and a real 3D render of the table and Paul as the home page header (`three/heroShot.js`, rendered once and cached per session). In-game, `drawLabel` (shared/hud.js) uses the broadcast style (white bold sans, soft shadow) on the HUD canvas, and handwritten marker on whiteboard textures.
   - Still to do in theming: lore, Members, sounds, inside jokes, and (optionally) a lifelike rigged human model for Paul. Ask the user before downloading any model asset.
8. **Competition Mode** ✅ solo vs computers (see the rules above). Final Rounds come later.
9. Google accounts + usernames + cloud scores + leaderboards (Firebase) ✅
10. Online rooms with live spectating ✅ (needs a playtest with 2+ real players)

Build one phase at a time and stop for the user to playtest after each.

## Code layout
```
index.html, css/base.css
js/main.js                 routes
js/core/                   router, gameHost (shared game shell), scores, rng, canvas, input, env
js/shared/                 colors, marker drawing, whiteboard/tray drawing, plus:
  vec3.js                  vector math + easing
  scene3d.js               first-person perspective camera, room background, 3D line/polygon drawing
  throwing.js              createThrowControl (press-drag-flick input), flick tracker, flick -> launch velocity, projectile step with drag/wind, spin
  wind.js                  per-throw wind, on-screen streaks, corner gauge (Archery, Bowling)
  states.js                state puzzle-piece outlines (Nevada, Wyoming, Connecticut)
  hud.js                   marker-style canvas text, popups, ✓/✗ badges, flick hint, debug box
  objects3d.js             eraser (box), rod markers, red solo cup (+ clipping for markers inside), floor shadows
  gameLoop.js              requestAnimationFrame loop with pause + FPS
  thrower.js               Paul throwing markers (walk, wind-up styles) + throw solver
  paul.js                  Paul's 3D figure (+ drawPaulHand for fingers wrapped in front of things)
  answerBar.js             typed-answer bar + round clock (Equations, Pictionary)
  boardScene.js            wall, big whiteboard, countdown, round badges (Equations, Pictionary)
  mathText.js              handwritten math markup: ^ exponents, {a/b} fractions, √{n}, ∫
js/games/registry.js       all 10 games: name, color, blurb, `variants` (every mode combo; the single source for game index.js + Records), `load`
js/games/<game>/config.js  ALL tunable numbers for that game
js/games/<game>/game.js    the game
js/games/<game>/index.js   game definition (name, how-to, options, variants)
js/pages/                  home, records, draw (Pictionary drawing board)
js/online/                  online rooms: net (Realtime DB), room, referee (host), page, mirror (live spectating), performance
js/three/                  realistic 3D layer (Three.js via import map in index.html): stage, courtyard, textures, props (markers, picnic table, solo cup, eraser, foam pieces, handheld board, marker pool, pose helpers), paul3d, boardStage
```

## Game contract (keep every game consistent; Competition Mode depends on it)
A game's `index.js` default-exports `{ id, name, tagline, howTo, options, variants, statLabels, variant(opts), create(container, { options, seed, debug, onFinish }) }`.
`create` returns `{ start, pause, resume, destroy }` and calls `onFinish(result)` exactly once with:
```
{ gameId, variant, score, maxScore /* null for endless */, passed, durationMs, stats, seed }
```
- `passed` uses the game's `passScore` from its `config.js`.
- Randomness goes through `createRng(seed)` so runs can be replayed or shared later. Randomness that depends on what the player did (rim rattles, spills, how markers settle) uses a separate `luck` rng (seed ^ 0x9e3779b9). That way every player with the same seed gets identical throws, which online rooms need.
- `gameHost.js` handles setup, countdown, pause (Esc / tab hidden), results and saving.

## Scores
- `js/core/scores.js`, async API: `submit`, `getBest`, `getBests`, `getHistory`, `clear`. The data lives in localStorage key `ltl.scores.v1` (`{ version, bests: {"game:variant": record}, history: [...] }`). The player name lives in `ltl.player.v1`.
- For online leaderboards, add an adapter and call `setScoreAdapter()`. Games don't change.

## Conventions
- Durations, speeds, timers and difficulty go in the game's `config.js`, never inline.
- `?debug=1` (before the `#`) turns on debug overlays (hitboxes, timing, FPS) and exposes `window.__<game>` hooks; throwing games have `step(seconds)` so tests can advance time without the animation loop (hidden browser panes don't run requestAnimationFrame).
- Throwing games: power is measured in screen-heights/second so flicks feel the same on any screen. Check new throw tuning with a quick physics sweep: a person can repeat a flick speed to about ±15%, so a target should accept at least that much.
- Preview locally: `python3 -m http.server 8000`, then open http://localhost:8000. ES modules don't load from `file://`.
- Theming and lore are coming. Keep art in clearly named draw functions so it can be swapped (e.g. the gray placeholder thrower in Marker Catching becomes a Member).
