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
