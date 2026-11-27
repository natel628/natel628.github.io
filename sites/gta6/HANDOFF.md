# GTA VI Leonida Map — Implementation Handoff

**For:** Next implementation agent (Cline or equivalent)
**From:** Kiro (Cline pass, partial — server verification interrupted)
**Date:** 2026-11-27
**Repo:** `c:\Users\Nathan\Documents\Github\Natel628` (GitHub Pages, `sites/gta6/`)
**Read first:** `SPEC.md`, `AUDIT.md`, `PLAN.md` (includes Kilo UX review in §11)

---

## What has been built

The full application skeleton is in place and all JS files pass Node syntax checks. The local server (`npx serve . -p 8787`) confirmed HTTP 200 on all files. The app has **not** been opened in a real browser and **not** been interactively tested yet — that is the first thing you must do.

### Files created (all new, replacing the old prototype)

| File | Purpose | Status |
|------|---------|--------|
| `index.html` | App shell, DOM skeleton, all `<script>` / `<link>` tags | Written, unverified in browser |
| `css/tokens.css` | CSS custom properties: colours, spacing, z-index, layout vars | Written |
| `css/base.css` | Reset, fonts (Google Fonts CDN: Inter), focus rings, scrollbars, shimmer | Written |
| `css/layout.css` | App grid, rail, map column, detail panel, tablet drawer, mobile bottom sheet | Written |
| `css/map.css` | Leaflet overrides, marker shapes/states, tier outlines, zoom tier classes, cluster, route | Written |
| `css/components.css` | Buttons, search, progress ring, category rows, verify toggle, list rows, detail panel, modal, toast, nav | Written |
| `js/core/dom.js` | `$`, `$$`, `el()`, `on()`, `debounce()`, `focusTrap()`, `toast()` | Written, syntax OK |
| `js/core/geo.js` | V17 coordinate frame constants, `toLatLng`, `fromLatLng`, `distance`, `formatDistance`, `inCrop` | Written, syntax OK |
| `js/core/state.js` | Tiny observable store (`get`, `set`, `subscribe`) | Written, syntax OK |
| `js/core/storage.js` | localStorage wrapper, `loadProgress`, `saveProgress`, v3 migration, export/import validation | Written, syntax OK |
| `js/data.js` | Fetches all 4 JSON files, normalises old schema → new, builds search index | Written, syntax OK |
| `js/map.js` | Leaflet init (CRS.Simple), GTADB tile layer, zoom tier class, scale control | Written, syntax OK |
| `js/markers.js` | `L.divIcon` markers, diff-render, found/selected states, custom pins, position marker, route polyline | Written, syntax OK |
| `js/filters.js` | `computeVisible` (category + verification + hideFound + search), `update` (sets `visibleIds` on state) | Written, syntax OK |
| `js/detail.js` | Builds detail HTML safely (no innerHTML from data), shows in desktop panel or mobile sheet, hides | Written, syntax OK |
| `js/navigation.js` | Set/clear position, set/clear destination, draw/clear route polyline | Written, syntax OK |
| `js/app.js` | Boot sequence, rail UI, category filters, verify toggles, list, toolbar, bottom sheet, credits dialog | Written, syntax OK |
| `data/locations.json` | 16 migrated locations in new schema with estimated V17 coordinates | Written, JSON valid |
| `data/categories.json` | 8 categories with ids, labels, colors, glyphs | Written, JSON valid |
| `data/regions.json` | 7 regions + 5 counties with fly-to focus coords | Written, JSON valid |
| `data/credits.json` | CC BY 4.0 attribution entries for YANIS V17, Landmarks Data, Leaflet, Rockstar disclaimer | Written, JSON valid |
| `assets/icons/sprite.svg` | SVG `<symbol>` sprite: pin-stash, pin-collectible, pin-easter-egg, pin-weapon, pin-landmark, pin-safehouse, pin-activity, pin-shop, pin-custom, pin-position | Written |
| `data/archive/locations-v3.json` | Original 16-record prototype data preserved for reference | Copied |

### Files left in place (old prototype — do NOT use)

- `gta6.css` — old prototype stylesheet, superseded
- `gta6.js` — old prototype script, superseded

These can be deleted once the new build is confirmed working.

---

## What still needs to be done

Work through these in order. Each section is a self-contained task.

---

### TASK 1 — Browser smoke test and console error fixes (HIGHEST PRIORITY)

Open `http://localhost:8787/` in Chrome/Edge/Firefox. Open DevTools → Console.

