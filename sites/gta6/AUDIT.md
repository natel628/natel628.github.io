# AUDIT — `sites/gta6/` (pre-rebuild)

**Role:** Freebuff inspection pass (step 1 of `SPEC.md`).
**Date:** 2026-11-26. **Scope:** `sites/gta6/` only. No application files were modified.
**Read first:** `sites/gta6/SPEC.md`, `sites/gta6/AGENTS.md`, root `AGENTS.md`.

---

## 0. Verdict in one paragraph

The prototype is a **carefully drawn fiction**: a hand-authored SVG "Leonida" on an invented 9 × 13 letter/number grid, holding 16 well-written but unpositioned loot entries. It looks like a map, it is not a map. Nothing in it can be reconciled with the real game, so no marker can be verified, positioned, or corrected, and the spec's three-tier accuracy model is structurally impossible. The UI around it (filters, progress, import/export) is decent scaffolding. **The correct action is a clean rebuild on a real, licensed base map** (the GTA VI Mapping Community's YANIS V17 artwork, published by GTADB.ORG under CC BY 4.0), reusing the 16 entries' prose and source links as seed content. The base map, coordinate frame, and licence obligations are all resolved in §8–9; the build plan is in `PLAN.md`.

---

## 1. Method and evidence

Commands run against the working tree (`main`, clean except the three untracked instruction/spec files):

- Read all 6 files in `sites/gta6/` in full (`index.html`, `gta6.css`, `gta6.js`, `data/locations.json`, `AGENTS.md`, `SPEC.md`).
- Counted nodes and measured files: `grep -o '<path'`, `wc -c`, `node -e` over the dataset.
- Probed all 32 unique source URLs in the dataset with `curl` (status codes recorded in §6).
- Downloaded and stitched the public YANIS V17 `nocams/dark` tile pyramid at z0 and z3 (110 tiles) with Pillow, measured the artwork, the baked credit panel, and the printed scale bar.
- Downloaded `GTA VI Landmarks Data` (`map/data/6/landmarks.json`, 686,241 B) and validated its coordinate frame by projecting three landmark records onto the stitched tile image (§9.3).

---

## 2. Inventory — what is actually in the folder

| File | Bytes | Lines | Role |
| --- | ---: | ---: | --- |
| `index.html` | 32,224 | 490 | Full app shell **and** the entire map artwork inline as SVG |
| `gta6.css` | 30,725 | 1,053 | Single stylesheet: tokens, shell, map paint, pins, modals |
| `gta6.js` | 42,830 | 1,148 | One IIFE: data load, clustering, pan/zoom, filters, detail, storage, import/export |
| `data/locations.json` | 14,427 | 313 | 16 records (array, no envelope/schema/version) |
| `SPEC.md`, `AGENTS.md` | — | — | Requirements only |

Total authored payload ≈ 120 KB, no assets directory, no images, no licence or credits file, no test files.

Inline SVG node counts in `index.html`: **106 `<path>`, 98 `<text>`, 43 `<ellipse>`, 3 `<rect>`** — the map's entire geography is bespoke path data in the document.

---

## 3. What the prototype actually is

- A **900 × 1300 `viewBox`** illustration with `preserveAspectRatio="xMidYMid meet"`, hand-drawn coastlines, invented rivers/lakes, invented interstates ("I-404", "I-97", "I-297", "Toll 1A"), an invented street grid ("Little Havana grid", "Collins Ave", "Tanglewood Ln", "VCIA runway"), and invented towns ("Bonanza", "Millport", "Moreau", "Corsica"…).
- A **9-column × 13-row grid** labelled `A`–`M` / `1`–`9`. This abstract grid *is* the coordinate system. Each location stores `square` + `dx`/`dy` (fraction inside the square).
- `pos(item)` converts grid → percentage of the SVG stage; pins are absolutely positioned `<button>`s over the SVG. Grid maths is in `gta6.js:56–95`.
- 16 curated loot records in 4 used categories (`cash` 3, `weapons` 6, `collect` 3, `code` 4) though 8 categories are declared.

