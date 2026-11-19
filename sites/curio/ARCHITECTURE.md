# Curio Frontend Architecture Revamp

Vanilla JS, no build, single bundle (`sites/curio/assets/app.js`). Goal: keep every feature and every `localStorage` key while making the code testable, accessible, and faster. This is a **logical** modularization inside one file (plus optional lazy chunks) — no bundler.

## 1. Module boundaries (logical, in-file)

Keep one IIFE, but split into named namespaces attached to a single `Curio` object. Order matters; each module is a plain object literal.

```
Curio.core       // utils, dom, events
Curio.store      // state + pub/sub
Curio.router     // hash routing
Curio.data       // api, repos, cache
Curio.research   // wiki + localResearch + loadStory
Curio.ui         // render shell, components, views
Curio.features   // capture, story, backup, notes
```

- `core/utils`: `esc`, `timeAgo`, `fmtDate`, `readMins`, `inputKind`, `searchQuery`, `stripTags`, `sentences`, `splitSections`, `storyTimeline`, `wikitextThreads`, `guessCategory`, `backupTopic`, `planImport`, etc. Pure functions → unit-testable.
- `core/dom`: `$`, `el(tag, props, children)`, delegated event binder `on(root, selector, event, handler)`.
- `store`: single source of truth (see §2).
- `router`: `parseRoute`, `go`, `init`.
- `data/api`: `api(path, opts)` with 401 handling.
- `data/repo`: `LibraryRepo` interface + `ServerRepo`/`GuestRepo`.
- `data/cache`: offline cache for server libraries (new key, see §4).
- `research`: all Wikipedia functions.
- `ui/render`: `render()`, `renderSide()`, `renderList()`.
- `ui/components`: `card`, `toolbar`, `modal`, `toast`, `skeleton`, `empty`.
- `ui/views`: `home`, `library`, `topic`, `discover`.
- `features`: `capture`, `story`, `backup`, `notes`.

## 2. State management

Single store with subscriptions. Preserve the existing `state` shape and keys.

```js
const store = {
  state: { user:null, authChecked:false, route:'home', topicId:null, topics:[], categories:[], guest:loadGuest(), filter:{...}, discover:null, discoverEmpty:false, rediscover:[], capturing:false, stories:{}, storyOpen:new Set(), _progress:null },
  listeners: new Set(),
  get() { return this.state; },
  set(patch) { Object.assign(this.state, patch); this.notify(); },
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  notify() { for (const fn of this.listeners) try { fn(this.state); } catch (e) { console.error(e); } },
};
```

- Mutations go through named actions in `features`/`data` (e.g. `actions.patchTopic`), which update store then persist.
- `prefs` stays a separate small store with its own key (`curio_prefs_v1`) for sync access; mirror into `state.filter` on boot.
- Guest list stays under `curio_guest_v1`. Never rename these keys.

## 3. Rendering

- Shell renders once; `render()` re-renders `#main` + `#side` on route/state change. Keep full `innerHTML` for view switches (acceptable).
- **Keyed list diff** for `#list-host`: build a `Map<id, Element>`; on update, reuse nodes by `data-id`, update text via targeted setters or re-render card innerHTML only when changed (compare a cheap signature). Remove stale nodes. This fixes scroll/focus loss and reduces work on search typing.
- Debounce search input updates to `renderList()` (already does; keep).
- Event delegation: one listener per container instead of per-card `onclick`.
- Reading progress cleanup stays in `detachProgress()`.

## 4. Routing

- Hash router: `#/`, `#/library`, `#/topic/:id`, etc. `parseRoute()` validates against allow-list; unknown → `home`.
- `go(idOrPath)` sets hash; `hashchange` → `render`.
- Encode/decode topic ids (already).
- Add `router.replace()` for silent updates where needed.

## 5. Data layer

