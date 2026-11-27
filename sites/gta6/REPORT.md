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

One deployment wrinkle: GitHub Pages caches `data/*.json` for ten minutes, so returning visitors kept getting the old 16-record file after the expansion shipped. `js/data.js` now requests all four data files with `?v=<DATA_V>` — **bump `DATA_V` whenever the JSON changes**, or the cache will hide the edit for up to ten minutes.

## 7. Rare vehicles and the legend mask

`data/locations.json` went from 31 to **45 entries**: 12 vehicles and 2 more secrets, and a new **Rare Vehicles** category (`vehicle`, mint pin, new `pin-vehicle` sprite symbol with a car silhouette). `tips` now covers 35 records.

### Vehicles, and what "agreement" means here

The car data is weaker than the stash data, and the report should say so. Two independent guides (GTA Bay and Flamenco Neon / macetesgta6) agree on the Infernus in the Crosstown police garage, the Tempesta tow-truck event, the Vitello villa and the Banshee outside the Sweetbay Inn; those are the entries worth trusting. Everything else rests on one guide and is tiered `estimate`: the Hellfire at the M7 junkyard, the Drifter Elegy at the Gellhorn raceway, the Belville garage.

Where guides conflict the conflict is preserved in the text instead of being resolved:
- The green Vespucci Island tuner is a "Maibatsu Penumbra FF" to one guide and "a Fast & Furious Eclipse tribute" to another — the record says so and leans on the location, which they agree on.
- The Starfish Island garage is reported as three cars (Vitello, Itali RSX, Dubsta) with a fourth (Furia) on the driveway; the record lists all four rather than picking one.

Two other honesty points: the Emerald/Emerus and both Ambrosia Gauntlets come from a single guide, and every one of these pins is `position.method: "estimated"` at 1000–1500 m — the written directions are the useful part, not the dot. The pin accuracy note in the detail panel says exactly that.

### Two bugs found while adding them

1. **Missing colour tokens.** `css/tokens.css` never gained `--cat-secret-mission` or `--cat-vehicle`, so both categories fell back to the landmark blue (`#7fd1ff`) in the pin and category row. Added both; `tokens.css?v=2`.
2. **The community artwork ships its own legend.** The YANIS tile set includes a full credits/legend poster ("follows, regions, echoes, terrain, bailings, credits, frames reference, interiors") east of the island at world x > 4100. At the widest zoom the viewport is wider than the map bounds, so it appeared as a poster sitting in the ocean. `js/map.js` now adds a non-interactive rectangle in a dedicated `g6mask` pane (z-index 250, above tiles, below markers) covering x 4050…16384, matching the app background. It is cosmetic: nothing in the data lives out there.

### Checks

- JSON: 45 records, no duplicate ids, no unknown category or region, every record sourced, no missing sources.
- Browser: 45 pins, 45 list rows, 10 category rows including "Rare Vehicles", 12 vehicle pins render with the new glyph and the mint colour, filtering to vehicles gives "12 of 45", the Hellfire detail renders 3 tips and its community badge, zero failed requests.
- `node --check js/data.js` and `map.js` parse clean; sprite parses as valid XML with 13 symbols.

## 8. Underwater labs, container cars, pet cemetery and the Halloween wagon

`data/locations.json` went from 45 to **51 entries**: five secrets and vehicles that were missing, plus the five BURG labs folded into one record. `tips` now covers 41 records, `code` 15. `DATA_V` is `5`.

### What was added

| Entry | Category | Region | Why it is here |
|---|---|---|---|
| BURG underwater research labs (five) | easter-egg | Leonida Keys | Five seabed stations under unmarked yellow platforms, one safe, code `80085`, meteorite reward. Three outlets, one with gameplay video. |
| Caliente Picador & Royal Sanchez — container field | vehicle | Grassrivers | Two free vehicles in a container yard north of Grassrivers; bulldozer needed. Two outlets. |
| Blue Drake Penumbra — raceway container | vehicle | Port Gellhorn | Yellow SCOOP container by the raceway building; nitrous fitted; Cut-Off Tool. Two outlets. |
| Muck Spreader Bandito — Hamlet containers | vehicle | Mariana | Dune buggy in the yellow containers on the south side of Hamlet. Two outlets. |
| Pet Cemetery — Grayson | easter-egg | Mount Kalaga | WAiNK Curiosity 19/35 in the woods by SR-73; the `Ghost Trail` / `Turn back` signs are the route. Three outlets, one filmed on PS5. |
| Declasse Ghosts Exposed Parkland — Halloween house | vehicle | Vice City | Ghostbusters-style wagon at Fortuna & Viola in Capri; `Spooked Out` livery. Three outlets. |