Some proper nouns are real (Vice City, Port Gellhorn, Ambrosia, Hamlet, Key Lento, Bobcat Key, Mount Kalaga, the five counties). The **shape, proportions, roads, grid and every coordinate are invented**. It is at best "Leonida-shaped", not Leonida.

---

## 4. Why it fails the spec (requirement by requirement)

| SPEC requirement | Status | Evidence |
| --- | --- | --- |
| Large, detailed **Leonida** map | ✗ | Fabricated 900 × 1300 SVG, no relation to in-game geometry |
| Smooth zoom/pan, pinch | ~ | Custom transform math works, but see defects D3–D5 |
| Zoom + reset/fit control | ✓ | `zoomIn/zoomOut/zoomReset/fullBtn` (`gta6.js:1040–1050`) |
| Markers accurate at every zoom | ✗ | No real coordinates exist to be accurate *to*; grid is fictional |
| Responsive desktop/mobile | ~ | Panel collapses at 900 px; map-first is compromised (see §5) |
| Full-screen | ✓ | `requestFullscreen()` on `.mapwrap` |
| No blank/awkward map areas | ✗ | Stage is letterboxed into the frame (`fitStage`, `MAP_RATIO = 900/1300`), large dead ocean bands on desktop |
| Distinct icons/colors, 8 categories | ✗ | 8 declared, only 4 ever rendered (zero-count categories are skipped in `renderCats`) |
| Marker detail panel w/ image | ~ | Panel exists; **0 of 16 records have an image**, always shows a placeholder |
| Verification status | ✗ | One value only: all 16 are `"community-reported"`; no official tier, no estimate tier, no legend |
| Source/reference link | ✓ | `sources[]` with 34 links (link health in §6) |
| Search by name | ✓ | Substring over name/region/hint/loot |
| Filter by category, hide found, clear | ✓ | Checkboxes + Show/Hide All |
| Visible marker count | ✓ | `#listCount`, `aria-live` |
| Mark discovered, localStorage, % , reset | ~ | Found + % work; **no reset control** anywhere in the UI |
| Custom markers / notes | ~ | "Drop Pin" only; no free-text note on existing locations |
| Select destination, highlight | ✗ | No destination/concept of a chosen target |
| Mark current position manually | ✗ | Absent |
| Route line between position and destination | ✗ | Absent |
| Dark GTA-inspired but non-infringing | ✓ | Neon pink/cyan palette, Bebas Neue + Inter; no Rockstar marks |
| Map-first, no dashboard grids | ~ | Sidebar is a dense scroll stack; map is a passive backdrop |
| Vanilla, GitHub-Pages compatible | ✓ | No build, no framework (Leaflet absent — no map engine at all) |
| Data separate from interface | ~ | `data/locations.json` is separate, but the map *geometry* is embedded in HTML |
| Distinguish official / community / estimated | ✗ | Not modelled, not shown |
| Replace inaccurate map asset | ✗ | Would need to replace 100% of it |

**Structural blocker.** Because positions are `square`+offset on invented geography, an entry can never be checked against the game, corrected, or merged with any community dataset. Every other content problem is downstream of this one.

---

## 5. Defect list (actionable, with references)

### P0 — blocking / correctness

- **D1 (fiction as fact).** All map geometry is invented, yet presented as "Map of Leonida" (`index.html` `aria-label`), including fake interstate numbers and fake district names. Directly violates SPEC "Do not fabricate map locations".
- **D2 (positions unusable).** 16 records share only **8 distinct squares** (`E3` holds 4 different Port Gellhorn sites, `I3`/`J5` hold 3 each). At grid resolution one cell is ~1.5 km × 1.5 km, so records cannot be distinguished on the map without zooming to 8×.
- **D3 (marker drift by design).** Markers are DOM siblings of the SVG positioned in % of the scaled stage; their on-screen size is compensated with `--inv: 1/sqrt(zoom)` (`gta6.js:663`). At >4× the pin body grows relative to the map; the anchor point survives, the visual hit area does not. A real map engine (`L.CRS.Simple`) removes this class of bug entirely.
- **D4 (per-frame DOM rebuild).** `applyView()` calls `renderPins()` (`gta6.js:672`), and `applyView()` runs on every `pointermove` while dragging and on every wheel tick. Every marker node is destroyed and rebuilt inside the pan gesture — jank on mobile, lost hover/focus, and it forces a re-layout per frame.
- **D5 (pinch anchors to a stale midpoint).** `pinchStart` captures the midpoint at gesture start (`gta6.js:776`) and every move re-zooms around that frozen point; the map slides out from under the fingers as the pinch travels.

