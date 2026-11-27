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

## 11. The rest of the map now sits where the basemap says it does

Capri was correct after §10, but it was the only region that was. Matching every pin against the same
gtadb.org landmark dataset (`map/data/6/landmarks.json`, 4,642 landmarks, world metres) found nine
records 5.7–6.6 km east of Port Gellhorn, two Watson Bay records 3.1 km away in Key Lento, the Starfish
Island garage 1.8 km north on Vice Beach, and the Hamlet container car 2 km east of Hamlet. They were all
placed by region, not by landmark. This pass moves them, and every other record whose own text names a
place the dataset knows, onto that landmark. **24 records moved; `DATA_V` is now `8`.**

### The method, and where it stops

1. **Exact name match first.** Every record title and hint was searched against the landmark labels.
   Nineteen of the moved records land on a landmark with the same name or a name their own hint uses:
   La Cascara Motel, Delights, the raceway, Boone Speedway, the Starlet Motel, Wild Hog Point, Vercetti
   Estate, Sunrise RV Park, Cottonmouth Lake, Permit Keys, Wetman Bay, Bobcat Bight, Apollo Aggregates,
   the Pegassi Residences, Red Apple Orchard, Pawn & Gun, Bobcat Key's south cove and the trailer park.
2. **Directional landmark, then the town.** Where the guide names a landmark but gives no coordinates, the
   pin sits on that landmark and the tip says so (Brooks Boatworks → the northern rail bridge towards
   Draper Island; the Penumbra container → the raceway's covered grandstands). Where the guide names only
   the town, the pin sits on the town's own landmark and the tip says that too (Nova Auto Junkyard →
   Hamlet Water Tower).
3. **Nothing invented.** No pin was nudged to "look better". Two records share an anchor because the
   guides place both by it: Bandito and Hellfire at Boone Speedway, with Hellfire offset 90 m east along
   the guide's "east of the speedway" line so the two pins do not stack exactly.

### What moved

| Record | Cat. | Region | Old pin | New pin | Moved | Anchored on |
|---|---|---|---|---|---|---|
| Apollo Aggregates warehouse | stash | vice-city | -800, -3200 | -1837, -2876 | 1.09 km | Apollo Aggregates, Peregrine Bay — region moved from mariana |
| Kingpin Bowling safe | stash | port-gellhorn | 350, 1100 | -6350, 3367 | 7.07 km | Pawn & Gun, US-9 |
| Brooks Boatworks | stash | port-gellhorn | 200, 1600 | -6768, 5041 | 7.77 km | northern rail bridge to Draper Island |
| La Cascara Motel | weapon | port-gellhorn | -50, 1300 | -6860, 3970 | 7.31 km | La Cascara Motel |
| The couch in the tree | weapon | port-gellhorn | 450, 1200 | -6799, 3947 | 7.75 km | Trailer Park |
| Delights Cabaret office safe | stash | port-gellhorn | 250, 1450 | -6373, 3577 | 6.96 km | Delights, Interstate 404 |
| UFO abduction on the back road | easter-egg | port-gellhorn | 600, 1500 | -5366, 3476 | 6.28 km | Starlet Motel, Historic Route 628 |
| Annis Drifter Elegy — Qwick-Fix | vehicle | port-gellhorn | 500, 1500 | -6733, 2325 | 7.28 km | Gellhorn International Raceway |
| Blue Drake Penumbra — container | vehicle | port-gellhorn | 560, 1560 | -6769, 2105 | 7.35 km | Covered Grandstands, raceway |
| Reynolds Kit Car wreck 3 | vehicle | port-gellhorn | -350, 1050 | -7563, 3277 | 7.55 km | Wild Hog Point |
| Watson Bay safehouse | stash | leonida-keys | -2950, -6500 | -5887, -2687 | 4.81 km | Bobcat Creek, W side of Watson Bay |
| Palmer Fishing Warehouse | stash | leonida-keys | -2900, -6400 | -6408, -2478 | 5.26 km | Cove, Bobcat Key |
| Starfish Island garage | vehicle | vice-city | 1100, 2500 | 906, 661 | 1.85 km | Vercetti Estate |
| Muck Spreader Bandito | vehicle | mariana | -1120, -3180 | -3092, -3376 | 1.98 km | Boone Speedway, Hamlet |
| Gauntlet Hellfire — M7 junkyard | vehicle | mariana | -1100, -3300 | -3000, -3376 | 1.90 km | Boone Speedway +90 m east |
| Nova Auto Junkyard safe | stash | mariana | -1500, -3400 | -2982, -3084 | 1.52 km | Hamlet Water Tower |
| Pegassi Toros — Residences | vehicle | vice-city | 1450, 2350 | -4, -959 | 3.61 km | Pegassi Residences North Tower |
| Permit Keys wrecks | weapon | leonida-keys | -3100, -7200 | -5774, -6360 | 2.80 km | Permit Keys |
| Wetman Bay fishing shacks | weapon | grassrivers | -2800, -5100 | -4381, -4770 | 1.62 km | Wetman Bay |
| Glider in the treeline | weapon | mariana | -2200, -5900 | -7240, -1322 | 6.81 km | Bobcat Bight |
| Kingfishers' Sunrise RV Park | weapon | grassrivers | -2400, -4300 | -3477, -4497 | 1.09 km | Sunrise RV Park |
| Red Apple Orchard garage | activity | port-gellhorn | -2600, -4600 | -5831, 5269 | 10.38 km | Red Apple Orchard, Kelly County — region moved from grassrivers |
| Pet Cemetery — Grayson | easter-egg | mount-kalaga | -3900, 5600 | -5649, 6793 | 2.12 km | Grayson — accuracy 4000 → 1000 |
| Cottonmouth Lake trailer | stash | mariana | -2300, -4700 | -3480, -4788 | 1.18 km | Cottonmouth Lake |

### Region and county corrections that came with it