### The "Millport" correction

The lead arrived as "five underwater research labs at Millport". That is how one fan map files them, but its own text places the first lab east of Little Hardin Island in Leonard County and the rest off the Keys coast, and the two walkthroughs that list all five put them at Key Lento, Mile Zero Air Station, Little Hardin Island, Wild Hog Point and the Sandbars — none of them at Millport or Lake Tallaloko. The record says so in the tips rather than repeating the mislabel, and names the building each lab sits beside, because the guides do not agree on the facility numbers: one calls the meteorite lab "Facility 1", another numbers it fourth.

### What was deliberately not added

The **Nutbuster**, the yellow Kill Bill Pussy Wagon parody pickup, has no fixed location. The source that documents it files it as "anywhere in the game": it turns up as a random car while you are stealing vehicles for a job, and is then yours to take. A map pin would invent a spot that does not exist, so it is left out until someone publishes a spawn point.

### Honesty notes

- All six records are `position.method: "estimated"`. Four are 800–1500 m and are anchored on a named street, raceway or yard. The pet cemetery is **4000 m** and the tips say plainly that the pin is park-level, because Grayson sits on the Mount Kalaga park edge and no guide publishes coordinates — the written route is the useful part.
- The BURG pin marks the Key Lento station only, because that is the station you must visit first; the tip list carries the other four. One pin for five scattered sites is a compromise, and the record says which site the dot is on.
- Two guide disagreements are recorded instead of silently resolved: the Bandito is "Muck Spreader" to one outlet and "Muxbreeder" to another, and the Grassrivers yard's yellow container may or may not also need the Cut-Off Tool — the tip tells the reader to bring it.
- The zombie-deer tattoo that one player report ties to a cat on the Ghost Trail is flagged as unconfirmed: the outlet that filmed the cemetery walked up in daylight and got neither cat nor tattoo.

### Checks

- JSON parses; 51 records; no duplicate ids; no unknown category, region or county; every record has a hint and at least one source; all six new records carry 4–7 tips.
- `node --check` clean on `js/data.js` and `js/detail.js`.
- Category totals after the change: 16 vehicle, 12 stash, 11 weapon, 7 easter-egg, 2 collectible, 2 secret-mission, 1 activity.
- Not checked: the rendered pins and detail panels were not opened in a browser this round — only the data files and references were validated.

## 9. Two more container finds, and one rejected

`data/locations.json` is now **53 entries**; `DATA_V` is `6`.

### Added

| Entry | Category | Region | Source strength |
|---|---|---|---|
| Annis Pixel Elegy — Capri Construction Yard | vehicle | Vice City | gtabase has a dedicated location page (container at the back of the site, move the portaloo and crate, Cut-Off Tool); Sportskeeda and Wikily's in-game description agree on Capri. |
| Reynolds Kit Car wreck 3 — Wild Hog Point beach | vehicle | Port Gellhorn | IGN, PC Gamer and Push Square all describe the same lone orange container on the west beach, reached from the end of the airstrip. |

Two things are called out in the data rather than glossed over:

- The **Wild Hog Point entry is a scan, not a car**. It is one of the five Reynolds Kit Car wrecks for Wyman's Classic Cars, an **Ultimate Edition** side quest: the player scans the wreck with WAiNK, pays Wyman $1,500 through BuckMe after all five, and only then gets a car. Its summary says so in the first line.
- gtabase marks the Pixel Elegy's security as "modern" and suggests a Key Cloner may be needed, while the other guides treat it as a plain container. The tip tells the reader to bring the cloner rather than asserting either answer.

### Rejected: Vapid Cuban Hermes at "Port Galahad docks"