### P1 — functional gaps and bugs

- **D6** No map engine, so no inertia, no keyboard panning, no fractional zoom, no tile/overview strategy, no `maxBounds` — panning is clamped by a hand-rolled `clampPan()` that allows 80 px of over-pan.
- **D7** Clustering groups by **grid square**, not geographic proximity (`clusterItems`, `gta6.js:134`). Zooming a cluster calls `setZoom()` around the viewport centre, not the cluster.
- **D8** Selecting a filtered-out marker silently clears the selection (`gta6.js:585–590`) instead of keeping it in the detail panel.
- **D9** Import merge contains a dead branch: `state.mine.indexOf(item) === -1` is always true for freshly parsed objects (`gta6.js:939`); the real de-dupe is the `some()` on the next line.
- **D10** Imported JSON is written to storage without validation (no schema, no size cap, no id allow-list). Rendering uses `textContent` so there is no XSS today, but `img.src` is taken from data unchecked.
- **D11** Progress denominator includes user pins, so adding a pin lowers completion % (`renderProgress`, `gta6.js:390–400`).
- **D12** No progress reset, though SPEC asks for it; filters, layer toggles and zoom are never persisted.
- **D13** Storage keys are versioned in the name (`gta6.found.v3`) but the payload has no `version` field and no migration path.
- **D14** Label collision pass (`layoutLabels`, `gta6.js:685`) measures `getBoundingClientRect()` on `<text>` inside a CSS-scaled SVG, then hides labels judged to collide; results change with sub-pixel rounding and it runs on every zoom step.
- **D15** Wheel handler ignores `deltaMode` and has no zoom-rate damping; trackpads jump 2–3 levels per gesture.
- **D16** "Copy coords (dev)" and a `[A1]` coordinate readout ship in the user-facing toolbar.

### P2 — polish / a11y / maintainability

- **D17** `aria-modal="true"` on `#settingsModal` (`index.html`) with no focus trap, no initial focus, no `inert` on the background.
- **D18** Category is signalled by colour alone in the list rows; 9.5 px uppercase labels at 0.6 opacity fail comfortable contrast.
- **D19** No skip link, no landmark roles beyond `aside`/`main`, no keyboard pan, `.pin` focus ring is drawn on a 15 px dot.
- **D20** Manual cache-busting (`gta6.css?v=9`, `gta6.js?v=9`) has already caused a stale-CSS/data mismatch (commit `ba88e78`); two version strings must be bumped in lockstep by hand.
- **D21** 32 KB of inline SVG makes `index.html` unreadable and unmaintainable; the map cannot be swapped without editing HTML.
- **D22** Google Fonts is a hard runtime dependency (`fonts.googleapis.com`) with no fallback metric tuning; fail-open is a local sans-serif.

---

## 6. Data audit — `data/locations.json`

Shape: a bare array of 16 objects. Fields present on all 16: `id, name, cat, region, county, square, dx, dy, loot[], how, risk, confidence, sources[]`; `code` on 5.

| Finding | Detail |
| --- | --- |
| Coverage | 16 locations, 4 categories, 6 regions |
| Confidence | **100 % `community-reported`** — no official entries, no estimates, no per-field provenance |
| Images | **0** (`image` field is supported in JS but absent in data) |
| Position provenance | None. `square`+`dx/dy` are not derivable from any source, and no record says where the position came from |
| Content quality | Genuinely good: specific landmarks, route descriptions, risk notes, conflicting sources called out (e.g. "code disputed 1886 / 1887", "0300 vs 0330") |
| Schema hygiene | No `schema`/`version`, no enums, `region` and `county` can disagree (`"region": "Grassrivers"` with `"county": "Mariana County"`), `name` sometimes describes the thing rather than the place ("Abandoned site north of the airstrip") |
| Source links | 32 unique URLs. `curl` results: **20 × HTTP 200**, **9 × 403** (bot-blocked publishers: keengamer ×4, itemlevel, games.gg, alcasthq, metaforge, foundinleonida), **3 × no response** (polygon, gamerant, thegamer). None proven dead; 12 need a manual check before shipping. |