- **Apollo Aggregates** is a plant in **Peregrine Bay, Vice City**, not a Mariana County site; the record
  was filed `mariana`/`mariana` and is now `vice-city`/`vice-dale`. Its hint ("east / south-east of
  Hamlet") still reads true from the new pin — 850 m east and 330 m north of Hamlet.
- **Red Apple Orchard** is in **Kelly County**, north-west of Port Gellhorn, not in Grassrivers; the
  record was filed `grassrivers`/`mariana` and is now `port-gellhorn`/`kelly`. Its hint names no place at
  all, which is how it drifted — the only Red Apple Orchard on the basemap is now the pin.
- `data/regions.json`: the `port-gellhorn` focus still pointed at Rialto Islands (300, 1300), the old wrong
  spot, so it moved to **-6500, 3800** (the town centre). Nothing reads `focus` yet — `js/detail.js` uses
  only the region label — but the stale target was a trap for the next feature that does.

### Pins that are still more than a kilometre off its landmark

These are **flagged, not moved**, because moving them would mean inventing the place:

| Record | Pin | What the guide says | Why it stays |
|---|---|---|---|
| Dog Island — jet-ski dog | -2700, -6500 | "the island south of Bobcat Key" | The nearest Bobcat Key landmark is **5.5 km** away. There is no Dog Island landmark on the basemap, so the pin is still in Key Lento. The most likely true spot is the water south of Bobcat Key around -6300, -2900. |
| Meteorite at Hillside Campsite | -4200, 5800 | "east side of Mount Kalaga park, near Hillside Campsite SW of Dawson Dam" | **1.67 km** from Dawson Dam and there is no Hillside Campsite landmark. The park is 1.5 km across and the guide's only anchor is the dam, so the pin was left where the trail description puts it. |
| Dino Golf — Brontasaurus Bat | -2450, -4400 | "Dino Golf at Frogswater, off SR-32" | The basemap has **no Frogswater and no SR-32**; the nearest landmark is 291 m away but unrelated. Unverifiable rather than wrong. |
| BURG underwater labs | -2050, -5750 | "east of Key Lento" | **917 m** from the basemap's single "Underwater Research Station" — inside a kilometre, and that station may be one of the other four labs, so the pin stays on the Key Lento entry station as documented. |
| Black Eagle warehouse | 900, 1800 | no address in any guide | 89 m from Vice Beach landmarks but the building itself is unidentified; the record already says the pin is region-level. |
| Search for the Skunk Ape | -2900, -4900 | an area, not a spot | 271 m from Gullet Marsh landmarks; the record is deliberately an area pin. |

Three further records sit **just inside** the kilometre line and were checked rather than moved:
the Vespucci Island tuner and the Vespucci Mansion Emerus are 929 m and 980 m from the Rialto Islands
their hints name (both pins are on Vice Beach, and the basemap has no Vespucci Island at all), and the
Vitello villa is 797 m west of the Waning Sands cluster.

One record looks off by the town test but is not: **Manatee Motel** is 1,083 m from Hamlet, and its hint
puts it there deliberately — "south-west of Hamlet on the eastern edge of the Gullet Marsh, north-east of
Cottonmouth Lake". Measured against the places it actually names, it is where it should be.

### Checks

- `data/locations.json` parses; **53 records**; no duplicate ids; every `region` and `county` resolves
  against `regions.json`; every record has a hint and at least one source.
- All 24 moved pins are **0–92 m** from the landmark named in the table above.
- No duplicate coordinates except the pre-existing `crab-outpost-pelican-valley` / `crab-lab-karkinos`
  pair, which are the same outpost described twice and were left alone.
- `node --check` clean on `js/data.js`, `js/detail.js` and `js/map.js`; `data/regions.json` parses with
  8 regions; `DATA_V` bumped to `8` with `js/data.js?v=8` in `index.html`.
- Tips went from 137 to 153; 48 of 53 records now carry tips (was 43). A pin note naming the anchor was added to all 24 moved records.
- Not checked: the moved pins were not viewed in a browser this round; only the data and its references
  were validated.

## 12. Easter eggs from the GTABase map

`data/locations.json` is now **76 records**, 30 of them easter eggs, after 23 new ones taken from the
GTABase interactive map (gtabase.com/gta-6/map). `DATA_V` is `9`.

### How the data was read

The page is server-rendered but its markers are a separate obfuscated asset
(`images/gta-6/maps/gtab-map/markers.js`). The obfuscation is a 62-character substitution over
`0-9A-Za-z` that the site's own `map.js` reverses before `JSON.parse`; replaying it offline gave
**6,510 markers**, of which **121** are in the `easter-egg` category — each with an id, a name, a
description, a photo flag and an `x`/`y` pair.

### Their coordinate frame is ours

Before using a single coordinate the frame was checked against landmarks this map already had:

| Place | GTABase | This map (GTADB landmarks) | Difference |
|---|---|---|---|
| La Cascara Motel | -6861, 3959 | -6860, 3970 | 11 m |
| Pawn & Gun, Port Gellhorn | -6342, 3368 | -6350, 3367 | 8 m |
| Boone Speedway | -3086, -3362 | -3092, -3376 | 15 m |
| Sunrise RV Park | -3478, -4490 | -3477, -4497 | 7 m |
| Mount Kalaga | -3430, 6371 | -3430, 6371 | 0 m |

Same metres, same origin, so nothing had to be eyeballed and no conversion was needed.

### What was added

| Record | Pin | Tier |
|---|---|---|
| Exploding beached whale | -7198, 1433 | community |
| Fountain of Youth | -6839, -63 | community |
| Bugstar van and fumigation tent | -6666, -87 | estimate |
| Possessed-Lucia factory | -6604, 508 | estimate |
| Disco toilet | -6440, -1876 | community |
| Leviathan graffiti | -6377, -6232 | community |
| Satan at the biker campfire | -6337, 4373 | estimate |
| Four Horses monument | -5860, 5524 | community |
| Satanic room — Benson Real Estate | -5702, 6793 | community |
| Burning house | -5571, 6868 | community |
| Ghost cat | -5517, 6871 | community |
| Super Mario question block | -4082, 7391 | community |
| Mineshaft carcasses | -3931, 7881 | estimate |
| Moreau fire watchtower | -3794, 7781 | estimate |
| Hyde Island kidnap | -2550, 8459 | estimate |
| Cloned bodies bunker | -1906, 8384 | community |
| Hillside bunker — door code 3612 | -1799, 8522 | community |
| Scarface chainsaw scene | 1931, 398 | community |
| Haunted Marbelle Hotel | -648, 677 | community |
| Piano playing old GTA themes | 553, 1400 | community |
| Dolores the snake | -2357, -5520 | community |
| Michael De Santa's boat | -2349, -5550 | community |
| Grove Street cul-de-sac | -2899, -3345 | community |

Every one carries its own summary, hint and tips written here — no GTABase wording is reproduced, because
that text is theirs. Each record links back to its exact marker, and `data/credits.json` gained an entry
for the source. **Tier follows evidence:** the 17 whose marker has a photo are `community`, the 6 that are
description-only are `estimate`.

### What was deliberately left out

98 of the 121 were not added, in four groups:

- **Already on this map** — their Halloween house with the Ghostbusters wagon (our Ghosts Exposed
  Parkland), Dexter's Apartment, the Grayson zombie-deer sighting, and their crab lab, which our
  `crab-outpost-pelican-valley` / `crab-lab-karkinos` records already cover.
- **One joke, twelve pins** — the `#NoFlushers` QR chain appears 12 times (posters, flyers, bathroom
  codes). Adding them all would fill the map with the same gag.
- **One puzzle, four pins** — Vice City Portal Steps 1–3 plus Final Step are a single chain, better as one
  record than four.
- **Not enough to write honestly** — several markers have no description at all (for example *Killer
  Whale* at 84, -1621) or a line that never says how to find the thing. Those stay in the backlog rather
  than becoming a pin with invented directions.

### Found while cross-checking: the crab lab disagrees

GTABase puts the abandoned Pelican Valley lab — power/code puzzle, safe code **0072** — at
**-3962, -4104**. Our two crab records sit at **-2600, -5200**, about **1.6 km** away, and describe the
same place. One of the two is wrong; it is flagged here rather than moved, because neither position has
been checked against the artwork yet.

The Dog Island flag from §11 gained a third data point: GTABase has *Cool Dog* at **-3088, -5776** and a
separate *Hidden Dog Island* at **-6623, 6796** (their text puts it on a beach north of the Zephyr
Islands). Neither matches our pin at **-2700, -6500**, so that flag stands.

### Checks

- `data/locations.json` parses: **76 records**, 30 easter eggs, no duplicate ids, every `region` and
  `county` resolves, every record has a hint and at least one source.
- `node --check` clean on `js/data.js`, `js/map.js` and `js/markers.js`; `data/credits.json` parses with
  its new entry; `DATA_V` bumped to `9` with `js/data.js?v=9` in `index.html`.
- Two pin pairs sit within 40 m: the pre-existing `crab-outpost-pelican-valley` / `crab-lab-karkinos`
  pair (0 m) and the new Dolores / Michael's boat pair (31 m, adjacent in the source too).
- Not checked: the new pins were not opened in a browser this round.
### Which ones were left out

Two of the 453 published markers are duplicates of a marker four metres away, so each pair became one
record:

| Dropped | Kept | Why |
|---|---|---|
| Hidden package *Weed (ruins)*, -4073, 7397 | *Weed on the pallet by the ruins*, -4077, 7398 | Same crate: one marker calls it the pallet behind the yellow box, the other the weeds near the meditation spot. |
| Meteorite *Gellhorn International Raceway*, -7360, 1681 | *Meteorite inside the beached whale*, -7356, 1682 | Same fragment on the raceway beach; one marker writes it up through the whale, the other through the two trees beside it. |

Nothing was dropped for already being on the map: the closest curated records are 5 m and 12 m away and are
different things (an acid stash beside *The couch in the tree* weapon; the Hamlet stunt jump beside a stash
crate). The crab-lab contradiction from §12 is untouched.

## 13. Hidden packages, meteorites, stunt jumps and knife flights

The same GTABase payload behind §12 also carries the collectible and challenge layers. All four were
imported whole, with the pins taken straight from the published coordinates — the frame was already proven
to be ours in §12, so nothing was re-projected or nudged.

| Layer | Published | On the map | Tier split |
|---|---|---|---|
| Hidden packages | 147 | **146** | 114 community, 32 estimate |
| Meteorite fragments | 136 | **135** | 120 community, 15 estimate |
| Stunt jumps | 130 | **130** | 92 community, 38 estimate |
| Knife flights | 40 | **40** | 40 estimate |

That is **451 new pins**; the map now holds **527 records** in total (76 curated in `data/locations.json`,
451 bulk pins in the new `data/collections.json`). `DATA_V` is `10`.

### Where the records live

`locations.json` still holds only the hand-researched places. The bulk layers went into
`data/collections.json`, which `js/data.js` fetches alongside it and concatenates after the curated
records, so the curated entries keep their order in the list, the search index and the detail panel. Both
files ride the same `?v=` cache-buster.

Four categories were added so the layers can be filtered apart instead of piling into *Collectibles*:

| Category | Colour | Pin |
|---|---|---|
| Hidden packages | `#e5c15a` gold | teardrop with a parcel |
| Meteorite fragments | `#ff7a59` coral | teardrop with a cratered rock |
| Stunt jumps | `#3fd0a0` green | shield with a ramp arrow |
| Knife flights | `#8fa4ff` periwinkle | shield with a dart |

Each got its own `categories.json` entry, `--cat-*` token and sprite symbol.

### Wording

Every name, hint and summary was written for this map. Hidden packages and meteorites were paraphrased
from the one-line descriptions that ship with each marker (which way to look, which container, what the
loot is worth); stunt jumps and knife flights carry only a place name at the source, so those records say
what the place is and how the challenge works rather than inventing a direction. Sixteen markers publish
no description at all — those say so in the hint instead of guessing. Two records carry a tip explaining
the duplicate pairs above.

Each record links to its own marker (`?feature=hidden-packages#hidden-package-016` and the like), and
`data/credits.json` gained a *Collectible and challenge positions* entry. Positions are stored with
`"method": "reported"` and an accuracy of 40 m where the marker has a photo, 250 m where it does not.

### Region and county

Neither field is published with the markers. Each pin was assigned the town of its nearest GTADB landmark
(within 1.5 km; six pins had none nearby and took the neighbouring area), then the town was mapped to one
of the eight map regions and its county, checking against the county named in the marker itself where it
names one (the *Mariana County #4*, *Kelly County #3*, *Lummox County #12* and *Leonard County* series).
Distribution: Vice City 116, Mount Kalaga 94, Mariana 87, Port Gellhorn 77, Leonida Keys 35, Ambrosia 23,
Capri 16, Grassrivers 3.

### Checks run

- `data/collections.json` parses; 451 records, no duplicate ids against the curated 76.
- Every category, region and county id resolves against `categories.json` and `regions.json`.
- Every pin falls inside the tile crop (x -11000…4000, y -9000…11000), so none are silently invisible.
- Every record has a name, a hint and a GTABase source link; the 451 positions are byte-identical to the
  published marker coordinates.
- `node --check js/data.js` clean after the extra fetch.
- Loaded the map in a browser at 527/527: all 527 pins render, no marker has a missing sprite symbol, and
  the category chips read 146 / 135 / 130 / 40.

## 14. The crab lab was 1.8 km from where we put it

§12 ended by flagging a disagreement: GTABase put the Pelican Valley lab at **-3962, -4104**, our two crab
records at **-2600, -5200**. Resolved here — the lab is GTABase's spot, and both records moved.

### Three independent checks

**1. The marker cluster.** GTABase publishes five separate markers on the same buildings, filed under
different categories by different contributors, all within 30 m of -3962, -4104:

| Marker | Category | Pin | What it says |
|---|---|---|---|
| Crab Lab Puzzle | easter-egg | -3962, -4104 | power and code puzzle in the abandoned swamp lab in Pelican Valley |
| Mutated Giant Crab (research lab) | easter-egg | -3967, -4100 | a facility where they experimented on crabs |
| Safe — Abandoned Research Lab | safe | -3954, -4094 | computer password CLEAVES, safe code **0072** |
| Crabshack VF5 | unique-weapon | -3973, -4083 | keypad-locked shack at the abandoned research outpost |
| SCOOP Container | scoop-container | -3949, -4111 | cut-off-tool container on the same site |

That is our code (0072), our weapon (Crabshack VF5) and our story, on one island. Two more corroborate
the site rather than the building: "Airgator Dr Sheehan's Airboat" at -3925, -4104 is described as the boat
of a biologist working there, and the Karkinos encounter itself is 676 m away at -4454, -4567.

**2. The basemap artwork.** The published pyramid is world metres with 256 px tiles at `<z>/<z>,<y>,<x>.jpg`,
level 6 being 2 px/m. Rendering a 3×3 block of in-game tiles around each candidate, with the pin marked:

- **-3962, -4104**: the crosshair lands inside a cluster of grey buildings — sheds, a jetty and a cleared
  compound — on a small island in the Pelican Valley marsh channels.
- **-2600, -5200**: the crosshair lands in **open water**, roughly 120 m off a bare sand key with nothing
  built on it.

One of these is a research outpost; the other is a swim.

**3. The landmark dataset.** It cannot name the lab — there is no "crab", "pelican valley" or "research
lab" landmark among the 4,552 usable entries — but it rules our old pin out cleanly: that point is 183 m
from **Gambit Bay** and 333 m from **The Rusty Anchor, Key Lento**, i.e. sitting in the Keys tourist
strip. The new pin is 577 m south of **Gullet Marsh, Mariana County** and inside the Pelican River marsh.

One more telling detail from our own data: the *Gullet Marsh hut* record has always said its hut is
"east of the abandoned crab lab". GTABase puts that hut's Akulus revolver and SM-69 sniper at
-3571, -4081 and -3562, -4078 — **392 m due east of the corrected lab pin**. The old crab pin was 1.8 km
south-east of it, so the hut's own hint only becomes true once the lab moves here.

### What changed

- Both records: `position` -2600, -5200 → **-3962, -4104**, `method` `estimated` → `reported`,
  `accuracy` 400 → **40** (the marker cluster agrees to ~15 m and the artwork shows the buildings).
- Region `mariana` → **`grassrivers`** on both, county unchanged at `mariana`. The corrected pin sits among
  the records already filed grassrivers — Wetman Bay, the Gullet Marsh hut, Kingfishers' Sunrise RV Park,
  the Skunk Ape search — and GTADB labels the neighbouring ground "Grassrivers, Mariana County".
- Hints reworded so the location matches the pin (Pelican Valley marsh island just south of the Gullet
  Marsh), and each record gained a tip stating what the pin is and where it used to be.
- `DATA_V` is now `11`.

### Still to check

The **Gullet Marsh hut** itself is still pinned at -2500, -5150, **1.8 km** from the weapons GTABase puts
at -3571, -4081. Its hint already points at the lab, and its two weapons (Akulus revolver, SM-69 sniper)
appear there by name. That is a third record with the same regional misplacement, left untouched here
because this pass was scoped to the two crab records; it is the next thing to fix.

### Checks

- `data/locations.json` parses; 76 records, no duplicate ids; both crab records now at -3962, -4104 with
  `region` `grassrivers` and `county` `mariana`, both resolving against `regions.json`.
- The pin is inside the tile crop, and the 3×3 tile block at level 6 was rendered and inspected for both
  the old and new coordinates before the change was made.
- `node --check js/data.js` clean; `DATA_V` 11 with `js/data.js?v=11` in `index.html`.
- Re-loaded the map locally at `527 of 527`, and both crab pins now draw on the outpost island (the two
  records share one point, as before).

## 15. Every pin states its precision, whichever way it was placed

The detail panel only printed an accuracy note when `position.method` was `estimated`. That was correct
while every record was an estimate, but §12–§14 added **453 pins with `method: "reported"`** — coordinates
copied from a published community-map marker — and those were the only pins in the app that said nothing
about how precise they are. The map's whole claim is that a pin never implies more accuracy than it has,
so the panel now covers both methods:

| Method | Pins | Note in the panel |
|---|---|---|
| `estimated` | 74 | "Pin is approximate (±N m). Use the written directions to find the exact spot." (unchanged) |
| `reported` | 453 | "Pin is the community map's published marker (±N m), not a surveyed position — the coordinates are copied from that map, so trust the spot to about that distance rather than to the metre." |

`reported` accuracy values in the data are 40 m (photo-confirmed markers), 60 m (stunt jumps), 80 m
(knife flights) and 250 m (description-only markers); the note prints whichever the record carries, and
falls back to 100 m if a future record omits it.

`js/detail.js` is now `?v=5` in `index.html` so returning visitors get the change inside the Pages
ten-minute cache.

### Checks

- `node --check js/detail.js` clean.
- In the browser at 527/527: *Pelican Valley research outpost* (reported, 40 m) shows the new note;
  *Shrooms in the women's toilet* (reported, 250 m) shows it with 250 m; *Apollo Aggregates warehouse*
  (estimated, 250 m) still shows the original approximate wording.


## 16. Thirteen curated pins the markers name exactly

The crab lab in §14 was settled by matching our record against GTABase's 6,510 markers and then letting the
basemap artwork decide. This pass ran the same test over every curated record instead of one.

Method, so the next pass can repeat it: rare-token overlap between a curated `name` and a marker `name`
(generic words such as *warehouse*, *motel*, *safe* and *garage* dropped, since on their own they match
hundreds of markers), then the distance between our pin and the matching markers. Anything over 500 m is a
candidate. A candidate only counts as identified when a cluster of at least two markers naming the same
place agrees — place plus safe, or place plus gang operation plus weapon — and ideally when one of them
reproduces a code or weapon this record already carries. Only then were the tiles cropped at level 5
(1 px/m) around both coordinates: **if the artwork showed our pin on something the record describes, the pin
stayed; if it showed water, a motorway or an empty field, the pin moved.** Nothing was nudged.

Thirteen records passed that bar. Each now sits on its marker with `method: "reported"`, `accuracy: 40`
(the cluster markers agree within about 30 m), a hint or tip naming the building, and a tip that says where
the pin used to be:

| Record | Pin now | Was | Moved | What proved it |
|---|---|---|---|---|
| Dino Golf — Brontasaurus Bat | -4457, 3900 | -2450, -4400 | 8539 m | `Buntosaurus Bat`, whose note places it "next to the red mesh cage near Dino Golf", plus the Dino Golf course and Challenge markers; the crop shows fairways and cages, the old pin a motorway junction |
| Black Eagle warehouse | -2593, 1378 | 900, 1800 | 3518 m | marker repeats this record's own door code 789987 and safe 031462; the crop shows a warehouse block, the old pin an apartment terrace on the waterfront |
| Janjak's Garage (San4San) | -1259, 1202 | 1400, 2400 | 2916 m | the garage marker, its safe code 4444 and a San4San KZ-59 marker all within 5 m; the crop shows an urban garage block, the old pin a motorway junction |
| Yellow container — Caliente Picador | -3920, -2060 | -2700, -4350 | 2595 m | Picador and Royal Sanchez markers worded "old trainyard in North Mariana County" and "yellow container by the broken house"; the crop shows the rail lines and sheds, the old pin a marsh bank |
| Final Chapter — KVGA-12 | -2995, 3988 | -1600, 4100 | 1399 m | the KVGA-12 marked at the Irons Building Supply operation; the crop shows the industrial yard with its silos, the old pin open road |
| Devil's Rope Gauntlet — Hog Stars Garage | -2771, 4077 | -1400, 3850 | 1390 m | the Hog Stars Garage marker with this exact livery 15 m away; the crop shows the garage, the old pin a field |
| Royal Ruby Emerus — Vespucci Mansion | 509, 1212 | 850, 2400 | 1236 m | the mansion marker, two armory safes and the car by name within 20 m; the crop shows the walled waterfront estate |
| Palmer Fishing Warehouse safe | -5355, -3137 | -6408, -2478 | 1242 m | the warehouse marker with safe code 1886 and the La Polilla Negra weapon within 25 m; the crop shows the docks, the old pin a bare beach |
| Manatee Motel — Laird 350 | -3011, -4117 | -2100, -4800 | 1139 m | the motel marker, its safe and a "Manatee Motel, Pelican Valley" marker within 15 m; the crop shows the room row, the old pin open water |
| Brooks Boatworks safe | -6555, 4338 | -6768, 5041 | 735 m | the boatworks marker with safe code 6823 within 20 m; the crop shows the quay and sheds, the old pin a rail bridge |
| Nova Auto Junkyard safe | -2484, -3405 | -2982, -3084 | 592 m | the junkyard marker with garage safe 7777 within 10 m; the crop shows the fenced lot, the old pin the town water tower |
| Watson Bay safehouse safe | -4574, -2931 | -5887, -2687 | 1335 m | the safehouse marker with safe code 1819 within 8 m; the crop shows the house and its drive, the old pin the middle of the creek |
| Gullet Marsh hut — Akulus & SM-69 | -3571, -4081 | -2500, -5150 | 1513 m | `Swamp Bait Akulus` ("wrecked cabin in the middle of the Pelican Valley swamp") and `Cruel Huntsman's SM-69` ("boardwalk between the two buildings of a hunter's cabin") 9 m apart; the crop shows the cabin on a swamp channel, the old pin open water |

Three regions changed with the coordinates, because the new pin is in a different part of the map:
*Dino Golf* `grassrivers` → `port-gellhorn` (Kelly County), *Black Eagle* `vice-city` → `ambrosia`
(Leonard County, per the county landmark 25 m from the marker), and *the Picador's yard* `grassrivers` →
`mariana`. The other ten kept their region and county. The Picador record's summary moved with it, from "a
field just above Grass Rivers" to the old trainyard, and the Gullet Marsh hut's "immediately east of the
crab lab" hint and tip now give the measured 392 m, which is what the new pin sits at.

### Flagged and deliberately left alone

These also sit far from markers that name something similar, but the markers do not name *the same thing*,
or the record is structural rather than a misplacement. None was moved:

| Record | Why it stays |
|---|---|
| Vespucci Island film car (900, 2350) | No marker names a film-tribute tuner. The Vespucci Mansion markers 1.2 km away name the estate, not the car; moving on that would be a nudge. |
| UFO abduction, Port Gellhorn (-5366, 3476) | The nearest UFO markers are `UFO Believer` 394 m away (a person, not the encounter) and `UFO Van Abduction` 2.5 km away, a different event in a different county. |
| BURG underwater labs (-2050, -5750) | GTABase has five separate `Burg Facility` markers across the map (859, 5473; -1433, -6881; -8783, -6757; -7618, -4865; -9705, 3321). This single pin is a "start here" pointer to the Key Lento station, not a claim to be any one facility, so it needs five pins, not a move. |
| Dog Island | No marker names Dog Island; the two `Cool Dog` markers are an NPC and a jet-ski, 1.4 km from our pin and unrelated. |
| Hillside meteorite | No marker names it. The 135 meteorite pins in `collections.json` are a separate, bulk-reported set. |
| Skunk Ape search (-2900, -4900) | An area, not a place: the guides disagree on the marsh, and no marker names the mission. |
| Blue Drake Penumbra container (-6769, 2105) | 571 m from a `Maibatsu Blue Drake Penumbra` marker with no description, so there is no way to tell whether that marker is this container, a race award or a shop. Artwork shows the raceway grandstands under our pin, as the record says. |
| M7 junkyard Hellfire (-3000, -3376) | 504 m from `Bravado Gauntlet Hellfire (Randy's request)`, a different spawn (a request reward, not the junkyard). |

### Checks

- `data/locations.json` parses; 76 records, 76 unique ids, every `region` resolves against `regions.json`,
  and the 13 changed records carry `method: "reported"` with `accuracy: 40`.
- Each of the 13 was cropped at level 5 around both its old and its new coordinate and inspected before the
  move; the 12-record contact sheet and the hut pair were rendered in the browser from the tile pyramid
  (not from the app) so the comparison is independent of our own map rendering.
- `node --check js/data.js` clean; `DATA_V` 12 with `js/data.js?v=12` in `index.html`.


## 17. Five BURG labs, five pins

§16 left this one flagged rather than fixed: our single `burg-underwater-labs` pin stood for five separate
stations that GTABase marks individually, the nearest of them 1.4 km from our pin and the furthest 12.6 km
away. The five sit 2.2 km to 15.6 km apart, so no single coordinate could honestly
stand for the set.

The old record kept its id, because it is still the first stop: GTABase's *Burg Facility 5* is the station
whose computer "starts the chain of finding meteorites in safes", which is exactly the Key Lento entry this
map already described. It now sits on that marker, and the other four are new records, each on its own
marker with its own landmark direction:

| Station | Record | Position | Where | Region/county | What is there |
|---|---|---|---|---|---|
| Key Lento station (first stop) | `burg-underwater-labs` | -1433, -6881 | south-east of Key Lento, in open water | Mariana/mariana | Starts the chain: laptop sets the Locate Underwater Meteorite task, messages give the safe code |
| Facility 1 — the meteorite safe | `burg-facility-1-meteorite-safe` | -8783, -6757 | west of Mile Zero Air Station, south of the Riquezas Keys | Mariana/mariana | The only meteorite, in the safe, code 80085 |
| Facility 2 — off Little Hardin Island | `burg-facility-2-little-hardin` | 859, 5473 | south of St. Lucia Lighthouse, Little Hardin Island | Ambrosia/Leonard | Laptop that hints at the other stations; nearest of the five to a road |
| Facility 3 — beside the Sandbars | `burg-facility-3-sandbars` | -9705, 3321 | 460 m off the Sandbars, west coast | Port Gellhorn/Kelly | Story only |
| Facility 4 — north of the Riquezas Keys | `burg-facility-4-riquezas` | -7618, -4865 | between the Riquezas Keys and Mariana Island | Mariana/mariana | Story only |

Two things moved with the split. The meteorite and its code now belong to Facility 1, the only station whose
safe holds one (GTABase: "safe inside with a meteorite (code 80085)"); the Key Lento record keeps the task
and the code as learned there, and says plainly that the fragment itself is elsewhere. Each record also
carries GTABase as its coordinate source alongside the three guides, since the positions are that map's
markers, not the guides' prose.

Two discrepancies recorded rather than papered over:

- **Numbering.** GTABase numbers the stations 1–5 and puts the chain-starter at 5; our guide has the chain
  starting at Key Lento and calls the meteorite station first. Same five labs, two schemes, so every record
  says which number GTABase gives it and tells the reader to navigate by landmark.
- **Wild Hog Point.** One guide places a station "off Wild Hog Point in Kelly County". No marker is there —
  the nearest of the five is 8 km away — and the fifth station is north of the Riquezas Keys, where its pin
  now sits. Facility 4's tips say so instead of pretending the guide's line matches.

### Checks

- `data/locations.json` parses; 80 records, 80 unique ids, every `region` resolves against `regions.json`;
  the five BURG records are `method: "reported"`, `accuracy: 40`.
- The five coordinates are GTABase's `underwater` markers verbatim (859, 5473; -1433, -6881; -8783, -6757;
  -7618, -4865; -9705, 3321), each checked against the nearest named landmark before its hint was written.
- `node --check js/data.js` clean; `DATA_V` 14 with `js/data.js?v=14` in `index.html`; the map loads
  531 of 531 pins locally, the four new ones among them.


## 18. 531 pins at the overview, folded into counts

The overview was the map's worst view: after §13 took the pin count from 76 to 527, the start zoom drew every
pin at once and the island read as a wall of overlapping teardrops — worst in Vice City, where the packages,
meteorites and stunt jumps sit on top of each other (36 of them inside one 1.4 km cell).

`js/markers.js` now buckets visible pins into **world-pixel cells of 46 px** at the current zoom, and draws a
count disc per bucket instead of the individual pins, above zoom −1. Details that matter:

- Buckets are computed in world space, not screen space, so panning never reshuffles the discs — only a zoom
  level change re-buckets, which is exactly when the picture should change.
- A bucket of one is drawn as its normal pin, so isolated finds stay finds.
- **Colour is a claim, so it is only used when it is true.** A bucket whose pins are all one category takes
  that category's colour; a mixed bucket is grey and hollow. A disc never implies "these are all meteorites"
  when it is not.
- Disc size steps with the count (38 / 44 / 50 / 58 px), and a 100+ bucket prints `99+`.
- If every pin under a disc is marked found, the disc fades and takes a ✓, so progress is legible from the
  overview too.
- Clicking a disc zooms **two levels in**, and a disc that survives the zoom re-reads the zoom and its
  position at click time (a captured zoom would be stale and the click would do nothing — that bug was in
  the first draft and is why the handler looks the way it does).
- The selected record is always drawn as its own pin even in the densest cell, so choosing a row in the rail
  still shows where that pin is.

No clustering plugin: the rule is vanilla JS with Leaflet pinned in the page, and a grid bucket over 531
points is about thirty lines, not a dependency.

Measured in the browser on the shipped build:

| Zoom | Count discs | Individual pins | Total marks |
|---|---|---|---|
| −5 (start) | 72 | 10 | 82 |
| −3 | 111 | 247 | 358 |
| −1 | 34 | 460 | 494 |
| 1 (max) | 0 | 531 | 531 |

### Checks

- `node --check js/markers.js` clean.
- Browser, starting view: 72 discs and 10 pins instead of 531 pins; screenshot inspected.
- Click progression tested end to end in the page: −5 → −3 → −1 → 1, with the marking changing as the table
  above says and no zoom level stuck (the stale-zoom bug above was found this way, then re-tested).
- Selecting `gb-hidden-package-038` while the overview was on screen drew its own selected pin inside the
  Vice City cell (pins 10 → 11).
- Filtering to meteorites only at a clustered zoom gave 8 discs + 118 pins for 135 meteorites, so filtering
  and bucketing compose; clearing the filter restored all 531.
- `js/markers.js?v=4` and `css/map.css?v=4` in `index.html`. No JSON changed, so `DATA_V` stays 14.


## 19. Search by code, and a list of every code

Search only looked at name, summary, hint, region, category and rewards, so typing a code found nothing —
exactly the question a player has when standing at a keypad (`4444`, `80085`, `031462`). `js/filters.js` now
includes `code` and `tips` in the haystack, so a code, or a word from a tip (`bulldozer`), returns the record
that carries it.

That still assumes you know *which* pin the code belongs to. The rail now has a **Reference → Codes & keys**
button (17 records) that opens a plain list ordered by the code itself:

- Each row shows the code in mono type with any caveat demoted to grey — `1886` sized large,
  "(1886 / 1887 disputed between sources)" small — so the number scans first and the doubt is still visible.
- Paired codes keep their pairing: `0072 (safe) / 0212 (boathouse)` reads as one row rather than two
  unlabelled numbers.
- Under it: the record's name, region and category. Clicking a row selects that pin, flies to it and closes
  the dialog.
- A filter box inside the dialog searches code, name, hint, region and tips, so `0314` narrows to the Black
  Eagle door/safe pair without leaving the list.
- Rows carry an explicit `aria-label` (`«code» — «record», «region» · «category»`), because the visible text
  is three stacked lines with no separators for a screen reader to read as one control.

No confidence is invented in the list: disputed codes keep both numbers, `2314` keeps "commonly reported —
may vary per save", `955214` keeps "(reported)". The list is a reading aid for the same data the pins show.

### Checks

- `node --check js/app.js`, `node --check js/filters.js` clean.
- In the browser: rail search `80085` returns 3 pins (where the code is learned and where it is used),
  `4444` returns only Janjak's Garage, a tip word (`bulldozer`) returns the Picador container record;
  `031462` returns only the Black Eagle warehouse.
- Codes dialog opens with 17 rows in numeric order (0072, 0300, 1819, 1886, 2008, 2314, 3612, 4444, 6823,
  6969, 7777, 44017, 80085, 360782, 789987, 955214); its filter narrows to the right row; clicking the `1819`
  row closed the dialog, selected Watson Bay safehouse and the detail panel opened on it.
- `js/filters.js?v=3`, `js/app.js?v=7`, `css/components.css?v=3`. No JSON changed, so `DATA_V` stays 14.


## 20. The audit is in the repo now

§14–§17 were done with throwaway scripts in `artifacts/`, which is untracked: the method was reviewable in the
report but not runnable. `sites/gta6/tools/` now holds it.

| File | Role |
|---|---|
| `tools/validate.mjs` | One command: schema, ids, categories, regions, counties, sources, marker links, near-duplicate pins. Exit 1 on errors. |
| `tools/audit-markers.mjs` | Re-runs the cross-check: every linked pin against its marker, plus candidates — pins whose best same-name marker is more than 500 m away. |
| `tools/link-markers.mjs` | Proposes or writes the marker id on a record; `--set` for hand-established links. |
| `tools/lib/markers.mjs` | Loader, tokeniser, IDF weighting, ranking — shared by both scripts. |
| `tools/data/gtabase-markers.json` | The 6,510-marker snapshot, trimmed to id/name/category/x/y/description (1.0 MB). |
| `tools/data/gtabase-markers.meta.json` | Where it came from, when, and its SHA-256, so a result can be tied to the snapshot it used. |

**Matching rule, narrowed.** The first version let hint words score, and everything matched something: a
"glider in the treeline" matched a rooftop loot box 5.8 km away on the word *rooftop*. Hints name the town,
the road and half the map, so they no longer score at all — only name overlap does, weighted by inverse
document frequency. A candidate now needs at least two shared name words and at least one of them
distinctive (a word under ~50 markers use), which took the list from 28 rows of noise to the 11 real
questions below.

**Records carry their marker.** The 20 pins whose coordinates came from a marker now say so:

```json
"position": { "x": -3571, "y": -4081, "method": "reported", "accuracy": 40 },
"marker": { "source": "gtabase", "id": "weapon-spawn-025", "name": "Swamp Bait Akulus" }
```

The marker name is stored beside the id so a rename in a future snapshot can still be resolved. Linking
deliberately covers only `reported` records: an estimate that happens to sit near a marker stays an estimate
(and shows up as a candidate), because upgrading it would be a data decision — a move or a re-tier — not a
script decision. `link-markers.mjs --include-estimated` shows what that would look like.

**What the first run said.** `validate.mjs` passed 531 records with 27 warnings, caught two `http://` source
URLs on `gta6bugs.com` links (now `https://`, both verified 200), and flagged four records with no `tips` —
which turned out to be correct data and an over-strict validator, so the rule became "validate when present".
`audit-markers.mjs`: 20 linked pins, 0 errors (worst gap 18 m, the Picador), 0 drift across the 451
collection pins, and these 11 candidates left for a human:

| Distance | Record | Best same-name marker |
|---|---|---|
| 6,385 m | `easter-egg-nest-tower` | Easter Egg: Bird Nest on the Mast |
| 2,538 m | `ufo-abduction-port-gellhorn` | UFO Van Abduction |
| 1,911 m | `infernus-crosstown-garage` | Pegassi Infernus (purple) |
| 1,865 m | `vitello-waning-sands` | Pegassi Vitello (Randy's request) |
| 1,810 m | `dog-island-wallet` | Cool Dog on a Jet Ski |
| 1,587 m | `toros-tequesta-retreat` | Pegassi Toros |
| 1,348 m | `tempesta-tow-truck-event` | ATM Theft (tow truck) |
| 1,172 m | `gauntlet-ambrosia-reservoir` | Bravado Copperheads Gauntlet |
| 708 m | `banshee-sweetbay-inn` | Bravado Banshee |
| 576 m | `container-penumbra-gellhorn` | Maibatsu Blue Drake Penumbra |
| 504 m | `hellfire-m7-junkyard` | Bravado Gauntlet Hellfire (Randy's request) |

They are questions, not verdicts: most are a vehicle record and a spawn marker that share a model name but
not a place, and the artwork still decides (REPORT §16). `--strict` turns them into a failing build for
anyone who wants that.

### Checks

- `node sites/gta6/tools/validate.mjs` → exit 0 (`531 records`, 15 proximity warnings, all valid).
- `node sites/gta6/tools/audit-markers.mjs` → exit 0 (20 linked, 0 linked-marker errors, 0 collection drift,
  11 candidates).
- `link-markers.mjs --write` re-parsed the file before writing; `locations.json` still parses; the app loads
  531 of 531 pins with the extra field present.
- `DATA_V` 15 with `js/data.js?v=15`, because `locations.json` changed (the field is not shown in the UI yet).


## 21. Bulk-pin audit: sound, with two pins to re-source

The 451 bulk pins were imported from GTABase coordinates and never checked individually. This is that
check: the colour under every pin, the distance to dry land for the wet ones, a seeded 30-pin sample read
cell by cell, and all 130 stunt jumps read on contact sheets.

**Completeness first.** The snapshot holds 453 markers in the four collections; the import holds 451. The
two absent ones are not losses: `hidden-package-217` sits 4 m from `hidden-package-213` and
`meteorite-025` 4 m from `meteorite-024`, and the import kept one of each pair. Every other marker in the
four categories is present, ids unchanged.

**What is under the crosshair.** Level-5 colour classification of all 451 pins:

| Collection | Pins | open water | on/next to dry ground |
|---|---|---|---|
| Hidden packages | 146 | 10 | 136 |
| Meteorites | 135 | 57 | 78 |
| Stunt jumps | 130 | 17 | 113 |
| Knife flights | 40 | 0 | 40 |

The numbers are only alarming until you read the descriptions. Of the 10 wet packages, 8 are within 22 m of
dry land (a jetty, a stranded boat, a floating box) and the other two say it outright — `hp-098` "under the
water; floating debris marks the spot", `hp-118` "in the deck hatch of Donnie's sunken boat". Of the 57 wet
meteorites, 31 are more than 60 m offshore, and 24 of those name the wreck, dive site or underwater facility
in the description ("In the safe inside Underwater Facility 1. Code: 80085", "Dive under the yellow tower…
to the sunken sub"); the rest name a crashed yacht, a broken ship or a plane's tail.

Two are left over: **`meteorite-049` (-7824, 262) and `meteorite-078` (-654, 6877) have no description at
all and sit in open water** — 049 more than 150 m from any dry pixel. Nothing in the source text justifies
those positions, and the artwork cannot see a wreck that small. They stay on the map with their 40 m
accuracy, but they are the only two pins this audit cannot vouch for, and they are the first thing to
re-source if we want the collection to be provable end to end.

**The 130 jumps.** 119 sit within 25 m of a paved pixel, 11 between 25 and 44 m (dirt-lot and beach ramps),
all 17 wet ones within 22 m of dry land — causeway and bridge ramps crossing water. On the sheets every
crosshair lands on a highway, a junction, a lay-by, a parking structure or the approach to a bridge; none is
in open water or open country. The limit is inherent: **stunt-jump ramps and knife-flight gates are not drawn
on the basemap**, so this confirms the pin is at a place a ramp can be, not that the ramp's pixel is right.
That is the same standard §13 used; it is weaker than the marker-plus-artwork proof the 20 curated pins got.

**The sample.** 30 pins, stratified by region inside each collection, seed 20261127, listed in
`tools/data/bulk-audit-sample.json`. All 30 are plausible: 28 sit on or against a structure, jetty, roof,
helipad, road or shoreline that matches the description; two packages (`hp-171`, `hp-230`) sit on open grass
with nothing in view, which is normal for a cache hidden in vegetation but is a weaker match than the rest.

**Why the frame is right.** A systematic offset is the failure mode that would not show up in any of the
above. It is ruled out by §16: the 20 curated pins were re-anchored onto these same marker coordinates and
checked against the artwork, landing 0–18 m from the features they name. The bulk pins are byte-identical to
the marker list those 20 were checked against, so they inherit the same frame within the same few metres.

**Verdict.** The import is sound: complete bar two deliberate duplicates, correctly framed, and every pin
checked against the basemap either agrees with its source description or sits within the stated accuracy of
ground where its object would be. Nothing here warrants withholding the pins. Two things to carry forward —
`meteorite-049` and `meteorite-078` need a description or a re-source before anyone claims the meteorite set
is verified, and the jump/knife-flight layers should keep saying "position from GTABase" rather than implying
the ramp was seen.

Not covered: the 421 bulk pins outside the sample were colour-screened but not read one by one, and no pin
was moved. Sheets: `artifacts/bulk-sample.png`, `artifacts/bulk-jumps-1..3.png`, reproducible with
`tools/audit-bulk-pins.py sheets OUTDIR`.

---

## 22. The alien building, and where `T2/40` comes from

A reader asked about the "baby alien" mission and sent a crop showing two cryptic labels — a green `T2/40`
and a dark-blue `T3/78` with leader lines — over an olive-and-teal landscape with a white six-lane road and a
large grey building. Neither string exists in `data/`. They are **painted into the Yanis v18 community
basemap**: that artwork carries an index of trailer, content-drop and artwork screenshots, each labelled with
a frame code and a coloured dot on the spot it was shot from. Other examples on the same map are `T4/09` by
LTF Airfield, `A2/16` out in open water and `S0/89` in Vice City, and the legend sheet east of `x = 4050`
heads the columns "TRAILER 2", "TRAILER 3 CONTENT DROP SCREENSHOTS" and "ARTWORKS". The in-game (`day`)
tiles have no such labels, which is why every audit crop in this file is taken from them and why the
Community/In-game basemap switch removes the codes for anyone who finds them confusing.

There are also no mission pins on the site: the bulk import is the four collections (packages, meteorites,
stunt jumps, knife flights) and nothing else, and the GTABase snapshot holds no marker with "baby" in its
name. What the map does have is `alien-bunker-cottonmouth`, and checking it turned up a real error.

**The record was 780 m off, in open water.** It sat at `(-2000, -4600)` as a 500 m estimate, which the
in-game tiles show as blue in every direction. The nearest match in the snapshot is `easter-egg-019`
"Alien Encounter (abandoned building)" at `(-2649, -4151)` — the same building the reader's crop is centred
on, on the rise just north-east of the LTF Airfield runway, which is exactly what the record's own hint
("at the north end of the long airstrip") describes.

**The artwork at the marker agrees.** A 640 m crop (`artifacts/airfield-wide.png`) and a 260 m one
(`artifacts/airfield-mark.png`) show one grey building complex standing alone on a cleared rise above the
marsh, a dirt track running north-west to the road, water on the east and south, and the runway ending
about 300 m to the south-west. Three independent markers land on the same complex: `easter-egg-019` itself,
`comics-002` "Un Extraño Rescate" 12 m away (a comic inside the building), and `vehicle-spawn-064`
"Mammoth Patriot '92", described as "at the far end of the abandoned building", 128 m off. The LTF Airfield
marker (`public-transport-016`) is 298 m away — the distance the hint's "walk north-east from the airfield"
implies.

So the pin moves to `(-2649, -4151)`, `method: "reported"`, `accuracy: 40`, and the record now claims
`easter-egg-019` the same way the other twenty do. The hint and one tip were reworded to say "north-east of
the LTF Airfield runway's north end" instead of the vaguer "long airstrip"; the 2314-codes-vary caveat is
untouched. `DATA_V` goes to 16.

**What this does not establish.** The marker is a community submission, so this is marker-plus-artwork
agreement, not a verified in-game read: the building on the tiles matches the one the sources describe, but
nothing here proves the keypad or the dream sequence. And the two baked labels remain on the community
basemap until it is redrawn — they were never ours to remove.

---

## 23. 3,175 pins: the four missing kinds are in

The map was 531 pins against GTABase's 6,510 — around LTF Airfield, 21 against 276. That was never a
rendering fault: only four collections had ever been imported, and density is data.

Four kinds were requested: loot boxes, safes, businesses/services, vehicle spawns. They come from the same
snapshot the audits use (`tools/data/gtabase-markers.json`), through `tools/import-gtabase.mjs`:

| GTABase kind | pins | this map's category |
| --- | --- | --- |
| `yellow-loot-box` | 585 | collectible |
| `safe` | 303 | stash |
| `standout-vehicle`, `vehicle-spawn` | 444 | vehicle |
| `bus-stop` 287, `atm` 227, `street-food` 163, `bar` 140, `towable-atm` 127, `ev-charger` 126, `cafe-takeout` 112, `convenience-store` 73, `gas-station` 57 | 1,312 | shop |

**2,644 pins imported**, six markers already had a record and were skipped, none fell outside the map crop.
`collections.json` goes from 451 to 3,095 records (2.5 MB), the map from 531 to **3,175 pins**.

**Two things decided here, not read from the source.** The category: GTABase publishes ~70 kinds and this
map has 14 legends, so each kind is folded into the nearest one — a towable ATM is a service, not a shop
in the retail sense, and the label says so. The region and county: the trimmed snapshot dropped GTABase's
`town` field, so each new pin inherits the region and county of the nearest already-labelled record. That
is a classification from position, not a reading, and it can be wrong right on a boundary — the one thing
here worth re-doing if a fresh snapshot with `town` is ever pulled.

Wording is GTABase's own marker name and description, credited on every record and in the credits modal;
nothing was rewritten, because hand-writing 2,644 names is how errors get in. Positions are their
published coordinates, `method: "reported"`, 40 m, exactly as the four original collections were.

**Rendering had to change first.** `_renderPins` built a DOM marker for every visible record, which would
have been 3,175 nodes at max zoom, and looked each one up with a linear scan inside a loop (O(n²) per
render). Now:

- one id index per render instead of thousands of scans;
- only pins inside the padded viewport become markers (9–23 of them in a 1000×700 view at zoom 1 and 0 near
the airfield, against 3,175 before), re-run on `moveend` so panning adds and drops pins;
- cluster discs are culled the same way, so the overview draws ~140 discs for the whole state instead of
  every cell the pins fall into.

**Validator.** With 2,644 more pins, the "two pins within 20 m" warning went from 12 lines to 863 — the
import is full of legitimate pairs (a bar and its ATM, two carts on one corner). Pairs between two bulk
pins are now counted in one summary line; every pair involving a hand-written record is still printed in
full, and `--proximity-all` restores the old output. No check was weakened: the pairs were warnings before
and are warnings now.

**Still missing, deliberately:** about 3,800 markers — random events (512), easter eggs (121), unique and
ordinary weapon spawns (221), the collectible sets (cards, magazines, flamingos, street art), races and
flights, gang operations. Those are the next four categories, not this change.

Not covered: nobody has looked at the three thousand new pins on the basemap. They inherit the four
collections' verified frame (§21 ruled out a systematic offset), but each pin's own accuracy is only as
good as GTABase's submission — 40 m, unread by us.

---

## 24. No more holes, and the rest of the pins

Two complaints, one cause each.

**The holes when you zoom.** It was not the CDN, and the first diagnosis in this section was wrong: the
request log showed every tile returning 200 while the screen still had bands of black. The cause was the
crop offset.

Each tile is a crop of a published artwork tile, so the image has to be pulled left/up by
`gx − tx·256` source pixels (times the zoom scale). The sign was inverted — the arithmetic is a mirror of
the correct one, so the offset only came out right when it was zero. And it is zero at every zoom up to
0, because there the pyramid level equals the Leaflet zoom and a slot always lands on a tile boundary.
At zoom 1 the community artwork (1 px/m) is upscaled 2×, one published tile covers two slots, and every
second slot got +128 × 2 = 256 px instead of −256 px: its image was pushed completely out of the box,
leaving the map underneath. That is the black banding in the screenshot — exactly half of the columns,
with the pins floating in the gaps, which is why it looked like missing tiles. The in-game artwork at
zoom 1 did not show it (its pyramid is 2 px/m, so a slot is one whole tile and the offset is 0), which is
why the same zoom looked fine on the other basemap.

One character of arithmetic, fixed in `map.js`, and the zoom is seamless at both basemaps. What made it
hard to find is that it looked like a loading failure, and the old layer *also* failed silently in a
different way — so both were fixed:

The tiles are now `<img>` elements inside the slot, so the code sees `onload`/`onerror`:

- **retry once** immediately, with `?retry=1` to bypass the cached miss;
- **then switch host** — `raw.githubusercontent.com/rolux/gtadb.org` for the same file;
- **then give up visibly**: the slot gets a hatched `is-missing` fill, not a black void;
- a slot outside the artwork (the legend sheet, the map edge) gets a neutral `is-edge` fill.

The retry was tested by firing a synthetic error at a live tile: it re-requested, loaded, and stayed
clean. The give-up path was tested by firing three: the hatch appears, the img is detached first so a
late response cannot clear it (that bug was real, and the first test caught it).

Verified after the fix, on a 1440×900 window at zoom 1 over the airfield: 24 slots, 24 images, zero with a
positive offset (the broken state), zero broken, zero hatched, 16 pins. Before the fix the same view had
the same 24 tiles and still showed bands — which is the whole point: the counters said "fine" and the
screen said otherwise, so the check is now the offset, not just the load.

The layer also now sets `updateWhenZooming: false` and `keepBuffer: 4`, so a zoom no longer fires forty
requests mid-animation — the burst that provoked the throttling in the first place.

**More detail.** The remaining marker kinds came in through the same importer: weapons (216), easter eggs
(95), landmarks and helipads and under-the-bridge (304), activities — random events, basketball, races,
drone races, fishing (731), collectible sets — scoop containers, magazines, flamingos, street art (1,109).
`collections.json` is 5,009 bulk records, and the map is **5,089 pins** (up from 3,175).

Two rules keep the file honest and rerunnable:

- **The importer owns its records.** A re-run deletes everything carrying `_gb.source = "gtabase-markers.json"`
  and rebuilds it, so changing the kind table cannot leave stale pins behind.
- **31 markers were dropped as twins.** A hand-written record without a marker link can still be the same
  find (the guide-based pin and the community marker land on the same spot). Anything within 6 m of a
  curated record is left to the curated record; the alternative was two pins on one doorstep.

The file is written compact now — 2.8 MB pretty-printed would have cost a megabyte for nobody's benefit.
GitHub Pages gzips it.

**What the pins look like at 5,089.** Rendering was already culled to the viewport (§23); what broke was
the mobile overview: 82 count discs covered the island completely (artifacts/detail-mobile.png). The bucket
size and disc size now depend on viewport width — a 390 px phone buckets at 92 px and draws discs at 0.74×,
which takes the overview from 82 discs to 27 and lets the coastline show through. Desktop keeps 46 px and
1×.

**Credits had to change, and that is the most important line here.** Until this import, the credits said
"no GTABase text is reproduced". That stopped being true the moment 4,500 marker names and one-line
descriptions came in. The credit entry now says what is actually the case: coordinates are facts, the
margin wording is GTABase's, the snapshot's date and SHA-256 are recorded, and the affected records are
identifiable by `_gb.source`. The visible credit strip reads "Markers: GTABase community map" beside the
tile credit. Two different obligations live in that sentence and they should not be blurred.

**Measured.** Boot to 5,089 pins: 1.25 s locally (domContentLoaded 704 ms), no gzip. In view at zoom 0
over the airfield on a 1440×900 desktop: 65 pins, 20 tiles, 0 broken. On a 390×844 phone: 27 discs at
overview, 28 pins at zoom 0, no horizontal overflow. Filtering Shops off drops 5,089 → 3,777 (exactly its
1,312); searching "alien" returns 12 records including the airstrip record.

**Max zoom now depends on the artwork.** The community pyramid is 1 px/m and the in-game one 2 px/m, but
both basemaps were allowed to zoom to 1 — which drew the community art at 2× for no extra detail, the
reason its labels looked oversized and soft. `TILE_SETS` now carries the deepest honest zoom (community 0,
in-game 1), `map.setMaxZoom` is applied on init and on every switch, and a cluster click stops there too.
Asked for zoom 1 on the community map you get 0, with one artwork pixel per screen pixel.

**Still not imported:** 1,909 markers — the collectible card sets (about 500, near-identical pins), gang
operations, and the remaining one-off kinds. That is a data decision, not a rendering limit.

Not covered: the 4,558 bulk pins have never been read one by one, and the basemap has not been checked
against the new pins in the field. Both statements were true in §23 and remain true.