**Expected on first load:**
- Loading spinner appears briefly, then disappears
- Leaflet map renders (dark background, tiles may or may not load — that's OK)
- Rail appears on the left with 8 category rows, progress ring, search
- "Map loaded — 16 locations" toast appears
- 16 location rows appear in the list

**Known risks that may cause console errors:**

1. **`G6` namespace race condition.** Each JS file does `var G6 = window.G6 || {}` at the top and `window.G6 = G6` at the bottom. If Leaflet hasn't finished loading before `geo.js` runs and calls `L.latLng`, that will throw. The `<script>` tags are in the correct load order in `index.html` (Leaflet first, then core files, then app.js last), but verify no errors appear.

2. **SVG `<use href>` on mobile Safari.** Safari on iOS < 15 does not support external SVG `<use href="file.svg#id">` references. If the target is iOS, inline the sprite SVG into `index.html` as a hidden `<svg>` block at the top of `<body>` and change all `<use href="assets/icons/sprite.svg#...">` to `<use href="#...">`. On desktop Chrome/Firefox this is not needed.

   **Fix if needed:** Add this to the top of `<body>` in `index.html` (after the skip link):
   ```html
   <!-- Inline sprite for Safari compatibility -->
   <!-- paste contents of assets/icons/sprite.svg here, removing the display:none wrapper -->
   ```
   Then in `js/markers.js`, change every `'assets/icons/sprite.svg#pin-'` to `'#pin-'`.

3. **`color-mix()` not supported in older browsers.** `css/components.css` uses `color-mix(in srgb, ...)` for category chip backgrounds. Chrome 111+, Firefox 113+, Safari 16.2+ support it. If you need older support, replace with static `rgba()` values per category.

4. **`100dvh` not supported in very old browsers.** Falls back to `100vh`, which causes the iOS address bar overlap bug. Acceptable for GitHub Pages targeting modern mobile browsers.

5. **Leaflet tile layer with `zoomOffset: 4` on CRS.Simple.** This is the most likely source of a visual bug. CRS.Simple tile coordinate math differs from geographic CRS. At Leaflet internal zoom `-4`, with `zoomOffset: 4`, Leaflet requests tile zoom `0`. The GTADB tile server at zoom 0 returns a 256×256 tile covering the entire map. This should work, but the tile x/y calculation for CRS.Simple may not match GTADB's XYZ scheme. **If the map shows no tiles or wildly wrong tiles:**
   - Remove the `L.tileLayer` call from `js/map.js`
   - Add a dark CSS background to `#map` (already there via `background: var(--g6-bg)`)
   - The app works fully without tiles — markers display over the dark background
   - Optionally add an `L.imageOverlay` using a single low-res overview image

6. **Bottom sheet on mobile.** The sheet drag uses `pointer-events` and `setPointerCapture`. Test on a real phone or Chrome DevTools device mode. The snap logic is in `js/app.js` → `buildBottomSheet`. If snapping feels wrong, adjust the `dy > 60` / `dy < -60` thresholds.

**How to run the server:**
```
cd c:\Users\Nathan\Documents\Github\Natel628\sites\gta6
npx serve . -p 8787
```
Then open `http://localhost:8787/` in a browser.

---

### TASK 2 — Wire the mobile location list into the bottom sheet

**Problem:** The desktop location list uses `<ul id="locList">` inside the rail. On mobile the rail is hidden and replaced by the bottom sheet. The bottom sheet has a `<div id="sheetDetailHost">` for detail but no location list.

**Fix needed in `js/app.js` → `buildLocationList()`:**

Currently `buildLocationList` only populates `#locList` (inside the rail). On mobile (`window.innerWidth < 760`), it should also populate a list inside the sheet body.

Add a second `<ul id="mobileLocList">` to the sheet body in `index.html`:
```html
<!-- inside .sheet-body, after sheetDetailHost -->
<ul id="mobileLocList" class="loc-list" role="listbox" aria-label="Location list"></ul>
```

Then in `buildLocationList()` in `app.js`, after building `#locList`, call the same logic for `#mobileLocList`. The simplest approach: extract the row-building loop into a shared `_buildRows(container, data, state)` helper and call it for both containers.

Also update `#mobileCount2` (in the sheet peek row) to show the visible count — currently only `#mobileCount` (in the mobile toolbar) is updated by `filters.js`. Add `mobileCount2` to the `_updateCount` function in `js/filters.js`:
```js
var mob2 = document.getElementById('mobileCount2');
if (mob2) mob2.textContent = visible + ' / ' + total;
```

---

### TASK 3 — Detail panel close wires both desktop and mobile correctly

**Problem:** `G6.detail.hide()` in `js/detail.js` removes the `.detail-open` class from `.app` (desktop) but on mobile it snaps the bottom sheet to `peek`. However, when `selectedId` is set to `null` via the close button in `buildDetailHTML`, the `onStateChange` handler in `app.js` calls `G6.detail.hide()` — this should work. Verify by clicking a marker, opening detail, then clicking the × close button. Confirm:
- Desktop: right panel disappears, map re-expands
- Mobile: sheet snaps back to peek, detail content clears

If the close does not fire, check that the close button's event listener in `buildDetailHTML` (in `detail.js`) is attaching correctly. The close button calls `G6.state.set({ selectedId: null })` which triggers `onStateChange` → `G6.detail.hide()`.

---

### TASK 4 — Tablet hamburger menu wires correctly

**Problem:** On viewports 760–1099px, the rail is a fixed drawer hidden off-screen. The hamburger button `#menuBtn` is in the mobile toolbar (`<div class="mobile-toolbar">`). But `mobile-toolbar` is `display: none` on desktop and `display: flex` only on `< 760px` (via `css/layout.css` media query).

The tablet range (760–1099px) has no hamburger button showing because `mobile-toolbar` is only shown below 760px.

**Fix needed in `css/layout.css`:** Change the media query for `.mobile-toolbar` to show it at `≤ 1099px`:
```css
@media (max-width: 1099px) {
  .mobile-toolbar {
    display: flex !important;
  }
}
```
And add a `@media (max-width: 1099px)` block that also hides the rail by default on tablet (it already does this via `transform: translateX(-100%)`), and shows the rail overlay.

Also the rail overlay div needs `pointer-events: auto` when `.visible`:
```css
.rail-overlay.visible { display: block; pointer-events: auto; }
```

---

### TASK 5 — Progress ring SVG `stroke-dasharray` fix

The progress ring in `css/components.css` sets `stroke-dasharray: 113` (which is `2π × 18 ≈ 113.1`). The ring SVG `<circle>` has `r="18"`. The `updateProgressRing` function in `app.js` sets `stroke-dashoffset` directly. This is correct.

**Verify:** Mark a few locations as found. The ring arc should grow. If it does not animate, check that `#progressRingFill` exists in the DOM and that the `style.strokeDashoffset` property is being set. The SVG circle needs `transform: rotate(-90deg)` applied — this is in `css/components.css` as `.progress-ring { transform: rotate(-90deg); }`. Confirm it is on the outer `<svg>`, not the `<circle>`.

---

### TASK 6 — Verification filter segmented buttons visual sync

The verify toggle buttons in `#verifyToggleGroup` are built by `_buildVerifyToggle()` in `app.js`. Each button's `aria-checked` is set on click. The CSS in `components.css` styles `[aria-checked="true"]` with a coloured left border via `--tier-color`.

**Problem:** The `--tier-color` variable is set via `btn.style.setProperty('--tier-color', tier.color)` in JS. Confirm in DevTools that the CSS variable is being applied to the button element (inspect the button, check Computed > `--tier-color`). If not, the border highlight won't show. This is the standard way to set a CSS custom property via JS on an element and should work.

---

### TASK 7 — Leaflet scale control `metersPerUnit`

`js/map.js` creates `L.control.scale({ metric: true, imperial: false })`. Leaflet's built-in scale control with `CRS.Simple` does not automatically use `metersPerUnit` — it uses the raw CRS units. Since 1 unit ≈ 1 metre in the V17 frame, the scale will be close but not labelled with real-world units unless Leaflet is told.

Leaflet 1.9.4 does not have a `metersPerUnit` option on `L.control.scale`. The scale control with `CRS.Simple` will show units as "px" or just the raw number.

**Fix:** Create a custom scale control or override the label. The simplest approach: after `L.control.scale(...).addTo(_map)`, override the `_updateMetric` method on the scale control instance to append "m" / "km" labels:
```js
var scale = L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 100 });
scale.addTo(_map);
// CRS.Simple: 1 unit ≈ 1 metre per AUDIT.md §8.3
var origUpdate = scale._updateMetric.bind(scale);
scale._updateMetric = function(maxMeters) {
  origUpdate(maxMeters); // sets the bar width
  // The label is already set by Leaflet as "X m" or "X km" using the pixel distance
  // but CRS.Simple gives pixel units. Multiply by metersPerUnit (1.0) = same value.
  // No change needed if scale appears as metres already.
};
```
In practice, test whether the scale shows sensible numbers. If it shows "1000 px" at a zoom where 1 km should be visible, the bar is broken — in that case, hide it and add a static text note.

---

### TASK 8 — `detail.js` uses `G6.dom.el()` before it's defined in one path

In `detail.js`, the `_field()` helper calls `G6.dom.el(...)`. This is correct since `dom.js` loads before `detail.js`. But the `buildDetailHTML` function also uses a local `_el()` helper (defined within the IIFE). There are two `_el` definitions — one local to the detail IIFE and one in `dom.js` via `G6.dom.el`. The local one is used for most elements; `G6.dom.el` is called only in `_field()`. This inconsistency is not a bug but should be cleaned up.

**Fix (optional cleanup):** Remove the local `_el()` function and replace all calls with `G6.dom.el()`. Or keep the local one and remove the `G6.dom.el` call in `_field()`. Either is fine — just be consistent.

---

### TASK 9 — `app.js` `_syncCategoryUI` does not work correctly

The `_syncCategoryUI` function in `app.js` tries to sync category row classes after a "Clear all filters" action. The current implementation iterates rows by DOM index (matching `categories[i]`), which works as long as the rows were appended in category order. This is fragile.

**Fix:** Add a `data-cat-id` attribute to each `.cat-row` in `_buildCategoryFilters`:
```js
row.setAttribute('data-cat-id', cat.id);
```
Then in `_syncCategoryUI`:
```js
function _syncCategoryUI(categories, activeCats) {
  categories.forEach(function(cat) {
    var row = document.querySelector('[data-cat-id="' + cat.id + '"]');
    if (!row) return;
    var active = !activeCats || activeCats.indexOf(cat.id) !== -1;
    row.classList.toggle('disabled', !active);
    row.setAttribute('aria-checked', String(active));
  });
}
```

---

### TASK 10 — Mobile toolbar fullscreen button is not wired

`index.html` has `id="fullscreenBtnMob"` in the mobile toolbar but `js/app.js` → `buildToolbar()` only wires `#fullscreenBtn` (the desktop toolbar button). Wire `#fullscreenBtnMob` with the same handler.

**Fix in `app.js` → `buildToolbar()`:**
```js
var fsBtnMob = document.getElementById('fullscreenBtnMob');
if (fsBtnMob) {
  fsBtnMob.addEventListener('click', function() {
    var el = document.documentElement;
    if (!document.fullscreenElement) {
      (el.requestFullscreen || el.webkitRequestFullscreen || function(){}).call(el);
    } else {
      (document.exitFullscreen || document.webkitExitFullscreen || function(){}).call(document);
    }
  });
}
```

---

### TASK 11 — Destination clearing when selected location changes

When a user sets location A as destination, then opens location B's detail and clicks "Set as Destination", the old route to A should be cleared and a new route to B drawn. The current `G6.navigation.setDestination(locId)` in `navigation.js` calls `G6.state.set({ destination: locId })` and then `_updateRoute()`. This correctly replaces the old destination.

**But:** the "Set as Destination" button in `detail.js` calls `G6.navigation.setDestination(loc.id)` and then `G6.detail.showById(loc.id)` to re-render the button state. After re-render the button should read "Destination set". Verify this works — if the state change triggers `onStateChange` which triggers `showById` anyway, there may be a double render. The double render is harmless but should be checked.

---

### TASK 12 — `data/locations.json` coordinate accuracy notice

All 16 location coordinates are `"method": "estimated"` with `"accuracy"` values of 300–500 metres. The detail panel verification badge for `estimate` tier shows "◌ Unverified / estimated" with a tooltip. But the coordinates themselves are estimated even for `community`-tier locations (which have cited sources but not GPS-precise positions).

The current schema stores `verification` (source trustworthiness) separately from `position.method` (coordinate precision). The detail panel only shows `verification`. It should also surface `position.method` and `position.accuracy` so users know the pin may be 300–500 m off.

**Fix in `detail.js` → `buildDetailHTML()`:** After the tier badge, if `loc.position.method === 'estimated'`, add a small inline note:
```js
if (loc.position.method === 'estimated') {
  var accNote = _el('p', '');
  accNote.style.cssText = 'font-size:.68rem;color:var(--g6-muted);margin-top:var(--sp-1)';
  accNote.textContent = 'Pin position is approximate (±' + loc.position.accuracy + '\u202fm). Verify in-game.';
  body.appendChild(accNote);
}
```

---

### TASK 13 — Old files cleanup

Once the new build is verified working in browser, delete:
- `sites/gta6/gta6.css` (32 KB — old prototype stylesheet)
- `sites/gta6/gta6.js` (43 KB — old prototype script)

Do **not** delete `data/archive/locations-v3.json` — it's the preserved original data.

---

### TASK 14 — REPORT.md

After all tasks above are verified, write `sites/gta6/REPORT.md` per SPEC.md step 4 (OpenCode review). It should cover:
- All changed files and what they do
- Features implemented and tested
- Known limitations (estimated coordinates, remote tiles dependency, no tile build script run yet)
- Every check actually run

---

## Architecture quick-reference

```
sites/gta6/
├── index.html            App shell. Load order: Leaflet → core/* → data/map/markers/filters/detail/navigation/app
├── css/
│   ├── tokens.css        All CSS custom properties. Edit this for colour/spacing changes.
│   ├── base.css          Reset + Google Fonts Inter CDN + focus rings + scrollbars
│   ├── layout.css        Grid, rail, map column, detail panel, tablet drawer, mobile sheet
│   ├── map.css           Leaflet overrides + pin shapes/states + tier outlines + zoom tiers
│   └── components.css    Every UI component: buttons, filters, list rows, detail, modal, toast
├── js/
│   ├── core/dom.js       DOM helpers. No dependencies.
│   ├── core/geo.js       Coordinate math. Requires Leaflet (L.latLng).
│   ├── core/state.js     Observable store. No dependencies.
│   ├── core/storage.js   localStorage. No dependencies.
│   ├── data.js           Fetch + normalise JSON. Requires dom.js (indirectly).
│   ├── map.js            Leaflet init. Requires geo.js, Leaflet.
│   ├── markers.js        Marker render. Requires geo.js, map.js, state.js.
│   ├── filters.js        Filter logic. Requires state.js.
│   ├── detail.js         Detail panel. Requires dom.js, state.js, storage.js, map.js, navigation.js.
│   ├── navigation.js     Position/destination/route. Requires geo.js, map.js, markers.js, state.js, storage.js, dom.js.
│   └── app.js            Boot + UI wiring. Requires everything above.
├── data/
│   ├── locations.json    16 locations, new schema (gta6.locations/1), estimated V17 coords
│   ├── categories.json   8 categories with colours
│   ├── regions.json      7 regions + 5 counties with fly-to focus coords
│   ├── credits.json      CC BY 4.0 attribution entries
│   └── archive/
│       └── locations-v3.json  Original prototype data (preserved, not used)
└── assets/
    └── icons/sprite.svg  SVG symbol sprite, 10 symbols (pin-stash … pin-position)
```

## Global namespace

All modules attach to `window.G6`:
```
G6.dom       — DOM helpers
G6.geo       — coordinate math
G6.state     — observable store
G6.storage   — localStorage
G6.data      — data loading
G6.map       — Leaflet map
G6.markers   — marker layer
G6.filters   — filter logic
G6.detail    — detail panel
G6.navigation — position/route
```

## Coordinate system

- **CRS.Simple**, 1 unit ≈ 1 metre
- Leaflet bounds: `[[-9000, -11000], [11000, 4000]]`  (`[[yMin, xMin], [yMax, xMax]]`)
- Marker placement: `L.marker([y, x])`  — y first, x second (Leaflet lat/lng convention)
- All conversion in `js/core/geo.js` only — no coordinate math anywhere else

## Map tiles

- Source: GTADB.ORG YANIS V17 nocams/dark, CC BY 4.0
- URL: `https://map.gtadb.org/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png`
- `zoomOffset: 4` — Leaflet zoom -4 → tile z 0, Leaflet zoom 0 → tile z 4
- If tiles fail to load: app still works, markers show on dark background
- A local tile build (see PLAN.md §2.3) would eliminate the remote dependency but has not been run

## Key design decisions already made (do not reverse)

1. No build step, no npm, no frameworks — vanilla JS, Leaflet CDN, Google Fonts CDN
2. SVG sprite via `<use href="assets/icons/sprite.svg#...">` — requires HTTP server (not file://)
3. Detail panel opens as a 3rd grid column on desktop (not a floating overlay)
4. Bottom sheet on mobile with 3 snaps: peek 72px / half 45dvh / full 85dvh
5. Marker shapes: diamond = stash/weapon, shield = safehouse/activity, teardrop = everything else
6. Three verification tiers: `official` (gold border), `community` (light border), `estimate` (dashed amber)
7. `G6.state` is the single source of truth — all UI reads from it, never from DOM
8. Progress saves to `gta6:progress:1` in localStorage on every change

## Do not

- Commit, merge, or push to GitHub without user approval
- Delete `data/archive/locations-v3.json`
- Use `innerHTML` with any user-supplied or data-derived string (use `textContent` or safe DOM methods)
- Add React, Vue, bundlers, or npm packages
- Use `gta6.css` or `gta6.js` (old prototype files, superseded)