Special caution for migration: the `loot` values carry **precise figures** ("$1,021–1,107", "$10,000 in marked bills"). Those are guide claims, not verified game data. Keep them but attribute them inline ("reported") rather than as facts.

---

## 7. What is reusable

**Keep (as content, not as code):**

1. The 16 records' `how` / `risk` / `loot` prose and their source links — the single most valuable artifact in the folder. Migrate into the new schema, demote precise numbers to reported values, and add real positions (§9).
2. The category **colour intuition** (red weapons, gold cash, teal safes, violet collectibles) — the palette is already GTA-adjacent and accessible on dark.
3. The localStorage discipline (guarded `try/catch` on read/write) and the export/import *idea*.
4. The `#loc=<id>` deep-link pattern.
5. The detail-panel information hierarchy (name → badges → loot → hint → risk → sources → found toggle).

**Discard entirely:** the SVG geography, the 9 × 13 grid, `square`/`dx`/`dy`, the manual pan/zoom engine, label collision heuristics, grid-square clustering, the inline-SVG-in-HTML approach, and the "dev" toolbar items.

---

## 8. Legitimate Leonida base maps and datasets

### 8.1 Licence summary

| Asset | Publisher / author | Licence | Self-host & adapt? | Notes |
| --- | --- | --- | --- | --- |
| **YANIS V17 map artwork** (normal / dark / nocams) | Yanis + the GTA VI Mapping Community, published by GTADB.ORG (`github.com/rolux/gtadb.org`) | **CC BY 4.0** (data/image licence `LICENSE-DATA`); software MIT | **Yes** — crop, downscale, re-encode, recolour; must credit, link the licence, and **state the changes** | Primary recommendation |
| **Community Map V18 tiles** | GTADB.ORG and contributors | **CC BY 4.0** | Yes | Marker-free view, 8,830 JPEG tiles, alternative to V17 |
| **GTA VI Landmarks Data** | GTADB.ORG and contributors (`rx`/rolux) | **CC BY 4.0** | Yes | 3,431 records, 3,340 with numeric positions; building/place index |
| **Rockstar printed Leonida map** (launch poster) | Rockstar Games / Take-Two | **All rights reserved** | **No** — no hosting, no tracing, no tiles | Cross-check reference only; link to rockstargames.com |
| Rockstar screenshots / trailers | Rockstar Games | All rights reserved | No | Cite facts; don't host frames |
| **MapGenie** Leonida map | MapGenie | Proprietary + ToS | **No** | UX inspiration only (as SPEC says). Do not crawl tiles or marker data |
| GTABase pins | GTABase | No clear open licence | **No** | Scraped from their product; avoid |
| gta6database "Clean SVG" trace | GTA6Database | Derived from CC BY raster, but the trace's own licence is **not stated as CC** | Not without permission | Could be requested; unnecessary for us |
| Guide-site text (IGN, GTA BOOM, Push Square, Polygon…) | Respective publishers | © each | Cite + link; paraphrase | Facts (item names, codes) are facts; prose is theirs |
| September 2022 leaked build assets | — | Copyrighted, legally tainted | **No** | Excluded on principle |
| Leaflet 1.9.4 | Volodymyr Agafonkin | BSD-2-Clause | Yes | Map engine; self-host under `assets/vendor/` |

Required attribution strings, verbatim from the upstream `LICENSE-DATA`:

> `GTA VI Map Tiles (CC BY 4.0) — https://map.gtadb.org`
> `GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org`

plus the artwork credit **"YANIS V17 · gtadb.org and all contributors"**, a link to `creativecommons.org/licenses/by/4.0/`, and a change notice (e.g. "cropped to remove the baked legend panel, downscaled to 7,500 px, re-encoded as WebP, tinted via CSS").

