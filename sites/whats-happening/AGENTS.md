# AGENTS.md — sites/whats-happening

Static, no-build vanilla-JS events dashboard. Entry point is `index.html`; no bundler, framework, or `package.json`. Repo-level deploy/CI/sync notes live in the root `AGENTS.md`; this file is about this app.

## Load order is the architecture
`index.html` loads plain scripts in this exact order, and later files depend on the globals earlier ones create. Do not reorder, bundle, or convert to ES modules.

1. `data.js` → `window.WHATS` (`CITIES`, `CATEGORIES`, `PEOPLE`, `CHANNELS`, `EVENTS` demo set)
2. `js/core.js` → `window.WH` (state, helpers, `query`/`score`, `icsFor`)
3. `js/views.js` → `window.WHV` (listing/card HTML strings)
4. `js/views2.js` → `window.WHV2` (calendar, watchlist, settings, modals)
5. Decorators/runtime: `js/tile-art.js`, `js/empty-state.js`, `js/location.js`, `js/app.js` (router + event delegation), `js/live-status.js`, `js/new-strip.js`, `js/weather.js`, `js/diag.js`

- `WH.state` is the single mutable model. Views return HTML strings; `app.js` repaints all of `#main` with `innerHTML` on every state change. Never cache DOM nodes across a paint.
- All interaction goes through delegated `click`/`change` handlers in `app.js`, keyed on `data-action`, `data-group`, `data-val`, `data-id`. Add a new `data-action` value and a case in `app.js`; do not attach per-element listeners.
- Decorator scripts mutate the DOM after render and observe `#main`/`#modal` with `MutationObserver`. Wrapping exported `WHV.*` render functions does **not** work — `views.js` calls its own local closures. Follow the DOM-decorator pattern instead.
- Icons: add a path to `PATHS` in `core.js`, then emit `<span data-icon='name'>`; `app.js` fills it at boot.

## Data: demo vs live
- `data.js` `EVENTS` are invented (`source: 'demo'`) and are the offline fallback only. Its header comment about API keys in Settings is stale; Settings intentionally has no key inputs.
- `data/live.json` is the only real feed: `{ generatedAt, sources, events[] }`. `app.js` fetches it with `cache: 'no-store'` and rewrites YouTube `startUtc` into viewer-local `startLocal`.
- `WH.allEvents()` returns the live list when it has any events, otherwise the demo set — never a mix. Use `WH.demoEvents()` when a fixture must be invented (`diag.js` does this).
- Event fields: `id, source, title, description, category, presence, startLocal, startUtc?, duration, venue, cityId, lat, lng, popularity, performers, tags, price, ticketUrl, streamUrl, officialUrl, channel, resort, premiere, timezone, venueCity, image, thumbnail`.
- `startLocal` is venue wall-clock time. Ticketmaster times are intentionally treated as viewer-local; YouTube times carry `startUtc`. `core.js#eventStartInstant` applies the IANA zone when present (demo events have none) — do not "fix" this by treating `startLocal` as UTC.
- `data/health.json` is read by `?diag=1`, but no script in the repo writes it; a sync does not refresh it.
- `feeds/*.ics` are generated from `live.json` by `scripts/build-feeds.mjs`; never hand-edit them. Demo events are excluded and UIDs are stable.

## Persistence
localStorage prefix `wh.v1.`: `saved`, `follows`, `viewed`, `city`, `radius`, `interests`, `online`, `notifPrefs`, `onboarded`, `customCity`, `seenIds`, `lastSeen`; weather uses unprefixed `wxCache`. Fresh-visitor defaults are applied in `views2.js` (all categories on), overriding the placeholder defaults in `core.js`.

## Commands (run from repo root; bash syntax as CI runs it)
- Syntax check (CI runs these): `for f in sites/whats-happening/js/*.js; do node --check "$f"; done` and `node --check scripts/smoke-whats-happening.mjs`.
- Live-feed guard: `node scripts/check-live.mjs [path]` — fails if missing, empty, or >48h old. Keep `data/live.json` committed and fresh; aborted syncs deliberately keep the old file.
- Sync: `node scripts/sync-live.mjs` then `node scripts/build-feeds.mjs` (order matters — feeds are derived from `live.json`).
- Smoke test (needs Playwright + Python; serve over HTTP because `fetch` of `live.json` fails on `file://`):
  - `npm init -y && npm i -D playwright && npx playwright install --with-deps chromium`
  - `python3 -m http.server 8099 &` (Windows: `python -m http.server 8099`)
  - `node scripts/smoke-whats-happening.mjs http://127.0.0.1:8099/sites/whats-happening/`
- In-app integration checks: open `?diag=1`, `#diag`, press Ctrl+Alt+D, or run `window.WHDIAG.run()`. It drives a hidden `?frame=1` copy and reports feed health, filters, reset, online, watchlist, calendar/ICS, map, and boot.

## Editing gotchas (CI/smoke will catch violations)
- Smoke test requires: no `#boot-error`, at least one `#main .card`, the live feed loaded with the demo banner gone, and Settings showing the "Live data" note with zero API-key inputs. Do not reintroduce key fields.
- A bare `.notice` in a listing view is read as the demo banner by the smoke test. `live-status.js` uses `.notice.notice--live`; `new-strip.js` deliberately avoids `.notice` entirely.
- Cards keep the open control and the save button as sibling `<button>`s; nesting them breaks keyboard/assistive-tech behavior.
- Two ICS writers exist: browser `core.js#icsFor` and Node `scripts/build-feeds.mjs`. Both must emit CRLF and fold lines at 75 octets; keep their behavior consistent.
- Deploy pagecrypt-encrypts `index.html` (password `EVENTS`) only. JS/CSS/data stay plaintext, so never put secrets in this folder.
- External services are optional and must degrade quietly: Leaflet (unpkg), Open-Meteo (geocoding + weather), OpenStreetMap tiles, and `picsum.photos` fallback art. A blocked CDN must not break boot.
