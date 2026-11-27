# GTA VI Leonida Map — Build Report

**Date:** 2026-11-27
**Scope:** fix the boot failure (`L is not defined`), get the rebuilt app running in a real browser, and close the outstanding handoff tasks that were blocking normal use.

---

## 1. Why the app showed "Map failed to load"

| # | Defect | Cause | Fix |
|---|--------|-------|-----|
| 1 | `L is not defined` on every load | The Leaflet `<script>` carried a wrong Subresource Integrity hash (`sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV/XN/WLs=`). The browser refused to execute the script, so `window.L` never existed and `G6.map.init()` threw. | Corrected to the real hash of `leaflet@1.9.4/dist/leaflet.js`: `sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=` (verified byte-identical on unpkg, jsDelivr and cdnjs). |
| 2 | "Map failed to load" screen stayed visible even on success | `components.css` gives `#loading` and `#bootError` `display: flex`, which overrides the UA's `[hidden] { display: none }`. Setting `el.hidden = true` had no visual effect. | Added `[hidden] { display: none !important; }` to `base.css`. Also repairs the nav buttons and the file input, which rely on the same attribute. |
| 3 | Most markers off-screen on phones | `minZoom: -4` was above the zoom `fitBounds` needs to fit ~15 000 × 20 000 map units into a 360 px column, so 12 of 16 pins rendered outside the viewport. | `minZoom: -6`. A 360 px viewport now fits at zoom −5.75 with all 16 pins inside the map box. |

## 2. Map tiles

The tile layer described in `HANDOFF.md` does not exist:

- `https://map.gtadb.org/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png` returns **404 for every tile**.
- Those requests also failed CORS because of `crossOrigin: 'anonymous'`; gtadb sends no `Access-Control-Allow-Origin` header.
- The live service is `https://maps.gtadb.org/tiles/<v>/<tilePath>/<z>/<z>,<y>,<x>.jpg`, driven by a per-tile 3D atlas (`tilePaths[v][tileSet][overlay][z][y][x]`, populated from `api.gtadb.org`), with per-zoom tile ranges. It cannot be re-pointed at `CRS.Simple` without that range/origin data, and it is not a plain XYZ raster.

**Decision:** follow the handoff's own fallback (Task 1, item 5) — no remote tile layer. Markers plot on the dark canvas, which now carries a faint 48 px grid (`css/map.css`) so scale and panning remain readable. The credits strip was changed from claiming map imagery to `Coordinates: YANIS V17 · gtadb.org · No map imagery is redistributed`.

No map imagery is hotlinked or redistributed, and no coordinates were invented or re-tiered.

## 3. Handoff tasks closed

- **Task 2 — mobile location list.** `buildLocationList` now feeds both `#locList` (rail) and the new `#mobileLocList` in the bottom sheet through a shared `_buildRows()` helper. `#mobileCount2` is updated alongside `#mobileCount`.
- **Task 3 — detail panel close.** Verified both paths: desktop removes `.detail-open`, mobile clears `#sheetDetailHost`, drops the sheet's `has-detail` class and snaps to `peek`. The sheet's list returns automatically because `has-detail` suppresses `#mobileLocList`.
- **Task 4 — tablet hamburger.** `.mobile-toolbar` is now shown for 760–1099 px as well, and `.map-toolbar` is pushed below it so the two do not overlap. The rail drawer opens over an overlay and closes on overlay click or row selection.
- **Task 5 — progress ring.** Confirmed working: marking one of 16 locations sets `stroke-dashoffset` to 106.311, the label to `6%` and the sub-label to `1 / 16 found`.
- **Task 9 — `_syncCategoryUI`.** Rows now carry `data-cat-id`, so "Clear all" syncs by id instead of DOM index.
- **Task 10 — mobile fullscreen.** `#fullscreenBtnMob` is wired to the same `toggleFullscreen()` handler as the desktop button.
- **Task 14 — this report.**
- Toast now reads the actual location count instead of a hardcoded `16`.

**Not done (deliberately):** Task 13 (deleting the old `gta6.css` / `gta6.js` prototype files) — left in place pending the owner's call; they are not referenced by `index.html`.

## 4. Checks actually run

- `node --check` on all 10 JS files — clean.
- Static server (`python3 -m http.server`), HTTP 200 on `/`, `/js/map.js`, `/data/locations.json`.
- Chrome, 1440×900: Leaflet present, all 11 `G6` modules, 16 markers, 16 rail rows, 8 category rows, count `16 of 16`, rail `display: flex`, boot overlay `display: none`.
- Chrome, 900×820 (tablet): toolbar `display: flex`, hamburger visible, rail at `translateX(-280px)` and `0` after click, overlay `.visible`, map toolbar top at 59 px.
- Chrome, 360×760 (mobile): 16 sheet rows, `mobileCount2` `16 / 16`, opening a row renders the detail title and hides the list, closing restores the list and snaps to `peek`.
- **Console: no errors and no failed requests** across all three viewports after the changes.

## 5. Known limitations

- **No base map imagery** (see §2). The map is a coordinate canvas with grid; the app is fully functional without tiles.
- All 16 records are `position.method: "estimated"` with 300–500 m accuracy; the UI does not yet surface `position.accuracy` (handoff Task 12), so the pin imprecision is not shown in the detail panel.
- Routes are straight-line estimates, labelled as such in the tooltip.
- iOS < 15 does not support external SVG `<use href="…sprite.svg#id">`; the sprite is still external (handoff Task 1, item 2).
- Not tested on a physical phone, Safari, or Firefox. Bottom-sheet drag gestures were not exercised with real touch input.
