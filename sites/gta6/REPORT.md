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

## 2. Base map tiles

The tile layer described in `HANDOFF.md` does not exist: `map.gtadb.org/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png` returns **404 for every tile**, and it also failed CORS (`crossOrigin: 'anonymous'`, and gtadb sends no `Access-Control-Allow-Origin`).

The real pyramid is documented in the gtadb.org repository's `tiles.py` and is now wired up:

- 256 px tiles on a **±16384 m grid centred on 0,0**; at level `z` there are `2^(z+2)` tiles per side; **z5 is exactly 1 px per metre**, so a world point `(x, y)` sits at pyramid pixel `((x+16384)·2^(z−5), (16384−y)·2^(z−5))`.
- Files are named `<z>/<z>,<y>,<x>.jpg` — note the comma order, not standard XYZ.
- Served from the published repository mirror (`cdn.jsdelivr.net/gh/rolux/gtadb.org@main/maps/tiles/6/yanis,18/…`), per the project's instruction not to fetch live media from gtadb.org. YANIS V18, CC BY 4.0.

The client uses a custom `L.GridLayer` (`BaseTiles` in `js/map.js`) rather than `L.tileLayer`, because the pyramid's origin is offset from `CRS.Simple` (which puts world `(0,0)` at pixel `(0,0)`) and its top level does not exist (the pyramid stops at z5). For each Leaflet tile it computes the covering pyramid tile and crops it with `background-size`/`background-position`, so every zoom — including the upscaled top and the 32 m/px overview — lands in the right place. `minZoom` is `-5` because that is the lowest level the pyramid covers.

Verified alignment: pins sit on their piers, blocks and coastal landmarks, not in open water. Thin straight lines on the artwork are the map's own district/drawing lines — a probe that painted every tile background red showed no gaps between tiles.

Attribution moved to `Map: YANIS V18 · gtadb.org CC BY 4.0` on the credits strip, and `data/credits.json` records the tile set, its author, the licence and the change (client-side cropping only). No coordinates were invented or re-tiered.

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

- The default desktop overview is upscaled: the widest view needs level ~1.4 and the pyramid jumps z1 → z2, so the overview is slightly soft. Zooming in reaches native 1 px/m.
- Tiles come from a third-party CDN mirror of the gtadb.org repository. If it is unavailable the map falls back to the dark grid and the pins still work.
- All 16 records are `position.method: "estimated"` with 300–500 m accuracy; the UI does not yet surface `position.accuracy` (handoff Task 12), so the pin imprecision is not shown in the detail panel.
- Routes are straight-line estimates, labelled as such in the tooltip.
- iOS < 15 does not support external SVG `<use href="…sprite.svg#id">`; the sprite is still external (handoff Task 1, item 2).
- Not tested on a physical phone, Safari, or Firefox. Bottom-sheet drag gestures were not exercised with real touch input.
