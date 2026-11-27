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

### Base map artwork switch

The same repository publishes a second pyramid on the identical grid: `day`, the in-game pause map, which goes one level deeper (z0–z6, so 2 px/m at native zoom). It is offered as **Base map → In-game** in the rail, with the choice saved in `prefs.baseMap`. Both paths share `TILE_SETS` in `js/map.js`, so only the path segment and `maxLevel` differ.

Default is **Community** (YANIS V18, CC BY 4.0). The in-game option shows Rockstar's own map artwork, mirrored unmodified from the same community repository — the credits strip and `data/credits.json` switch to `© Rockstar Games` while it is active, and no ownership is claimed. Whoever maintains this site should decide whether that default suits them.

Verified: toggling swaps `/yanis,18/` ⇄ `/day/`, `aria-checked` follows, the credits line updates, the choice survives a reload, and no tile request fails in either mode.

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

- The default desktop overview is upscaled: the widest view needs level ~1.4 and the pyramid jumps z1 → z2, so the overview is slightly soft. Zooming in reaches native 1 px/m (community) or 2 px/m (in-game).
- Zoom is whole-level only (`zoomSnap: 1`). Fractional zooms made Leaflet scale the tile layer and open hairline seams between raster tiles; discrete levels are the norm for a tiled map, but wheel zoom is coarser than before.
- Tiles come from a third-party CDN mirror of the gtadb.org repository. If it is unavailable the map falls back to the dark grid and the pins still work.
- All 16 records are `position.method: "estimated"` with 300–500 m accuracy; the UI does not yet surface `position.accuracy` (handoff Task 12), so the pin imprecision is not shown in the detail panel.
- Routes are straight-line estimates, labelled as such in the tooltip.
- iOS < 15 does not support external SVG `<use href="…sprite.svg#id">`; the sprite is still external (handoff Task 1, item 2).
- Not tested on a physical phone, Safari, or Firefox. Bottom-sheet drag gestures were not exercised with real touch input.

## 6. Location data expansion

`data/locations.json` went from 16 to **31 entries**: 14 new records plus the original set, now with `tips` on 20 of them and `code` on 13. New coverage: four safes with published codes (Janjak's Garage `4444`, Cottonmouth Lake trailer `44017`, Watson Bay safehouse `1819`, Nova Auto Junkyard `7777`, Delights Cabaret `2008`), two keypad doors (Black Eagle `789987` door / `031462` safe, Red Apple Orchard `360782`), and unique-weapon or secret finds (Black Eagle Kalinga .50, Dino Golf Brontasaurus Bat, Kingfishers' RV Park Akulus, Ambrosia KVGA-12 'Final Chapter', Gullet Marsh hut with the Akulus revolver + SM-69 sniper). Added a **Secret Missions** category (id `secret-mission`, gold-green pin, new `pin-secret-mission` sprite symbol) with the Skunk Ape side mission and the crab-lab Karkinos storyline.

### Honesty rules applied to this data

- **No invented codes.** Every code comes from a named published guide, and conflicts are recorded in the value rather than resolved by preference: Kingpin Bowling stays `0300 (0300 / 0330 disputed between sources)` and the Palmer warehouse `1886 (1886 / 1887 disputed between sources)`. Tips tell the reader which one to try first.
- **No invented precision.** New records are `position.method: "estimated"` with `accuracy` 700–1500 m, and where a guide names a place but no coordinates the tip says so outright ("Pin is a region-level estimate; the guide names La Perle, not coordinates").
- **Verification tiers reflect the source, not the coordinates.** 30 records are `community` (multiple guides report them); only the player-reported UFO encounter is `estimate`, and its summary says nobody has published a trigger.
- The detail panel now prints the accuracy band under the fields — "Pin is approximate (±1200 m). Use the written directions to find the exact spot." — so a pin never implies GPS precision it does not have.
- Every record carries at least one `sources` entry; the detail panel renders them as links.

### Supporting changes

- `js/data.js` normalisation was silently dropping unknown fields, so `tips` never reached the UI; added `tips` to the normalised shape.
- `js/detail.js` renders a **Tips** list (between "How to find" and rewards), the accuracy note, and now shows the region *label* rather than its id.
- `data/categories.json` gained `secret-mission`; `assets/icons/sprite.svg` gained `pin-secret-mission` (teardrop with an exclamation), so the new category has its own marker instead of falling back to a landmark pin.

Validated: 31 records, no duplicate ids, no unknown category or region references, all records sourced. In the browser: 31 pins and 31 rows, 9 category rows, a coded entry renders its keypad code and 3 tips, a secret mission renders 4 tips and snapshots to the right sheet position.