- `api()` unchanged (401 → unauth).
- `LibraryRepo` interface: `list()`, `create(input)`, `patch(id, patch)`, `remove(id)`. `ServerRepo` uses `/api/*`; `GuestRepo` uses in-memory + `curio_guest_v1`.
- **Offline cache (new key, additive)**: `curio_cache_v1` stores last server library snapshot `{ v, savedAt, topics, categories }`. On boot, server users hydrate from cache immediately (stale-while-revalidate), then refresh. Never blocks render. Cache write on every successful fetch. Migration: if absent, skip (no error).
- Discover/rediscover follow same pattern (optional cache `curio_discover_v1`).

## 6. Component patterns

- Components are functions returning HTML strings **plus** a `bind(root)` step, or `el()`-based for complex widgets (modals, toast).
- Modals managed by `ui/modal.open(html, bindFn)` with focus trap + ESC + restore focus.
- Toast via `ui/toast.show(msg)`.
- Skeletons for loading states.

## 7. Error handling

- Wrap all async entry points (`capture`, `openStory`, `refreshLibrary`, import) in try/catch; surface via toast + inline status.
- `window.addEventListener('error'/'unhandledrejection')` → toast in dev, console in prod.
- Research errors keep current messages; add retry button in story panel.
- Network failures fall back to cache and show "offline — showing saved copy".

## 8. Loading states

- `capturing` flag drives button disabled + spinner (keep).
- Story load: button "Loading…" + note text (keep).
- Discover: skeletons while `discover === null`.
- Library initial: skeletons until first fetch resolves.
- `aria-busy="true"` on loading regions.

## 9. Code splitting feasibility (single-file constraint)

- **No bundler**, so true splitting requires manual extra `<script>`/`import()` files. Not worth the complexity for this size; recommend keeping one bundle.
- **Logical** splitting via sections + namespaces gives most maintainability benefit without HTTP overhead.
- Optional: move heavy research module to `assets/research.js` loaded with `import()` only on first capture; adds one file but keeps initial parse smaller. Defer until profiling demands.

## 10. Accessibility

- Focus management on route change (focus `#main` or first heading).
- Keyboard: Enter/Space on cards (already Enter); add Space.
- `aria-current="page"` on active nav (already partial).
- Modals: focus trap, ESC, `aria-modal`.
- Form inputs have labels/aria-label (already mostly).
- Color contrast unchanged (CSS).

## 11. Migration plan (preserve features + data)

Phase 0: Snapshot current `app.js` as `app.legacy.js` (backup only, not shipped).
Phase 1: Extract `core/utils` (pure) — no behavior change. Run `node --check`.
Phase 2: Introduce `store` + subscriptions; replace direct `state.*` reads with `store.state.*` gradually (keep `state` alias).
Phase 3: Extract `data/repo` + `research`; keep function names as aliases.
Phase 4: Keyed list renderer in `renderList`.
Phase 5: Offline cache + SWR boot.
Phase 6: Accessibility pass.
Phase 7: Tests + smoke.

Rules: never rename `curio_prefs_v1`, `curio_guest_v1`, backup format (`app:'curio'`, version 2), or topic id scheme. New keys are additive and versioned (`curio_cache_v1`).

## 12. Verification plan

Automated:
- `node --check sites/curio/assets/app.js` (syntax).
- New smoke script `scripts/smoke-curio.mjs` mirroring `smoke-whats-happening.mjs`:
  1. Boot → no `#boot-error`, `#main` non-empty.
  2. Capture "The Fermi paradox" → topic view renders, `#story-btn` present.
  3. Open full story → `#rd-body` has sections.
  4. Navigate library → at least one `.card`.
  5. Search filters list (count changes).
  6. Export → download triggers; import round-trips.
  7. Reload → guest topic persists (`curio_guest_v1`).
  8. Offline: block network → cached library still renders + toast.
- Unit tests for pure functions (`backupTopic`, `planImport`, `filteredTopics`, `sameTopic`, `guessCategory`, `splitSections`) via a node harness that loads utils via `globalThis` (expose `window.Curio` in a jsdom-free eval). Add `scripts/test-curio.mjs`.

Manual:
- Keyboard-only traversal of capture → topic → story → back.
- Screen reader: headings/landmarks announced.
- Mobile viewport (bottom nav, modals).
- Performance: Lighthouse, check list re-render cost on 500 topics.

Acceptance: all existing features work, localStorage keys unchanged, smoke green.