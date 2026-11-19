# AGENTS.md

## Scope (read this first)
- Only read and edit the literal root file `showsnew.html`. Treat every other path — `podcast.html`, `shows.html`, `sites/**`, `scripts/**`, `.github/**` — as read-only context, even where the notes below describe them. Don't "helpfully" fix or reformat them.

## What this file is
- Static GitHub Pages site: no `package.json`, no build step. `showsnew.html` is a single ~800 KB plaintext HTML/JS file in the repo; deploy encrypts it with pagecrypt, so the deployed page will not resemble the repo copy.
- Node 20, zero-dependency `.mjs` scripts do sync/verification in GitHub Actions.

## Editing `showsnew.html` (highest risk)
- Keep secret placeholders verbatim: `__TMDB_TOKEN__`, `__FANART_KEY__`, `__OMDB_KEY__`, `__MDBLIST_KEY__`, `__TRAKT_KEY__`, `__TRAKT_SECRET__`, `__LLM_API_KEY__`. Deploy injects all but `__LLM_API_KEY__` (runtime key from Settings/localStorage); leaving that one literal is intentional.
- Three data lines are single-line assignments ending in `;` + newline: `window.PODCAST_CATALOG = ...`, `window.PODCAST_CANDIDATES = ...`, `window.PODCAST_VIEWS = ...`. Each sync script rewrites exactly one line and touches nothing else. Keep the markers unique, keep each assignment on one line, never reformat or duplicate them.
- CI parses those lines as JSON and fails on a missing/duplicated marker, a chart with <10 shows, <8 candidate stories, or a file under 400,000 bytes. Don't collapse or trim the file casually.
- `podcast.html` is a generated artifact; its regenerator (`scripts/fetch-data.mjs`) is not in this repo. `bake-podcast-views.mjs` copies `PODCAST_DATA` / `PODCAST_MONTHLY` from it into `PODCAST_VIEWS`; stale source blocks mean stale views.
- Network failures in the sync scripts keep the snapshot already in the page; don't hand-repair a baked line unless asked.

## CI / deploy gates that affect this file
- `.github/workflows/deploy.yml` runs on push to `main`/`master` or manual dispatch: syntax-checks whats-happening JS and the smoke script, runs `node scripts/check-live.mjs`, runs a Playwright smoke test, injects secrets via `sed`, pagecrypt-encrypts `showsnew.html` (`PAGE_PASSWORD`) and `sites/whats-happening/index.html` (`WH_PAGE_PASSWORD` = `EVENTS`), then deploys the whole repo.
- Required secrets: `PAGE_PASSWORD`, `TMDB_TOKEN`, `WH_PAGE_PASSWORD`. Optional at deploy (features hide themselves): `FANART_KEY`, `OMDB_KEY`, `MDBLIST_KEY`, `TRAKT_KEY`, `TRAKT_SECRET`. `TICKETMASTER_API_KEY` / `YOUTUBE_API_KEY` are for `sync-live` only.
- `node scripts/check-live.mjs [path]` fails on a missing, empty, or >48h-old feed; it accepts an optional path. Both deploy and the daily `feed-watchdog.yml` use it.
- Exact CI checks: `for f in sites/whats-happening/js/*.js; do node --check "$f"; done`, `node --check scripts/smoke-whats-happening.mjs`, `node scripts/check-live.mjs`.
- Smoke test prerequisites: `npm init -y && npm i -D playwright && npx playwright install --with-deps chromium`, then `python3 -m http.server 8099 &` (on Windows use `python -m http.server 8099`), then `node scripts/smoke-whats-happening.mjs http://127.0.0.1:8099/sites/whats-happening/`.

## Other read-only context (don't edit)
- `sites/whats-happening/`: events app. `data/live.json` is the only live source, `data.js` is demo data, `feeds/*.ics` are generated. Sync order: `node scripts/sync-live.mjs` then `node scripts/build-feeds.mjs`. Aborted runs keep the old `live.json` — never delete it.
- `data/health.json` is read by `?diag=1`, but no current script writes it (the sync workflow still `git add`s it); don't assume a sync refreshes it.
- Root `curio/public/` is a stale duplicate; the canonical app is `sites/curio/assets/app.js` + `styles.css`. `sites/curio/ARCHITECTURE.md` and `DESIGN_REVAMP.md` describe a planned revamp, not the current single-IIFE code.
- Tools need ffmpeg/ffprobe on PATH: `node tools/compress-videos.mjs [--dry-run]`, `node tools/upload-posters.mjs <videoId> <poster.jpg>`; `RT_API` overrides the default endpoint.
- Scheduled syncs commit data-only changes, which retrigger the pagecrypt deploy; a data-only push is expected, not a mistake.