Not added. The only primary source is a single reader comment on gtabase ("row 25 tier 1 is the clue in the Dock office on a pc … you'll need a telehandler"), which Sportskeeda then reproduces in its list. No guide, video or map has independently confirmed it, and **Port Galahad does not appear on any of the published place lists** — the official-map breakdowns name ten towns (Vice City, Port Gellhorn, Ambrosia, Hamlet, Capri, Belville, Waning Sands, Watson Bay, Key Lento, Southwind) and no Port Galahad, so the report may be a mishearing of Port Gellhorn. A pin would have needed both an unverified car and an invented location, so it stays out until a walkthrough covers it.

### Checks

- JSON parses; 53 records; no duplicate ids; no unknown category, region or county; every record hinted and sourced; both new records carry 6 tips.
- `node --check` clean on `js/data.js`.
- Not checked: rendered pins and detail panels were not opened in a browser; only the data and its references were validated.

## 10. Capri is in Mariana County, and now it sits there

Three records — the Banshee at the Sweetbay Inn, the Ghosts Exposed Parkland and the Pixel Elegy — were filed under `vice-city` / `vice-dale`. That was wrong. Every place list puts Capri on the Gulf coast in **Mariana County**, south of Port Gellhorn where I-404 meets US-183, and their pins sat in Vice City, roughly 8 km from the town.

### Where the coordinates came from

The basemap this project draws (YANIS, gtadb.org) publishes its own landmark dataset: `map/data/6/landmarks.json` in the gtadb.org repository, 4,642 landmarks with **world-metre positions in the same grid the tile pyramid uses**. That is the only coordinate source used here; nothing was eyeballed.

The grid was verified before it was trusted, against anchors this dataset already had:

| Anchor | Landmark dataset | Our existing pins |
|---|---|---|
| Key Lento | −2354, −5532 | −2450, −5600 (≈150 m apart) |
| Vice City (Vice Regal, Washington Beach) | 1409, 2803 | 1200–1600, 2200–2800 |
| Mount Kalaga | −3430, 6371 | −4000, 5800 region focus |

Inside Capri the dataset gives Tortoise Lake at **−6508, 341**, the pier at **−7184, −157**, and a dense street cluster through −6650…−6750, 0…300 for the town centre.

### What changed

- **New region `capri`** in `data/regions.json`: label "Capri", county `mariana`, focus −6680/120 (the town-centre cluster), zoom −2. Regions are only used for the detail panel's label and as jump targets, so adding one needs no code change.
- **Banshee** → `capri`/`mariana`, −6680/120, ±600 m. The dataset has no landmark for the Sweetbay Inn or East Buckley Drive, so the pin is the town centre and the tip says the 3–4 a.m. spawn is the identifier.
- **Ghosts Exposed Parkland** → `capri`/`mariana`, −6508/190, ±300 m, anchored on Tortoise Lake, which the guides name ("just south of Tortoise Lake").
- **Pixel Elegy** → `capri`/`mariana`, −7184/−157, ±400 m, anchored on the Capri pier the yard sits beside.
- The three tips that claimed "Capri is east of Vice City" now say what the place lists say: a Gulf-coast town in Mariana County, south of Port Gellhorn.

### Found while checking: other regions are misplaced too

Matching our pins against the same landmark dataset turned up errors well beyond Capri. These are **not fixed here** — each needs its own landmark-by-landmark pass — but they are recorded so the next pass starts from facts:

| Area | Landmark dataset | Where our pins sit |
|---|---|---|
| Port Gellhorn | ≈ −6350, 2735 (and −6860, 3970 for La Cascara) | 0…500, 1100…1600 — about 6.5 km east |
| Watson Bay | ≈ −5255, −3390 | −2900, −6400 — about 3.5 km out |
| Starfish Island | ≈ 800, 350 | 1100, 2500 — about 2 km north |
| Hamlet | ≈ −2600, −3400 | −1100, −3300 — about 1.5 km east |
| Key Lento, Vice City, Mount Kalaga | matches our pins within a few hundred metres | — |

So the Capri pins now sit correctly relative to the artwork but far from the Port Gellhorn cluster, which is itself in the wrong place. Re-anchoring the Gulf coast, Watson Bay, Starfish and Hamlet records is the obvious follow-up job.

### Checks

- `regions.json` parses with 8 regions; `capri` is referenced by 3 records and every region reference resolves.
- `locations.json` parses; 53 records; no duplicate ids; no unknown category, region or county.
- `node --check` clean on `js/data.js`.
- Not checked: the moved pins were not viewed in a browser this round.