### 8.2 Technical facts of the YANIS V17 grid (verified here, and in GTADB's map-system doc)

- Image: **21,000 × 20,000 source pixels**, one map unit = one pixel at native resolution.
- Leaflet `CRS.Simple` bounds, GTADB order `[x_min, y_min, x_max, y_max]`: **`[-17000, -9000, 4000, 11000]`**.
- Tile pyramid: 256 px PNG, origin `[-17000, 11000]`, resolutions `[64, 32, 16, 8, 4, 2, 1]` at z0–z6, max tile indices `[1,1] [2,2] [5,4] [10,9] [20,19] [41,39] [82,78]`, counts `4, 9, 30, 110, 420, 1,680, 6,557` → **8,810 tiles**, 151 MB for the dark style. z7–z8 are display overzoom only (404 on the tile endpoint, verified).
- Public variants: `tiles/YANIS/v17/{normal|dark}/{z}/{x}/{y}.png` and `.../nocams/{normal|dark}/...` (`nocams` strips screenshot-camera overlays).
- **The artwork has a baked-in credits/legend board on the left ~28 % of the canvas.** It occupies source pixels `x < 6000` (map units `x < -11000`) and spans the full height, with the "INTERIORS" strip and a printed scale bar elsewhere. The V17 dark legend still prints "V16" (acknowledged upstream). **This panel must be cropped out**; no fan site should ship it as part of the map.
- Artwork content after cropping: **15,000 × 20,000 px**, i.e. `x ∈ [-11000, 4000]`, `y ∈ [-9000, 11000]` — a 3:4 portrait map, ideal for a map-first layout at any aspect.

### 8.3 Resolution: 1 map unit ≈ 1 metre

The artwork's printed scale bar (500 m / 1 km / 2 km / 3 km and ½ mi / 1 mi / 2 mi) measures **121–127 px per kilometre at z3** (resolution 8 units/px), i.e. **≈ 968–1,016 source units per km**. Therefore `metersPerUnit ≈ 0.98–1.03`, so distances in map units are metres to within ~2 %. This is good enough to show straight-line distances ("1.4 km") with a ±2 % caveat, and it is recorded as a calibration note rather than presented as an official figure.

### 8.4 Positional accuracy model available from the landmark data

`GTA VI Landmarks Data` is an object keyed `L1…L3431`; each value is an array:

```
[0] "Vice Regal, Washington Beach, Vice Beach"   display name, area chain
[1] [1409.40126306379, 2803.2135475894142]        map position, V17 frame (x, y)
[2] [1142, 720]                                    secondary pixel/source position
[3] "The Ritz-Carlton Bal Harbour, …"              real-world counterpart
[4] [25.899, -80.123]                              real-world lat/lng
[5] [676, 560]                                     secondary display position
[6] ["hotel"]                                      categories (types + zoom tiers l1…l8)
[7] "166624"                                       record hash
[8] [1794927390, …]                                timestamps
```

Distribution: **3,340 / 3,431 positioned**; areas with the most records: Vice City 1,145, Vice Beach 531, Key Lento 200, Port Gellhorn 196, Hamlet 175, Ambrosia 96. Categories are place/building types (`retail`, `hotel`, `residential`, `natural`, `transportation`, `industrial`, `unconfirmed`, `demolished`, zoom tiers `l1/l4/l6/l7/l8`) — **not** loot/collectible categories. Safehouse-tagged records: 4.

**Consequence:** this dataset is an excellent *place index* and the only trustworthy *coordinate source* we have, but it does **not** contain stashes, collectibles, weapons or safe codes. Those must stay hand-curated from cited guides and be labelled community-reported.

---

## 9. Verification of the coordinate frame (done, not assumed)

Projection used: `px = x + 17000`, `py = 11000 - y`, then scaled by 1/8 for the z3 stitched image. Three records projected onto the artwork:

