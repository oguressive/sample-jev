# RE:VERSI — Jev Othello

A standalone Japanese Othello experiment. All nonterminal move judgment comes from Jev; TypeScript owns the game rules, factual board summaries, score composition and move selection. There is no external engine or failure fallback. Existing applications and their shared API remain unchanged.

## Run locally

From the repository root, run `npm install`, copy `apps/othello/.env.example` to `apps/othello/.env`, and set the API key in that ignored file. Run `npm run dev:othello:api` and `npm run dev:othello` in separate terminals. Open **http://127.0.0.1:3011** (not localhost, which is a different origin). Without a key the UI, records, import/export and settings work; CPU judgment pauses with an actionable error.

The API binds only to loopback port 8788. Vite proxies `/api` to it. Public hosting is intentionally not configured: add authentication, a same-origin reverse proxy, HTTPS and a persistent per-user spending/rate budget before exposing this paid endpoint. The local process allows 2 concurrent requests and 60 requests/minute globally, a 16KB request body, a 65s request deadline, and no SDK retries. The TypeSafe upstream URL is fixed. Secrets are never requested from the browser or returned in error messages. `VITE_` variables must never contain a key.

## Play and revisit

- Choose one of eight difficulty presets and black, white or random color. Black starts. Legal moves and the last placement are always marked; passes and final scoring follow standard rules.
- Games save after each event to IndexedDB. Settings use localStorage. The home screen resumes the latest unfinished game; the archive can resume any unfinished game. Saving failures remain visible and JSON export works from in-memory state. Wait for “自動保存済み” before closing; an unload warning protects outstanding/failed writes. No client storage can survive every browser eviction, so export important records.
- Undo returns to the preceding human decision and keeps the discarded path. Replay lists all moves and passes, supports scrubbing and 0.5×/1×/2× playback, and makes no inference calls. A branch creates an independent practice game. An archive includes older branches under “待った前・別分岐の履歴”.
- Export JSON includes all branches. Import caps input at 1MB/1,000 events and replays each branch to validate legality; imported games receive a new ID and count as practice. Only canonical record fields are retained. Deletion can be undone until another deletion or reload. Records are local to this origin; use one active tab per game.
- Hints and undo mark a game assisted. Practice, assisted and ordinary results are separate. Highest beaten level uses ordinary wins only; deleting a record changes its statistics.
- After the game, swap colors with one action. “振り返りを分析する” explicitly starts potentially paid analysis of all human decisions, reusing locally cached hints/review results. It shows progress, can be canceled, and labels partial results. The largest difference from Jev's best candidate is an estimate, not an engine-certified blunder.
- Home/game themes are independent (forest, sports, sensual night). No character assets are needed. Sound defaults off; reduced motion follows OS preference and can also be enabled in settings. Buttons have accessible labels, the dialog traps focus natively, and the board supports keyboard activation.

## Evaluation and limits

For every legal candidate, Jev answers one Noul question for estimated win likelihood **P**, plus two five-level Score questions for future move flexibility **M** and extra-turn/pass advantage **T**. Score expectations are divided by four. M/T are normalized quality estimates, not literal counts; Choice confidence is never used as win probability.

The displayed integer is `round(1 + 99 × (wP×P + wM×M + wT×T))`, clamped to 1–100. Weights use empty squares before the move: >40 → .60/.30/.10, >16 → .75/.15/.10, otherwise .90/.05/.05. This is an absolute scale: the best available move need not score 100, and tied best moves are all highlighted. A terminal move has an exact score of win=100, draw=50, loss=1; its P is 1 for a win and 0 otherwise. Known terminal wins take precedence over uncertain scores.

VeryEasy through Ultra sample **only Jev-evaluated candidates** using successively lower softmax temperatures; Goat deterministically selects the highest score. VeryHard and above additionally supply factual counts after every legal opponent reply; hints/review always use this richer fixed profile independently of game difficulty. This is not a search engine or a solved strategy. Difficulty ordering, probability calibration and world-class strength have **not** been established. Goat names an aspirational highest preset.

Each request batches at most 8 moves (24 questions) per upstream call, at most 8 calls for a 64-square board, with an overall deadline. CPU play costs calls every turn; hints add analysis calls. Review can evaluate up to all human turns, so the UI shows its maximum before starting. Actual model, tokens, call count, elapsed milliseconds and question/formula versions appear in the evaluation details. Live speed, cost and strength require a separate explicitly authorized experiment.

Undo, restart, navigation and new sessions invalidate a generation token and abort requests. Before applying a CPU response, the client checks game ID, revision, board key, all legal candidates and finite response values. Late responses cannot change another position. A request may already incur upstream cost before cancellation reaches it.

## Structure and checks

- `src/core/`: pure rules, event-tree records, evaluation arithmetic.
- `server/`: isolated Hono endpoint and official TypeSafe SDK adapter.
- `src/storage.ts`: transactional local persistence and canonical JSON export.
- `src/client.ts`: cancellation gate and runtime API validation.
- `src/App.tsx`, `Board.tsx`, `styles.css`: local UI and original CSS/SVG visual design. No remote fonts, artwork or analytics.

```bash
npm run typecheck --workspace=@sample-jev/othello
npm run test --workspace=@sample-jev/othello
npm run build --workspace=@sample-jev/othello
npm run check
node scripts/harness/check-scope.mjs --policy .harness/othello.json --base origin/main --auto
```

Automated tests use deterministic rule fixtures and mocked official SDK transport, not live Jev. They cover flips/edges, passes/endings, 40 complete playouts, replay/undo/branch/import, weighted scoring, response validation, cancellation generations, input/origin/size validation, safe errors and rate/concurrency gates. See the PR for actual execution results and remaining verification gaps.

Optional browser check: install Playwright with Chromium in your test environment, then run `npm run test:browser --workspace=@sample-jev/othello`. It starts a local Vite server and intercepts every Jev request. `OTHELLO_PLAYWRIGHT` may point to an externally installed Playwright module, `OTHELLO_CHROMIUM` to an existing browser executable, and `OTHELLO_URL` to an already running UI. Screenshots go to `/tmp/othello-screenshots` by default (`OTHELLO_SCREENSHOTS` overrides this). Supply Japanese fonts to a minimal Linux browser environment for readable screenshots. Checks include mobile/desktop layout, actual IndexedDB reload, undo with a delayed CPU response, API retry, replay without inference, branching, review, import/export, rematch, themes, statistics, deletion restore, and quota failure with rescue export.
