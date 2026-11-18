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

## The games (menu order)
| # | Game | Variants | Phase |
|---|------|----------|-------|
| 1 | Marker Catching | Regular, Bullet toggle, Endless toggle (can combine) | 1 ✅ |
| 2 | Pictionary | 3 rounds, 40 s timer, wrong guess = −4 s; black marker draws the sketch live (40 built-in sketches + your own from the drawing board `#/draw`); fuzzy answer matching | 5 ✅ |
| 3 | Equations | 3 rounds, 45 s timer, wrong = −5 s; board flips to reveal; 80% mental math / 17% algebra-geometry / 3% calculus | 5 ✅ |
| 4 | Archery | Foam Nevada (green, large), Wyoming (purple, medium), Connecticut (red, small) thrown at a handheld classroom whiteboard that **Paul holds up**, somewhere new and sometimes angled every throw; Wind toggle | 2 ✅ (Paul added in 6) |
| 5 | Bowling | Yellow-black eraser vs 3 standing markers (unique colors per game), 3 throws, max 9; Wind toggle; Hard mode (black=1, orange=2, purple=3 in separate spots; one throw scores at most 3); Hard and Wind combine | 3 ✅ |
| 6 | Paul's Pocket | Pick 1 of 8 markers off the bench; Paul's hand (Caucasian, khaki trousers, arms/legs only) scoops them into his pocket, scrambles, pulls one out; 1-in-8 luck | 6 ✅ |
| 7 | Cup Catching | Hold a red solo cup (follows mouse/finger) and catch lobbed markers through the top; rim bounces; whipping the cup sloshes markers out; Endless (ends on 3 misses in a row or a spill; cup gets crowded); no Bullet | 4 ✅ |
| 8 | Cup Throwing | Throw all 8 markers into a standing cup; fixed cup or moving cup; thrown markers stay where they land; hardest game (~3/8 avg); **Paul holds the cup** at his hip (`cup.heldByPaul` in config; false = cup on the floor) | 3 ✅ |

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
- **Table:** 2–8 seats. Characters: Aryan, Nate, Jayden, Jardel, Aldrich, Andres, Nevin, Ivan (default-looking 3D figures for now; the user will send names and pictures for real models later). Each character can be taken by only one player.
- **Rounds:** Paul picks a random game and a variant each round. **Variants are weighted: the normal version about 2/3 of the time**, alternates (Bullet, Wind, Hard, Moving Cup...) the rest; never Endless modes. **The host (or the solo player) can override per game:** random (weighted, the default), normal only (no alternates), or always one specific version (e.g. only Bullet for Marker Catching). **Round 1 is always Marker Catching** (any non-endless variant). **Paul's Pocket is left out** of Competition Mode for now. Players play **one at a time around the table** while everyone else watches. The **lowest scorer is eliminated** (stands up and walks away from the table).
- **Ties for lowest:** only the tied players replay the same game; the lower one is out (repeat if they tie again).
- **Pictionary / Equations race:** everyone sees Paul's board at once. The first correct answer is safe, then a **new** drawing/problem goes up for the rest, until one player never got one; they're eliminated.
- **Final:** the last 2 players play a random game (not Pictionary or Equations); the winner is the Last to Leave. Final Rounds (special finale games) come later.
- **Solo vs computers:** choose 1–7 computer players (doesn't have to fill all 8). Computers take open characters and get simulated scores.
- **Accounts:** **Google sign-in.** On first sign-in the player **creates a username**. That username (never their Google name or email) is what other players and leaderboards see. Leaderboard metrics: see Leaderboards below.
- **Online rooms:** **Google sign-in, account required** (no guests). Host creates a room code; others join and pick an untaken character; the host may add any number of computers (or none) to empty seats. Turns go one at a time while everyone spectates live. Scores are saved to accounts.
- **Built (Phase 8 ✅):** `#/compete`. Code in `js/competition/`: `engine.js` (rules, game/version picking, computer scores and race solve times, ties), `tableScene.js` (3D table, seated players, walk-away, name tags), `playTurn.js` (runs one real minigame turn full-screen), `page.js` (setup screen + the run). Pictionary/Equations take `options.compete = { racers: [{ name, at }] }` for race boards. 3D people: `createPerson3D(look)` in `three/paul3d.js` (placeholder looks for Members). Debug: `?debug=1` + `window.__competeAutoHuman = true` lets a bot play your turns.
- **Accounts (Phase 9 ✅, sign-in tested on localhost):** Firebase project `last-to-leave-207b8` (Spark/free, owned by the user's personal Gmail; Analytics off; Firestore in nam5; authorized domains: localhost + `aryan-bhatia6370.github.io`). Config in `js/core/firebaseConfig.js` (public by design; setting it to `null` switches accounts off). Rules changes: edit `firestore.rules`, then paste into Console → Firestore → Rules → Publish (the console editor won't take a clipboard paste from the browser pane; typing a one-line version works). `js/core/account.js` lazy-loads Firebase 10.14.1 from gstatic: Google sign-in (popup, redirect fallback), usernames (3–16 `[A-Za-z0-9_]`, unique case-insensitive, claimed once in a transaction, small blocklist), cloud sync of best scores (two-way merge, higher wins) + per-game history. `js/pages/account.js`: `#/account`, the home account chip, and the required username gate shown to new accounts. Firestore layout and `firestore.rules` (paste into the console): `usernames/{lower}`, `users/{uid}` (username only, nothing from Google), `users/{uid}/bests/{game:variant}` (public), `users/{uid}/history` (private). `scores.onScoreSaved()` / `scores.mergeBests()` are the hooks.
- **Leaderboards (decided 2026-11-18, built in `js/core/leaderboard.js` + `js/pages/leaderboards.js`, route `#/leaderboards`):** three tabs, each board both **This week** (resets Monday 00:00 Pacific) and **All time**. Only signed-in players appear; `?debug=1` never counts.
  - **Endless:** best score in Marker Catching Endless, Marker Catching Bullet + Endless, Cup Catching Endless.
  - **Competition:** total wins, offline wins, online wins (3+ real players, Phase 10), best performance (Phase 10: whole-run score **out of 100 with one decimal**, online only).
  - **Minigames:** total, offline, online wins. A minigame win = passing a minigame played solo, OR the top score in a Competition round (ties for top count, tie-break replays don't; in Pictionary/Equations races = first to solve board 1).
  - **Offline Competition counts only with 3+ players at the table (you + 2 computers)**, matching online's 3+ real players.
  - Firestore `boards/{period~kind}/entries/{uid}`; rules allow counters only +1, endless bests only up (cap 5000), no online boards yet. Delete fake entries in the console (console bypasses rules).
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
   - ✅ **All 8 games render in 3D.** The 3D catching/throwing games use `createStage3D` + `buildCourtyard`, with a `sync3D()` each frame that puts the 3D objects where the physics says. Equations and Pictionary use `three/boardStage.js` (Paul holds a real whiteboard whose sides are canvas textures; in Pictionary he draws with the marker, then erases). Paul's Pocket is a 3D close-up (he fans out the 8 markers; his hand really goes into the khaki pocket).
   - The HUD (scores, clock, popups, badges, debug) stays 2D on a transparent canvas on top.
   - ✅ **Menus and HUD restyled** to match: dark glass panels over a dark-purple perforated-metal backdrop (like the table), Inter for UI text, and a real 3D render of the table and Paul as the home page header (`three/heroShot.js`, rendered once and cached per session). In-game, `drawLabel` (shared/hud.js) uses the broadcast style (white bold sans, soft shadow) on the HUD canvas, and handwritten marker on whiteboard textures.
   - Still to do in theming: lore, Members, sounds, inside jokes, and (optionally) a lifelike rigged human model for Paul. Ask the user before downloading any model asset.
8. **Competition Mode** ✅ solo vs computers (see the rules above). Final Rounds come later.
9. Google accounts + usernames + cloud scores + leaderboards (Firebase) ✅
10. Online play with friends

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
js/games/registry.js       all 8 games: name, color, blurb, `variants` (every mode combo; the single source for game index.js + Records), `load`
js/games/<game>/config.js  ALL tunable numbers for that game
js/games/<game>/game.js    the game
js/games/<game>/index.js   game definition (name, how-to, options, variants)
js/pages/                  home, records, draw (Pictionary drawing board)
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