| Record | Map (x, y) | Lands on | Result |
| --- | --- | --- | --- |
| `L266` Jason's House, Key Lento | (−2353.5, −5532.3) | Key Lento street grid, inside the built-up island | ✔ |
| `L530` Mount Kalaga, Lummox County | (−3430.5, 6370.6) | the mountain inside Mt. Kalaga National Park | ✔ |
| `L1` Vice Regal, Vice Beach | (1409.4, 2803.2) | the Collins Ave beachfront block strip | ✔ |

All three land on the correct feature at z3 (≈ 8 units/px) with no fudge factors, which confirms the frame, the y-inversion, and the canvas origin. A rebuild on this frame **will** place markers correctly; that is the fact the current prototype lacks.

---

## 10. Recommended base-map pipeline (decision)

**Use:** YANIS V17 `nocams/dark` (dark fits the SPEC's visual direction; `nocams` avoids camera-icon clutter), cropped to `x ∈ [-11000, 4000]`, `y ∈ [-9000, 11000]`.

**Why not hotlink:** the public tile endpoints work, but they are a community server with no availability commitment, and GTADB's own documentation notes it does no third-party tile hotlinking for exactly this reason. A companion site that goes blank when someone else's box reboots fails SPEC's "map loads reliably".

**Why not a single big image:** the cropped art is 15,000 × 20,000 (300 MP) — a decode that will kill mobile Safari. A locally built, 3-level WebP pyramid at 256 px tiles is ~1,600 files / ~15–20 MB and streams only what is on screen.

**Numbers** (master built from V17 z5, resolution 2 units/px, cropped to 7,500 × 10,000):

| Level | Pixels | Cols × rows | Tiles | Purpose |
| --- | --- | ---: | ---: | --- |
| `-4` | 938 × 1,250 | 4 × 5 | 20 | state overview, initial paint |
| `-3` | 1,875 × 2,500 | 8 × 10 | 80 | region |
| `-2` | 3,750 × 5,000 | 15 × 20 | 300 | city |
| `-1` | 7,500 × 10,000 | 30 × 40 | 1,200 | street (max native; 2× overzoom allowed) |

Plus one `assets/map/overview.webp` (≈ 250 KB) used as an always-present base layer so no gap is ever blank while tiles stream in.

**Fallbacks considered and rejected:** Rockstar's poster (copyright), MapGenie (proprietary), GTABase pins (no licence), gta6database SVG trace (unclear licence). Live tile hotlinking is documented in `PLAN.md` as an emergency fallback only, behind one config flag.

---

## 11. Risks and open questions for the next agents

1. **Asset acquisition is the only real risk.** The tile-builder must fetch ~1,680 z5 PNGs once; if the community server throttles, the build needs resume + retry and a documented manual fallback (fetch at z4 and accept 3.75 k master).
2. **Curation load.** 16 records must be re-positioned; each needs a real coordinate (from a guide's landmark description, from the landmark dataset, or an explicit estimate with an error radius). That is deliberate work, not a bulk transform — `square`/`dx`/`dy` carry no information.
3. **Baked labels.** The artwork includes printed place names ("VICE CITY", "LEONIDA KEYS", county names). Do not duplicate them as UI text on top of themselves; our labels should be marker labels and region fly-to chips only.
4. **Attribution must be visible in the UI**, not only in a README — SPEC and CC BY both require it.
5. **Do not import all 3,340 landmarks as pins.** They are a place index, not a checklist; ship them as an optional, off-by-default "Places" layer or as search suggestions.
6. Nothing was committed or pushed; `AGENTS.md` requires user approval before that.

---

### Appendix — reusable source list (all 32 links, for re-checking during implementation)

`gtaboom.com` ×3 · `gtaviceguides.com` ×4 · `ign.com/wikis/gta-6` ×6 · `foundinleonida.com` · `gta-xtreme.com` · `pushsquare.com` · `keengamer.com` ×4 · `gta6heists.com` · `itemlevel.net` · `games.gg` · `polygon.com` · `gamerant.com` · `gameta.gg` · `rockpapershotgun.com` · `alcasthq.com` · `metaforge.app` · `duuro.net` · `thegamer.com` · `gta6bugs.com`

Re-verify the 403/timeout URLs manually (browser, not curl) before dropping any of them; several are bot-blocked rather than dead.
