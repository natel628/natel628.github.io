# PLAN — GTA VI Interactive Leonida Map (`sites/gta6/`)

**Role:** Freebuff planning pass (step 1 of `SPEC.md`). Companion to `AUDIT.md`.
**Status:** approved direction for the rebuild; section 8 is the hand-off for **Cline**, section 10 the review checklist for **OpenCode**, section 6.9 the seam for **Kilo** to refine without touching the data model.

---

## 1. Goals, constraints, non-goals

**Goal.** A map-first Leonida companion: one real, licensed base map, honest positioning, polished detail, local progress, and a straight-line "waypoint" tool that never pretends to be GPS.

**Hard constraints**

- Vanilla HTML/CSS/JS, no build step, no framework. Runs from a static directory on GitHub Pages.
- Leaflet via a **pinned local copy** (`assets/vendor/leaflet/1.9.4/`) — no third-party CDN at runtime, so no supply-chain or availability dependency. (Pinned CDN is allowed by `AGENTS.md`; local is stricter and still dependency-free.)
- All location data lives in `sites/gta6/data/`; no coordinates in HTML/JS.
- Three verification tiers (`official` / `community` / `estimate`) are modelled in data and visible in the UI.
- Base imagery is **YANIS V17 via GTADB.ORG, CC BY 4.0** with in-UI credit, licence link and change notice (`AUDIT.md` §8).
- Nothing is committed or deployed without user approval.

**Non-goals:** live game/GPS integration, multiplayer, accounts, server sync, scraping, mobile-native app, 3D map, street-level routing.

---

## 2. Coordinate system — the one thing everything else depends on

### 2.1 Canonical frame

Everything speaks **V17 map units** (metres, north-positive). One unit = one pixel at native artwork resolution; `meterPerUnit = 1.0` (calibrated to ±2 % from the printed scale bar, `AUDIT.md` §8.3).

| Constant | Value | Source |
| --- | --- | --- |
| Full artwork extent, x | `-17000 … 4000` (21,000) | V17 grid origin + image size |
| Full artwork extent, y | `-9000 … 11000` (20,000) | V17 grid origin + image size |
| Baked legend panel (discard) | `x < -11000` | measured (source px `x < 6000`) |
| **Shipped crop (the map)** | `x ∈ [-11000, 4000]`, `y ∈ [-9000, 11000]` | 15,000 × 20,000 px |
| Native pixel of a point | `px = x + 17000`, `py = 11000 − y` | validated against 3 landmarks |

**Invariants**

1. `locations.json` stores `x`/`y` in this frame and **nothing else** — no pixels, no percentages, no grid squares.
2. Converters live in exactly one file (`js/core/geo.js`): `toPx(x,y)`, `toUV(x,y)`, `toLatLng(x,y)`, `fromLatLng(latlng)`. No other module does coordinate arithmetic.
3. Pixel/UV values are always **derived at runtime**, never persisted.

### 2.2 Leaflet configuration (no custom projection, no drift)

```js
// CRS.Simple: 1 map unit = 1 px at zoom 0; lat = y (north up), lng = x.
var map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -4.5, maxZoom: 0,        // integer tiles at -4…-1, max zoom = 2× overzoom
  zoomSnap: 0.25, zoomDelta: 0.5,
  wheelPxPerZoomLevel: 90,
  maxBoundsViscosity: 0.9,
  zoomControl: false, attributionControl: false
});
var BOUNDS = [[-9000, -11000], [11000, 4000]];   // [[yMin,xMin],[yMax,xMax]]
map.setMaxBounds(BOUNDS);
map.fitBounds(BOUNDS, { padding: [12, 12] });

L.tileLayer('assets/map/tiles/{z}/{x}/{y}.webp', {
  tileSize: 256, tms: true, noWrap: true,
  zoomOffset: 4,                       // map zoom -4…-1 -> tile dir 0…3 (no "-2" folders)
  minNativeZoom: -4, maxNativeZoom: -1,
  bounds: BOUNDS, keepBuffer: 3, updateWhenIdle: false
}).addTo(map);

// instant, always-aligned backdrop so a slow tile never leaves a blank hole
L.imageOverlay('assets/map/overview.webp', BOUNDS, { className: 'g6-overview', opacity: 0.9 }).addTo(map);
```

- `tms: true` because tiles are generated bottom-up (row 0 = south edge). `zoomOffset: 4` maps the negative map zooms onto positive directory names (`0`…`3`), which avoids directories like `-2/` in the repo and in shell commands. The builder writes `{z}/{x}/{y}` in TMS order; no custom `GridLayer`, no `map.unproject` gymnastics.
- Marker placement: `L.marker([y, x])`. That's it — Leaflet guarantees screen position at every zoom, resize and pinch.
- `maxBoundsViscosity: 0.9` + `setMaxBounds` prevents panning into void; `fitBounds` on boot and on the reset control.
- Fullscreen via the Fullscreen API on the app shell, with `webkit*` fallback; on `fullscreenchange` call `map.invalidateSize()`.

### 2.3 Base map build (`tools/build-map-tiles.mjs`, run once, output committed)

1. Fetch V17 `nocams/dark` z5 tiles (`x 0…41`, `y 0…39`, 1,680 PNGs) with concurrency 6, retry/backoff, resume from a local cache dir.
2. Stitch to 10,752 × 10,240 (2 units/px).
3. Crop to source `x 6000…21000`, `y 0…20000` → **7,500 × 10,000 master** (legend panel gone).
4. Emit pyramid levels at 256 px, bottom-up (TMS), WebP q72, into `assets/map/tiles/{0…3}/{x}/{y}.webp` (directory `0` = map zoom `-4`, `3` = map zoom `-1`).
5. Emit `assets/map/overview.webp` (938 × 1,250, q70) and `assets/map/manifest.json` (level table, tile counts, SHA-256 of the master, fetch date, source revision).
6. Print a size report; fail the run if the total exceeds 24 MB or any tile is not 256 px (except right/bottom edge tiles).

**Licence side-effects of this step (must ship):** crop (legend removed), downscale to 7,500 px wide, WebP re-encode, CSS tint — all listed as "changes made" in `data/credits.json` and in the UI credits panel.

**Emergency fallback only:** a `?remote-tiles=1` debug flag may point the same `L.tileLayer` at the public V17 grid (`https://map.stateofleonida.net/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png`) with an explicit on-screen "community tiles" notice. Never the default; never required.

---

## 3. File architecture

Replace `index.html`, `gta6.css`, `gta6.js` outright. Keep the folder's data path (`data/`).

```
sites/gta6/
├── index.html                     App shell only. No SVG artwork, no inline script/style beyond a boot guard.
├── AUDIT.md  PLAN.md  REPORT.md   Hand-off docs.
├── CREDITS.md                     Licence/attribution source of truth (mirrors data/credits.json).
├── css/
│   ├── tokens.css                 Custom properties: colour, type scale, spacing, radii, z-index, motion.
│   ├── base.css                   Reset, fonts, focus rings, scrollbars, skip link, utilities.
│   ├── layout.css                 App grid, rail, sheet, toolbars, breakpoints, safe areas.
│   ├── map.css                    Leaflet overrides, pin/cluster visuals, overview layer, attribution bar.
│   └── components.css             Buttons, chips, badges, category rows, progress, cards, modal, toast.
├── js/
│   ├── core/dom.js                $ , $$ , el(), on(), debounce, focus trap, toast.
│   ├── core/geo.js                THE converter module (§2.1) + distance/bearing in metres.
│   ├── core/state.js              In-memory state + subscribe/notify (tiny observable, ~40 lines).
│   ├── core/storage.js            Namespaced localStorage, versioned, guarded, migrate(), export/import validation.
│   ├── data.js                    Fetch + validate + normalise data/*.json; builds the search index.
│   ├── map.js                     Leaflet init, base layers, fit/reset, fullscreen, resize, minimap-free.
│   ├── markers.js                 Div-icon markers, cluster aggregation, selection/hover classes.
│   ├── filters.js                 Category toggles, verification toggles, hide-found, search, counts, clear-all.
│   ├── detail.js                  Detail panel/sheet rendering, actions, close, focus handling.
│   ├── navigation.js              Manual position, destination, straight-line connector, distance readout.
│   └── app.js                     Boot order, hash routing, wiring, error surface.
├── data/
│   ├── locations.json             Curated locations (§5.1).
│   ├── categories.json            Category registry (§5.2).
│   ├── regions.json               Regions/counties + fly-to targets (§5.3).
│   ├── map.json                   Frame + crop + tile manifest for the client (§5.4).
│   ├── credits.json               Attribution records rendered in the UI (§5.5).
│   └── archive/
│       └── locations-v3.json      The current 16-record file, untouched, for prose recovery.
├── assets/
│   ├── map/tiles/{z}/{x}/{y}.webp
│   ├── map/overview.webp
│   ├── map/manifest.json
│   ├── icons/sprite.svg           Symbol sprite: one glyph per category + UI icons.
│   ├── img/closeups/{id}.webp     Auto-cropped 480×270 map close-ups (CC BY, generated).
│   └── vendor/leaflet/1.9.4/      leaflet.js, leaflet.css, images/
└── tools/
    ├── build-map-tiles.mjs        §2.3.
    ├── import-landmarks.mjs       GTADB landmarks → place index for search (§5.6).
    ├── make-closeups.mjs          location close-up thumbnails from the master.
    └── validate-data.mjs          Schema/consistency gate, run before every commit (§9.1).
```

**Rules**

- Classic `<script defer>` tags, no modules, no bundler (repo convention: `sites/whats-happening`). One global namespace: `window.G6 = { dom, geo, state, storage, data, map, markers, filters, detail, nav }`. Files expose their slice and take no cross-module imports.
- Load order: Leaflet → `core/dom` → `core/geo` → `core/storage` → `core/state` → `data` → `map` → `markers` → `filters` → `detail` → `navigation` → `app`.
- `index.html` holds the DOM skeleton (toolbar, rail, sheet, detail host, credits dialog) and **no content data**. Budget ≤ 220 lines.
- Version strings: exactly one release token in `index.html` applied to all CSS/JS URLs (`?v=20261126.1`). Never two out-of-sync tokens (the old `?v=9` pairs caused commit `ba88e78`).
- `data.js` fails loudly and visibly: a dismissible boot-error card naming the file and HTTP status, plus retry — never a blank map.

---

## 4. CSS layout plan

### 4.1 Tokens (`css/tokens.css`)

```css
:root{
  /* surfaces */
  --g6-bg:#080a0f; --g6-surface:#0f131b; --g6-surface-2:#161c27;
  --g6-line:rgba(150,170,200,.14); --g6-line-strong:rgba(160,182,210,.3);
  /* ink */
  --g6-text:#e9eef8; --g6-muted:#93a1b8; --g6-dim:#6c7b92;
  /* brand + category colours (one source of truth, mirrored in categories.json) */
  --g6-accent:#ff3d7f; --g6-accent-2:#28e0cb;
  --cat-stash:#f0a35e; --cat-collectible:#b18cf0; --cat-easter:#ff5c8a;
  --cat-weapon:#e8536b; --cat-landmark:#7fd1ff; --cat-safehouse:#5ad48a;
  --cat-activity:#ffd166; --cat-shop:#8fb3d9;
  /* rhythm */
  --sp-1:.25rem; --sp-2:.5rem; --sp-3:.75rem; --sp-4:1rem; --sp-5:1.5rem; --sp-6:2rem;
  --r-sm:8px; --r-md:12px; --r-lg:18px; --r-pill:999px;
  /* rails */
  --rail-w:clamp(320px, 26vw, 400px); --rail-w-narrow:340px;
  --sheet-peek:96px;
  /* motion */
  --ease:cubic-bezier(.22,.61,.36,1); --dur-1:.14s; --dur-2:.24s; --dur-3:.4s;
  /* stacking (Leaflet panes sit at 200–700 *inside* #map) */
  --z-map:0; --z-map-ui:800; --z-toolbar:900; --z-rail:1000;
  --z-detail:1100; --z-sheet:1150; --z-modal:1200; --z-toast:1300;
}
```

Type: **Bebas Neue** for display numerals/headings is already in use and reads as GTA-adjacent without any Rockstar mark; **Inter** for UI. Self-host both as WOFF2 in `assets/fonts/` to remove the Google Fonts runtime dependency (`AUDIT.md` D22). Fallback stack must be metric-similar (`'Inter', system-ui, sans-serif`).

### 4.2 Desktop (≥ 1100 px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ rail (--rail-w)          │ map (flex 1, position:relative)               │
│ ┌──────────────────────┐ │ ┌───────────────────────────────────────────┐ │
│ │ brand + fullscreen   │ │ │ toolbar: search · count · verification    │ │
│ ├──────────────────────┤ │ │                                  ┌──────┐ │ │
│ │ search               │ │ │                                  │ zoom │ │ │
│ ├──────────────────────┤ │ │            base map              │ + −  │ │ │
│ │ progress (ring+%)    │ │ │                                  │ ⤢    │ │ │
│ ├──────────────────────┤ │ │                                  └──────┘ │ │
│ │ categories (8 rows)  │ │ │                                           │ │
│ │ filters / clear      │ │ │  ┌─────────────────────────────────────┐  │ │
│ ├──────────────────────┤ │ │  │ detail card (floating, right)       │  │ │
│ │ result list (scroll) │ │ │  │ name · badges · media · hint · src  │  │ │
│ └──────────────────────┘ │ │  └─────────────────────────────────────┘  │ │
│                          │ │ credits strip (bottom-left, small)        │ │
└─────────────────────────────────────────────────────────────────────────┘
```

- `.app { display:grid; grid-template-columns: var(--rail-w) minmax(0,1fr); height:100dvh; }`
- The rail is **one scroll container** with sticky section headers; the result list scrolls inside its own pane (`min-height:0` chain, `overscroll-behavior:contain`).
- The detail card floats over the map (`position:absolute; right:var(--sp-4); top:calc(var(--sp-5) + 56px); width:min(400px, 38vw); max-height:calc(100% - 220px); overflow:auto`). It must never resize the map: no layout shift, no `invalidateSize()` on open.
- Map fills 100 % of its column; the art (3:4 portrait) is centred by `fitBounds` at boot, so ocean bands are minimal and intentional, not letterboxing.

### 4.3 Tablet (760–1099 px)

- Rail collapses to a **56 px icon rail** (category glyphs with active state); clicking expands a 320 px fly-out drawer over the map (glass, `backdrop-filter: blur(18px)`), dismiss on outside click / `Esc`.
- Toolbar becomes a single row: menu button, search pill, count.

### 4.4 Mobile (< 760 px)

```
┌──────────────────────────────┐
│ ☰   search pill   ⛶   84%   │  floating toolbar, safe-area aware
│                              │
│          map (100%)          │
│                              │
│                        ⊕ ⊖   │  zoom stack above sheet
├──────────────────────────────┤
│ ═══  handle                  │  bottom sheet: peek 96px
│ Visible · 12 of 16           │
│ [chips row: categories]      │
│ list / detail (scroll)       │
└──────────────────────────────┘
```

- Bottom sheet with three snaps: **peek (96 px)**, **half (45dvh)**, **full (85dvh)**. Snap via CSS `translateY` + `transition: transform var(--dur-2) var(--ease)`; drag with pointer events and a 40 px/s velocity threshold. `touch-action: pan-y` on the sheet, `touch-action:none` on the map container (Leaflet handles it).
- Selecting a marker opens the sheet at **half** and renders detail into the same host as the list (single component, two containers — see §7.5).
- Floating controls stack bottom-right with `bottom: calc(var(--sheet-peek) + var(--sp-4) + env(safe-area-inset-bottom))`, so they move with the sheet state via one CSS custom property set from JS (`--sheet-h`).
- Tap targets ≥ 44 px; chips horizontally scrollable with `scroll-snap-type: x proximity`.

### 4.5 Markers, labels, clusters (`css/map.css`)

- `L.divIcon` with an inline `<svg><use href="assets/icons/sprite.svg#pin-weapon"/></svg>`: 30 × 38 px body, `iconAnchor:[15,36]`. **Markers do not scale with zoom** — constant hit area at every level (this is the fix for `AUDIT` D3).
- Found state: desaturated body, accent check badge, `opacity:.55`, still clickable. Estimate tier: dashed ring + `?` badge. Custom pins: white dashed outline.
- Selected: `zIndexOffset: 1000` + 8 px halo; no size change (avoids re-anchoring).
- Cluster: custom, not a plugin — bucket marker pixel positions at the current view, merge within **38 px**, render a `divIcon` circle with count and the dominant category colour; click → `map.flyTo` the cluster's bounds. Recompute only on `zoomend` and `moveend` (debounced), never per frame.
- Printed place names are already in the artwork: our text layer is limited to marker labels (visible at zoom ≥ -1.5), the scale-derived distance chip, and a **single** credit strip. No duplicate "VICE CITY" labels.

### 4.6 States that must be designed, not fallen into

`loading` (overview + shimmer toolbar), `empty-filter` ("no locations match" + clear action), `no-progress`, `tiles-slow` (overview remains), `error` (boot-error card with retry), `offline` (progress still works; banner), `reduced-motion` (all transitions off, sheet snaps instantly), `focus-visible` (2 px accent ring on every interactive element), `coarse-pointer` (bigger targets, no hover-only affordances).

---

## 5. Data schemas

### 5.1 `data/locations.json`

Envelope, not a bare array. Example record uses a **real** GTADB landmark so the coordinate example is honest:

```json
{
  "schema": "gta6.locations/1",
  "updated": "2026-11-26",
  "coordinateSpace": "leonida-v17-meters",
  "license": "Positions: CC BY 4.0 via GTADB.ORG. Editorial text: site author, all rights reserved.",
  "locations": [
    {
      "id": "vice-regal-hotel",
      "name": "Vice Regal Hotel",
      "aliases": ["Washington Beach hotel"],
      "category": "landmark",
      "tags": ["hotel", "beachfront"],
      "region": "vice-city",
      "county": "vice-dale",
      "position": {
        "x": 1409.4,
        "y": 2803.2,
        "method": "source",
        "accuracy": 15,
        "note": "Position from GTADB landmark L1 (identity coordinates on the V17 frame)."
      },
      "verification": "community",
      "evidence": [
        { "type": "dataset", "label": "GTA VI Landmarks Data (CC BY 4.0)", "url": "https://map.gtadb.org", "accessed": "2026-11-26" }
      ],
      "summary": "Beachfront hotel block on Collins Avenue, Washington Beach.",
      "description": "…one short paragraph for the detail panel…",
      "hint": "…how to reach it in-game…",
      "rewards": [],
      "code": null,
      "risk": null,
      "media": [
        { "type": "closeup", "src": "assets/img/closeups/vice-regal-hotel.webp", "alt": "Map close-up of Vice Regal Hotel", "credit": "Map close-up, YANIS V17 via GTADB.ORG (CC BY 4.0)" }
      ],
      "sources": [],
      "added": "2026-11-26",
      "updated": "2026-11-26"
    }
  ]
}
```

| Field | Type | Required | Rules |
| --- | --- | --- | --- |
| `id` | string | ✔ | kebab-case, unique, **permanent** (progress keys depend on it); `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `name` | string | ✔ | 2–60 chars, in-game place name preferred over description |
| `aliases` | string[] | – | search-only synonyms (old names, guide names) |
| `category` | enum | ✔ | must exist in `categories.json` |
| `tags` | string[] | – | free-form, ≤ 8, lowercase |
| `region` | enum | ✔ | must exist in `regions.json` |
| `county` | enum | – | `vice-dale`, `mariana`, `kelly`, `leonard`, `lummox` |
| `position.x` / `.y` | number | ✔ | metres in V17 frame; x `-17000…4000`, y `-9000…11000`; must sit inside the shipped crop |
| `position.method` | enum | ✔ | `source` (dataset/official artefact), `interpolated` (derived from two known features), `estimated` (from prose) |
| `position.accuracy` | number | ✔ | error radius in metres; `source` ≤ 60, `interpolated` ≤ 250, `estimated` > 250 |
| `position.note` | string | ✔ | one sentence naming the evidence for the position |
| `verification` | enum | ✔ | `official` \| `community` \| `estimate` — drives the badge and the filter |
| `evidence` | object[] | ✔ (≥1 unless `official` with primary artefact) | `{type: official|dataset|guide|video, label, url, accessed}`; `url` https only |
| `summary` | string | ✔ | ≤ 120 chars, list-row text |
| `description` | string | ✔ | ≤ 900 chars, own words, no copied guide prose |
| `hint` | string | – | ≤ 400 chars, discovery directions |
| `rewards` | string[] | – | reported figures must be phrased as reported ("~$1,000 (reported)") |
| `code` | string \| null | – | safe/keypad codes; render as monospace; disputed codes as `"0300 (0300 / 0330 reported)"` |
| `risk` | enum \| null | – | `none` \| `low` \| `medium` \| `high` |
| `media` | object[] | – | `{type: closeup|screenshot|user, src, alt, credit, url?}`; `src` must be a local relative path; `credit` required |
| `sources` | object[] | – | `{label, url, note?}`; https only; rendered with `rel="noopener noreferrer"` |
| `added` / `updated` | ISO date | ✔ | `YYYY-MM-DD` |

**Validation rules beyond the table:** every `official` record needs an `evidence` entry of `type:"official"`; every `estimate` needs `accuracy ≥ 300`; no two records within 25 m with the same `category` (likely duplicate); `rewards`/`code` may only appear when at least one source exists.

### 5.2 `data/categories.json`

```json
{
  "schema": "gta6.categories/1",
  "categories": [
    { "id": "stash",       "label": "Stashes & Treasure",   "short": "Stashes",    "color": "#f0a35e", "glyph": "stash",      "order": 10, "blurb": "Cash stashes, safes and hidden caches." },
    { "id": "collectible", "label": "Collectibles",         "short": "Collect.",   "color": "#b18cf0", "glyph": "collect",    "order": 20 },
    { "id": "easter-egg",  "label": "Easter Eggs & Secrets","short": "Secrets",    "color": "#ff5c8a", "glyph": "secret",     "order": 30 },
    { "id": "weapon",      "label": "Unique Weapons",       "short": "Weapons",    "color": "#e8536b", "glyph": "weapon",     "order": 40 },
    { "id": "landmark",    "label": "Landmarks",            "short": "Landmarks",  "color": "#7fd1ff", "glyph": "landmark",   "order": 50 },
    { "id": "safehouse",   "label": "Safehouses",           "short": "Safehouses", "color": "#5ad48a", "glyph": "safehouse",  "order": 60 },
    { "id": "activity",    "label": "Activities",           "short": "Activities", "color": "#ffd166", "glyph": "activity",   "order": 70 },
    { "id": "shop",        "label": "Shops & Services",     "short": "Shops",      "color": "#8fb3d9", "glyph": "shop",       "order": 80 }
  ]
}
```

Exactly SPEC's eight categories. `color` must equal the matching `--cat-*` token; `validate-data.mjs` enforces it. Adding a category means: JSON entry + token + sprite glyph (no JS changes).

### 5.3 `data/regions.json`

```json
{
  "schema": "gta6.regions/1",
  "regions": [
    { "id": "vice-city", "label": "Vice City", "type": "area", "county": "vice-dale",
      "focus": { "x": 1200, "y": 2200, "zoom": -1.5 } },
    { "id": "leonida-keys", "label": "Leonida Keys", "type": "area", "county": "mariana",
      "focus": { "x": -2350, "y": -5500, "zoom": -1.5 } }
  ],
  "counties": [
    { "id": "vice-dale", "label": "Vice-Dale County" },
    { "id": "mariana",   "label": "Mariana County" },
    { "id": "kelly",     "label": "Kelly County" },
    { "id": "leonard",   "label": "Leonard County" },
    { "id": "lummox",    "label": "Lummox County" }
  ]
}
```

Six official areas (Vice City, Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia, Mount Kalaga National Park) + the five printed counties. `focus` powers region chips and "fly to region". County shading is **not** attempted (extents are estimates; shipping shaded boundaries would imply accuracy we do not have).

### 5.4 `data/map.json`

```json
{
  "schema": "gta6.map/1",
  "frame": { "xMin": -17000, "yMin": -9000, "xMax": 4000, "yMax": 11000, "metersPerUnit": 1.0,
             "scaleCalibration": "printed 1 km bar = 968–1016 units (±2%)" },
  "crop":  { "xMin": -11000, "yMin": -9000, "xMax": 4000, "yMax": 11000,
             "widthPx": 15000, "heightPx": 20000, "removedPx": { "xMin": 0, "xMax": 6000, "reason": "baked credits/legend panel" } },
  "tiles": { "template": "assets/map/tiles/{z}/{x}/{y}.webp", "tileSize": 256, "tms": true,
             "zoomOffset": 4, "minNativeZoom": -4, "maxNativeZoom": -1, "levels": [
               { "z": -4, "tileZ": 0, "width": 938,  "height": 1250,  "cols": 4,  "rows": 5 },
               { "z": -3, "tileZ": 1, "width": 1875, "height": 2500,  "cols": 8,  "rows": 10 },
               { "z": -2, "tileZ": 2, "width": 3750, "height": 5000,  "cols": 15, "rows": 20 },
               { "z": -1, "tileZ": 3, "width": 7500, "height": 10000, "cols": 30, "rows": 40 }
             ] },
  "overview": "assets/map/overview.webp"
}
```

The client reads this instead of hard-coding numbers; `geo.js` reads `frame`, `map.js` reads `tiles`.

### 5.5 `data/credits.json` (rendered in a "Credits & licences" dialog, linked from the map strip)

```json
{
  "schema": "gta6.credits/1",
  "entries": [
    { "asset": "Map artwork", "work": "YANIS V17 (dark, no-camera variant)",
      "author": "Yanis and the GTA VI Mapping Community", "via": "GTADB.ORG",
      "license": "CC BY 4.0", "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
      "sourceUrl": "https://map.gtadb.org",
      "changes": "Cropped to remove the baked credits/legend panel, downscaled to 7,500 px wide, re-encoded as WebP, tinted in CSS. Markers, filters and interface are ours.",
      "requiredAttribution": "YANIS V17 · gtadb.org and all contributors · CC BY 4.0" },
    { "asset": "Place positions", "work": "GTA VI Landmarks Data", "author": "GTADB.ORG and contributors",
      "via": "gtadb.org", "license": "CC BY 4.0",
      "sourceUrl": "https://map.gtadb.org",
      "requiredAttribution": "GTA VI Landmarks Data (CC BY 4.0) — https://map.gtadb.org" },
    { "asset": "Map engine", "work": "Leaflet 1.9.4", "author": "Volodymyr Agafonkin",
      "license": "BSD-2-Clause", "sourceUrl": "https://leafletjs.com" },
    { "asset": "Trademarks", "work": "Grand Theft Auto VI", "author": "Rockstar Games / Take-Two Interactive",
      "license": "All rights reserved",
      "notes": "Unofficial fan project. Not affiliated with, endorsed by, or sponsored by Rockstar Games or Take-Two Interactive. Game imagery is not redistributed." }
  ]
}
```

### 5.6 Place index (optional layer) — `tools/import-landmarks.mjs`

Derives `data/places.json` from GTADB landmarks: `{id, name, area, x, y, cats}` for the 3,340 positioned records, dropping `unconfirmed`/`demolished` by default. Used **only** for search suggestions and an off-by-default "Places" layer; it never enters the checklist or the progress denominator. Keep it out of the first release unless the map feels sparse.

### 5.7 Local progress (`core/storage.js`)

```json
{
  "schema": "gta6.progress/1",
  "version": 1,
  "found": { "three-sheets-liquor": "2026-11-26T18:04:11Z" },
  "notes": { "apollo-aggregates": "came in from the east gate" },
  "position": { "x": -2100, "y": -4100, "set": "2026-11-26T18:20:00Z" },
  "custom": [
    { "id": "c-1a2b3c", "name": "My stash", "x": -1980.5, "y": -4220.0,
      "category": "stash", "note": null, "created": "2026-11-26T18:22:00Z" }
  ],
  "prefs": { "categories": ["stash","collectible"], "verification": ["official","community"],
             "hideFound": false, "layerPlaces": false }
}
```

- Keys: `gta6:progress:1`, `gta6:ui:1` (last view), `gta6:migrated:v3` (bool).
- **Migration from the prototype**: `gta6.found.v3` ids that still exist are carried over (the 16 ids survive unchanged); `gta6.mine.v3` pins cannot be positioned in the new frame, so they are imported as `notes`-only entries and a one-time toast explains it. No silent data loss.
- Import validation: `max 1 MB`, schema tag required, `found` ids whitelisted against loaded locations, `notes` ≤ 500 chars, `custom[].x/y` range-checked, unknown keys dropped, `media.src` never imported.
- Export: same object, `application/json` download, date-stamped filename.
- Progress denominator = **curated locations only**; custom pins are excluded (fixes `AUDIT` D11).

---

## 6. UX and feature plan (SPEC → module)

### 6.1 Map surface
`map.js`: boot fit, `+`/`−`/reset controls (custom buttons calling `zoomIn/zoomOut/fitBounds`), full-screen toggle, keyboard pan (Leaflet default when focused, plus `+/-/0` handled app-side), pinch via Leaflet, `map.invalidateSize()` on resize/`orientationchange`/fullscreen, and a `ResizeObserver` on the map column (not a window listener) so the rail expanding never leaves stale tiles.

### 6.2 Markers
`markers.js`: one `L.layerGroup` for locations, one for custom pins. Re-render on `state` change of `visibleIds` only; diff by id so markers keep DOM identity and never flicker (`AUDIT` D4). Selected marker gets `zIndexOffset` and an `aria-current` attribute.

### 6.3 Detail
`detail.js`: fields per SPEC — name, category chip, region/county, description, hint, rewards, code, risk, verification badge + `accuracy` ("± 40 m"), evidence links, close-up media, actions (**Mark found**, **Set as destination**, **Copy link**, **Add note**). One renderer, two hosts (desktop card / mobile sheet), switched by a media query, not by JS duplication.

### 6.4 Search
`filters.js`: debounced 120 ms; index over `name`, `aliases`, `summary`, `hint`, `tags`, `region` label; diacritic-folded and lowercase; ranked: exact > prefix > word-start > substring; shows the match count live. `Esc` clears.

### 6.5 Filters
Category toggles (with counts), Show all / Hide all, **Hide found**, **verification tiers** (official/community/estimate as a legend-style multi-toggle, so the three tiers required by SPEC are both visible and filterable), **Clear all** resets to the default preset. A persistent bar shows "12 of 16 visible" in the rail header and a compact chip on mobile.

### 6.6 Progress
`state` + `storage`: ring in the rail header (`found / curated`), per-category micro-bars, "Reset progress" behind a confirm dialog with the exact count ("this removes 7 discoveries and 2 notes"), export/import in the same dialog.

### 6.7 Navigation (honesty first)
`navigation.js`: a **Set my position** mode (button → crosshair cursor → click map; long-press on touch). Stored position renders as a distinct ring marker. Choosing **Set as destination** on a location draws a dashed `L.polyline` (screen-space straight line) with a midpoint chip showing distance in km/m and a caption "Straight-line distance — not a road route. Manual waypoint, no in-game tracking." Clearing either endpoint removes the line. Distance = `Math.hypot(dx, dy) / 1000` km (units are metres, ±2 %).

### 6.8 Custom pins and notes
Click-to-place pin with name/category/note; stored in `custom`; listed in a "My pins" section; editable and deletable. Notes on curated locations are separate (`notes`) and never affect completion.

### 6.9 Seams for Kilo (UX/UI review, step 2)
Everything visual lives behind tokens and component classes; Kilo can retune palette, spacing, marker shapes, sheet physics and iconography without touching `data/` or coordinate code. Constraints Kilo must respect: map ≤ 100 % of the viewport height with no page scroll, ≥ 44 px targets, ≥ 4.5:1 contrast, no Rockstar marks, category colour = `categories.json`.

### 6.10 State and routing
`app.js` parses `#l=<id>` (deep link to a location) and `#p=<x>,<y>,<z>` (camera); `hashchange` opens/closes detail; selection uses `history.replaceState` (no history spam). Filters persist in storage, not in the URL (keeps links short and stable).

---

## 7. Performance and accessibility budgets

| Budget | Target |
| --- | --- |
| HTML + CSS + JS (uncompressed) | ≤ 160 KB total |
| First tile batch | ≤ 12 requests; overview visible < 1.2 s on a warm cache |
| Base map payload (committed) | ≤ 24 MB, ≤ 1,650 files |
| Pan/zoom | no DOM rebuild during gestures; long tasks < 50 ms |
| Markers | 200 curated markers without clustering lost frames; clustering kicks in ≥ 120 visible |
| Images | all `loading="lazy"`, explicit `width`/`height`, WebP |
| A11y | keyboard-only usable, visible focus, `aria-live` on count/progress, focus trap in dialogs, `prefers-reduced-motion` honoured, 4.5:1 contrast, map has a text alternative (the list) |

---

## 8. Build order for Cline (with acceptance tests)

**P0 — Spine (do this first, stop if it fails).**
Build tiles for **one** level (`-2` is enough), wire `index.html` + `map.js` + `overview.webp`, add three calibration markers from GTADB (`L266` Key Lento, `L530` Mt. Kalaga, `L1` Vice Regal).
✅ Accept: each marker sits on its feature at max zoom; pan/zoom/pinch never shifts a marker relative to the artwork; no blank tiles; mobile pinch is smooth.

**P1 — Shell and chrome.** Rail, toolbar, detail card, sheet scaffold, tokens, responsive breakpoints, credits strip + dialog, error/loading states.
✅ Accept: 1440 / 1024 / 768 / 390 px viewports all usable one-handed; no horizontal scroll; fullscreen works; credits reachable in ≤ 2 taps.

**P2 — Data and markers.** Schema, `validate-data.mjs`, migrate the 16 records (reposition each: `source` from landmarks where possible, otherwise `estimated` with an honest radius), category/media plumbing, close-ups.
✅ Accept: validator passes; all 16 have `method`+`accuracy`+evidence; no record claims `official` without an official artefact; detail shows all SPEC fields.

**P3 — Discovery.** Search, filters, verification toggles, counts, empty state, list row → map fly-to.
✅ Accept: search "liquor" finds the store; toggling a category updates pins, list and count together; clear-all restores the default; keyboard-only traversal of the filter list works.

**P4 — Progress and navigation.** Found/notes/custom pins, storage + migration, export/import, reset; position/destination/distance.
✅ Accept: reload preserves everything; export → wipe → import round-trips; migration from `gta6.found.v3` verified with a seeded localStorage; distance matches the scale bar within 2 %; the "not a route" caption is present.

**P5 — Hardening.** Lighthouse pass, a11y sweep, reduced motion, tile budget check, `REPORT.md` inputs.
✅ Accept: no console errors/warnings; ≤ 160 KB JS+CSS; tab order logical; contrast checks pass.

**Do not:** introduce a framework, a bundler, a CSS framework, map plugins for clustering, a Google Fonts request, or any Rockstar/MapGenie asset.

---

## 9. Verification gates

### 9.1 `tools/validate-data.mjs` (must pass before commit)

- JSON parses; schema tags correct; ids unique/kebab; enums valid; cross-references exist (`category`, `region`, `county`).
- Positions inside crop; `accuracy` consistent with `method`; `official` ⇔ official evidence.
- No duplicate (category, position within 25 m); `code`/`rewards` only with sources.
- Category colours match CSS tokens; region ids match `regions.json`; every `media.src` file exists.

### 9.2 Manual checks

Tile seam check at each level (stitch z-2 next to z-1 boundaries), marker drift check (zoom in/out on a fixed marker, confirm it stays on the same building), iOS Safari pinch + `100dvh` + safe areas, offline reload with progress intact, and a **licence audit**: credits dialog names the artwork, the data, the engine, the changes, and links CC BY 4.0.

### 9.3 Review checklist for OpenCode (step 4)

Coordinate maths confined to `geo.js`; no `!important` in map CSS; no per-frame DOM writes; no `innerHTML` with data-derived strings; import path validated; storage migrations idempotent; lazy loading on every image; Leaflet version pinned locally; credits complete; no fabricated coordinates; `REPORT.md` lists changed files, features, limitations and every check actually run.

---

## 10. Open decisions (small, non-blocking)

1. Self-host Bebas Neue + Inter (recommended, removes Google dependency) vs keep the CDN.
2. Ship the "Places" landmark layer in v1 (richer search, more clutter) or defer to v1.1.
3. Close-up thumbnails: generate for all 16 (recommended, cheap, on-licence) or only for locations with licensed reference images.
4. Whether to ask GTA6Database for permission to use their traced SVG (would cut tile weight dramatically); not needed for v1.

---

## 11. Kilo UX/UI Review

**Role:** Kilo review pass (step 2 of `SPEC.md`). Assessment against MapGenie's Leonida map as the reference, checking four criteria: map occupies ≥ 85 % of the viewport, panels collapse cleanly on mobile, marker icons are distinct without clutter, and official vs. community/unverified locations are visually unambiguous.

**Verdict in brief.** The plan's bones are sound — Leaflet, real tiles, token-driven CSS — but several layout decisions borrow a desktop-first mental model that will shrink the map below the target threshold, collapse the panel in a way that leaves ghost space on mobile, and produce a marker system where the three verification tiers differ in shape but share the same visual weight. The changes below are targeted; none require touching `data/` or `js/core/`.

---

### 11.1 Map area: reaching ≥ 85 % of the viewport

**Current plan:** `--rail-w: clamp(320px, 26vw, 400px)`. At the common 1280 px laptop viewport that rail is 333 px wide — 26 % of horizontal space. At 1440 px it reaches 374 px. The map column is `minmax(0, 1fr)`, which works in principle, but three additional elements chew into the map's perceived area: the top toolbar sitting inside the map column, the floating detail card taking `min(400px, 38vw)` from the right edge, and the `padding: [12, 12]` on `fitBounds`. On a 1280 × 800 laptop with the detail card open, the visible map area is roughly `(1280 − 333 − 400) × (800 − 48) = 547 × 752 px` — only 40 % of total viewport pixels.

**Problems:**
- 26 vw rail is too generous on a 1440 px display and already at 320 px on anything under 1230 px. The jump from "reasonable" to "tight" happens at an awkward width with no intermediate step.
- The floating detail card is sized in viewport width (`38vw = ~550 px` at 1440 px) and anchored at `right: var(--sp-4)`. It opens inside the map column, but because `width: min(400px, 38vw)` is not capped by the available map width, it can overlap the map content area rather than constraining itself to spare space.
- `fitBounds` with 12 px padding is fine technically, but on wide non-square viewports the 3:4 portrait map will letter-box with significant blank ocean bands left and right. Those bands are dead pixels the user perceives as "not map", reducing the felt map density even when the map `div` is 100 % of its column.

**Required changes for `§4.2` and `tokens.css`:**

1. **Narrow the rail.** Change `--rail-w` to `clamp(280px, 22vw, 360px)`. At 1280 px this yields 282 px (22 %) — 51 px narrower. That alone reclaims the gap between 42 % and 48 % of horizontal pixels for the map.
2. **Cap the rail at the threshold, not at a pixel value.** Add a CSS rule so that if the viewport is 1100–1280 px (the "tablet-to-small-laptop" band that the plan skips), the rail is exactly 280 px and can be collapsed to a 48 px icon strip with one click, restoring 100 % width to the map. Add `--rail-collapsed-w: 48px` to the token set and a `.app.rail-collapsed` variant that sets `grid-template-columns: var(--rail-collapsed-w) 1fr`.
3. **Move the detail card to a sidebar slot, not an overlay.** The floating card approach (absolute, over the map) counts against the ≥ 85 % rule because the user cannot pan behind it. Instead: on desktop ≥ 1100 px, when no detail card is open the rail is the only panel; when a detail card opens, the **rail narrows to its icon-strip mode** (48 px) and the **detail card expands into a fixed 320 px panel on the right edge of the map column** using CSS `grid-template-columns: var(--rail-collapsed-w) 1fr 320px`. The map column remains `1fr` between them. This keeps the map at ≥ `1fr / (48 + 1fr + 320)` ≈ whatever space is left, and both panels have defined widths the map layout can account for — no overlap. Net result: on 1280 px, map = `1280 − 48 − 320 = 912 px` = 71 % horizontal × nearly full height ≈ 83 % of viewport area. On 1440 px, `1440 − 48 − 320 = 1072 px` = 74 % horizontal ≈ 87 % of viewport area. With the rail in full mode and no detail open: `1440 − 280 = 1160 px` = 80 % horizontal ≈ 88 % of viewport area.
4. **Reduce `fitBounds` padding on wide screens.** Use `map.fitBounds(BOUNDS, { padding: [8, 8] })` as the default. The 12 px padding in the plan is immaterial but the ocean bands are a symptom of the 3:4 portrait map fitting inside a wider container. Add a `g6-overview` CSS overlay behind the tile layer that uses `--g6-bg` (#080a0f), so that any visible ocean band outside the map's geographic bounds reads as intentional chrome, not broken tiles or blank white. The `L.imageOverlay` for the overview already exists — extend its bounding box by 10 % outside `BOUNDS` so the dark fill bleeds into the gutter seamlessly.

---

### 11.2 Panel collapse on mobile: three failure modes to fix

The bottom-sheet design (§4.4) is correct in principle — MapGenie uses exactly this pattern — but the plan has three gaps that will cause the panel to leave ghost space or fight with Leaflet's touch handling.

**Failure mode 1 — the sheet blocks the map when at "peek" height.**
The plan puts floating zoom controls at `bottom: calc(var(--sheet-peek) + var(--sp-4) + env(safe-area-inset-bottom))`. That means at peek height (96 px) the zoom stack sits at ≈ 108 px from the bottom. But the sheet's drag handle at 96 px is itself a 40 px tap target, so the effective dead zone at the bottom of the map is 136 px + safe area — 17 % of a 390 × 844 screen is off-limits for map interaction. On a 375 px viewport that is enough to hide the bottom quarter of the keys.

**Fix:** Reduce peek height to `72px` (`--sheet-peek: 72px`). 72 px fits one line of text ("12 of 16 visible") + a 6 px handle nub with comfortable touch padding. Reposition zoom controls to `bottom: calc(var(--sheet-peek) + var(--sp-3))` — this brings them to ≈ 84 px from the bottom. The map then occupies 760 px of a 844 px screen at peek = 90 %. With a safe-area of 34 px (iPhone 14) the usable map is 726 px = 86 %.

**Failure mode 2 — `touch-action: none` on the map will prevent momentum scroll on the sheet.**
The plan correctly sets `touch-action: none` on the map container so Leaflet can intercept all touch events. But the sheet is a sibling of the map container in the DOM (it overlays it), so when the sheet is in `half` or `full` snap, the user's upward scroll gesture on the list inside the sheet will be captured by Leaflet's global pointer listener unless the event is explicitly stopped.

**Fix:** Add `pointer-events: none` to the map container when the sheet is at `half` or `full` snap, and restore it when the sheet returns to `peek`. Drive this with a data attribute (`data-sheet-snap="peek|half|full"` on `<body>`) so CSS can toggle it with one rule:

```css
body[data-sheet-snap="half"] #map,
body[data-sheet-snap="full"] #map {
  pointer-events: none;
}
```

The zoom controls and toolbar stay interactive because they are `position: fixed` or `z-index > z-sheet` with their own `pointer-events: auto`.

**Failure mode 3 — no visual feedback that the rail/sheet can be fully dismissed.**
The plan describes a drawer on tablet (§4.3) that dismisses on outside click, but there is no collapse trigger inside the rail itself on desktop. Users who want maximum map area on a 1100 px laptop have no affordance. Similarly, on mobile there is no button to fully hide the sheet below the screen (sometimes you just want the map).

**Fix:**
- **Desktop/tablet rail:** add a `◀` collapse toggle button at the bottom of the rail (`position: sticky; bottom: 0`), 48 × 48 px, that toggles `.app.rail-collapsed`. Its icon flips to `▶` when collapsed. This is a single `<button>` and one class toggle — no JS complexity.
- **Mobile sheet:** add a fourth snap: `hidden` (`translateY(100%)`). The sheet handle area includes a small `×` button (top-right of the handle bar, 32 × 32 px, opacity 0.7) that sets the snap to `hidden`. Tapping any marker on the map restores it to `peek`. The `hidden` snap must not persist across page loads — it resets to `peek` on boot.

---

### 11.3 Marker icon distinctiveness: shape, fill, and size

The plan specifies 30 × 38 px `L.divIcon` with an inline `<svg><use>` referencing the sprite. That is correct. The gaps are in the sprite design spec, which the plan leaves entirely to Cline ("one glyph per category"). Without explicit guidance, Cline will produce eight circle icons with different fills, which is what every other fan map does — and which fails the "distinct without clutter" criterion because at zoom `-3` or lower (the city-level overview), filled circles of different colours blend into a uniform cluster of dots and the category is unreadable.

**Principles for Cline to implement (add to §4.5):**

1. **Shape distinguishes category family, not just colour.** Group the eight categories into three shape families:
   - **Diamond/lozenge** (rotated square, `transform: rotate(45deg)` on the icon body): `stash`, `weapon` — the two categories users are most urgently hunting. Diamond is visually loud and rare in ambient cartography, so it draws the eye.
   - **Shield** (pentagon, narrow at bottom): `safehouse`, `activity` — persistent/functional locations a player returns to.
   - **Teardrop/pin** (the classic map pin silhouette): `collectible`, `easter-egg`, `landmark`, `shop` — informational points of interest.

   This means even a colour-blind user can distinguish the three functional categories (hunt vs. base vs. info) by silhouette alone, before reading colour.

2. **Glyph inside the shape.** Each icon has a single SVG path centered in the shape body: a bag/coin for `stash`, a gun for `weapon`, a house for `safehouse`, a flag for `activity`, a star for `collectible`, a question-mark for `easter-egg`, a camera for `landmark`, a shopping-bag for `shop`. The glyph must be legible at **12 × 12 px** (the icon body at zoom `-4`). Prefer single-stroke glyphs with 1.5 px stroke width over filled outlines, because they remain crisp at small sizes.

3. **Size tiering by zoom, not by dragging around.** The current plan has markers at a constant 30 × 38 px. At zoom `-4` (the full-map overview) this is fine; at zoom `-1` (street level) it is too small relative to the artwork details. Use Leaflet's `zoomend` event (not per-frame) to swap a single CSS class on the map container:
   ```
   zoom ≤ -3.5  → .g6-zoom-far   → icon 24×30px, label hidden
   zoom -3.5 to -1.5 → .g6-zoom-mid → icon 30×38px, label shown for selected only
   zoom > -1.5  → .g6-zoom-near  → icon 36×46px, label shown always
   ```
   Implement via a single class on `#map` and CSS rules — no per-marker DOM writes, no `iconSize` mutation:
   ```css
   .g6-zoom-far  .g6-pin { width: 24px; height: 30px; }
   .g6-zoom-near .g6-pin { width: 36px; height: 46px; }
   ```
   Leaflet's `iconAnchor` is defined as a pixel pair at construction time, so update `iconAnchor` only on `zoomend` for the three CSS classes, using a simple lookup in `markers.js` (three values, not per-frame). This is the only JS involvement in icon sizing.

4. **Cluster icon vs. individual icon.** The plan notes clusters get a `divIcon` circle with count. Distinguish it visually from individual markers by using a **ring with a number** (hollow circle, 2 px stroke, fill semi-transparent, number centred) rather than a filled circle, so it reads as "multiple things here" rather than "one thing". The ring colour blends the two most common category colours in the cluster (mix via CSS `color-mix` or inline SVG gradients — pick `color-mix` as it needs no JS). Ring diameter: 40 px fixed (not zoom-tiered — clusters only appear at overview zooms where 40 px reads clearly).

5. **Found/marked state.** The plan calls for `opacity: 0.55` on found markers. That alone makes found markers harder to see without communicating "done". Replace with: retain full opacity, change the icon body to the `--g6-surface-2` background colour (desaturate), keep the glyph in the category colour at 50 % opacity, and add a small **green tick badge** (`⌐` SVG, 10 × 10 px, `position: absolute; bottom: 0; right: -2px`). This signals completion without making the marker visually disappear — the user still knows something is there.

---

### 11.4 Official vs. community/unverified: making the tiers read at a glance

The plan models three tiers (`official`, `community`, `estimate`) in data and shows a badge in the detail panel, but provides no visual differentiation on the map itself. At MapGenie, unverified locations are shown with a dashed or desaturated marker — a convention players expect. The plan needs an on-map treatment, not only an in-panel badge.

**Current plan gap:** §4.5 says markers get a "dashed ring + `?` badge" for the `estimate` tier. The `community` tier has no map-level treatment at all. The `official` tier is not distinguished from `community`. Because 100 % of the current 16 records are `community`, this means the entire initial map has homogeneous-tier markers — the distinction is invisible at launch.

**Required changes:**

1. **Add a rim/outline treatment per tier, applied via a CSS data-attribute on the icon element.** The shape and fill remain category-defined; the outline communicates tier:

   | Tier | Outline style | Additional indicator |
   |------|--------------|---------------------|
   | `official` | 2 px solid white (`rgba(255,255,255,0.9)`) inner border | Gold star badge `✦` (8 × 8 px, `--g6-accent` colour), top-left of icon |
   | `community` | 1.5 px solid `rgba(255,255,255,0.35)` | None |
   | `estimate` | 1.5 px dashed `rgba(255,255,255,0.45)`, dash `4 2` | `?` badge (8 × 8 px, `--g6-muted` colour), top-right of icon |

   Implement via `data-tier="official|community|estimate"` on the `.g6-pin` element and three CSS rules in `map.css`. No JS branching per marker; the data attribute is set once at marker creation.

2. **Verification legend always visible on the map.** Add a fixed 3-item legend strip in the **bottom-right of the map column**, above the credits strip, at all times (not just in the filter panel):
   ```
   ✦ Official   ○ Community   ◌ Unverified
   ```
   Three `<span>` elements with the same SVG ring shapes (12 × 12 px), one line, `font-size: 0.65rem`, `--g6-muted` text, `background: rgba(8,10,15,0.75)`, `padding: 4px 8px`, `border-radius: var(--r-sm)`. This is the most important on-map legend because it conveys data quality at a glance without the user needing to open a panel. Keep it at `z-index: var(--z-map-ui)`.

3. **Filter panel: group verification into a mini-legend control, not bare checkboxes.** The plan says "verification tiers as a legend-style multi-toggle" — good intent but needs to be explicit about the visual. Use a segmented toggle button group (three segments, each showing the tier icon + label + count):
   ```
   [✦ Official (0)]  [○ Community (16)]  [◌ Unverified (0)]
   ```
   Each segment is a `<button role="checkbox" aria-checked>` with `border-radius: 0` on interior segments and `var(--r-sm)` on the ends. Active segments get a `background: var(--g6-surface-2)` and the tier's outline style on the left border (a 3 px coloured vertical bar). Inactive segments are grey, but not hidden — the user needs to see that a tier exists even if it has zero entries today, to understand the trust model before entries get added.

4. **Detail panel: verification badge must be prominent and explain itself.** The plan places verification in the detail panel among other badges, but it is the highest-stakes information on the panel — it tells the player whether to trust the location. Place the tier badge as the **second element after the name** (before category), full width if necessary, using language not just iconography:
   - `official`: `✦ Officially documented` — gold background, dark text.
   - `community`: `○ Community-reported` — `--g6-surface-2` background, `--g6-text` text.
   - `estimate`: `◌ Unverified / estimated` — amber `#c97a2a` background, dark text. Include a one-line explanation tooltip (hover/focus): *"Position is approximate. Treat this as a rough guide, not a confirmed location."*

   This satisfies the SPEC requirement to "clearly distinguish" the three tiers and matches the standard that MapGenie sets for trust labelling.

5. **Search and list rows also need tier indicators.** Each row in the result list should show the tier icon (12 × 12 px, inline) between the category chip and the location name. This takes two CSS tokens and four characters of SVG per row — no layout changes needed.

---

### 11.5 Additional gaps not covered by the four criteria

These are smaller issues noticed during the review; each has a one-line fix.

**A. Toolbar search pill will be invisible on mobile if the sheet is at "full".**
The floating toolbar (`position: fixed` or `position: absolute` over the map) has `z-index: var(--z-toolbar): 900`. The sheet is `z-index: var(--z-sheet): 1150`. When the sheet is at `full` snap, the sheet covers the toolbar. The search field becomes unreachable.
*Fix:* When `data-sheet-snap="full"`, move the search input *into* the sheet header (a sticky row at the top of the sheet, above the chip row) and hide the floating toolbar pill with `visibility: hidden`. The switch should be CSS-only via the body data-attribute.

**B. Category chips row on mobile will overflow on narrow screens.**
The plan says chips are horizontally scrollable with `scroll-snap-type: x proximity`. With 8 categories the row is roughly 8 × 80 px = 640 px, which overflows 390 px. The scroll will work, but the first chip the user sees is "Stashes" and they may not know more exist.
*Fix:* Add a `::after` pseudo-element fade on the right edge of the chips container (`background: linear-gradient(to left, var(--g6-bg), transparent); width: 24px; pointer-events: none`) to visually hint that the row scrolls. This is a pure CSS addition to `components.css`.

**C. The loading shimmer must cover the rail, not just the map.**
The plan describes a `loading` state with "shimmer toolbar". On first load, before data.json resolves, the rail should show 8 category skeleton rows (same height as a real row, `background: var(--g6-line); animation: shimmer`) so the page doesn't flash an empty list. Add a `<div class="g6-skeleton-rail" aria-hidden="true">` to the HTML shell, shown during the loading state and replaced once data loads.

**D. The scale indicator is missing.**
MapGenie shows a scale bar on the map. The plan omits it. Leaflet has a built-in `L.control.scale()` that works with `CRS.Simple` if `metersPerUnit` is set correctly (`1.0` per §2.1). Add it at `bottomright`, styled to match the dark chrome (`css/map.css`: override `.leaflet-control-scale-line` with `background: rgba(8,10,15,0.75); border-color: var(--g6-line-strong); color: var(--g6-muted); font-size: 0.6rem`). This also makes the map's ±2 % distance caveat from §6.7 self-evident to users without any copy.

**E. No hover state defined for map markers.**
The plan specifies selected (halo) and found (desaturated) states, but no hover state. Without hover, mouse users get no affordance before committing a click.
*Fix:* In `map.css`, on `.g6-pin:hover`: `filter: brightness(1.2); transform: translateY(-2px); transition: transform 0.1s ease, filter 0.1s ease`. The `transform` is on the icon element, not the Leaflet container, so it does not affect the anchor point.

---

### 11.6 Revised token values (replace the corresponding entries in §4.1)

```css
/* Layout */
--rail-w: clamp(280px, 22vw, 360px);     /* was clamp(320px, 26vw, 400px) */
--rail-collapsed-w: 48px;               /* new */
--detail-panel-w: 320px;               /* new: right-side detail panel (desktop) */
--sheet-peek: 72px;                     /* was 96px */

/* Map chrome */
--map-ocean-bg: var(--g6-bg);          /* used by overview bleed layer */

/* Verification tier colours */
--tier-official: #d4af37;              /* gold for official badges */
--tier-community: rgba(255,255,255,0.35); /* used for ring stroke */
--tier-estimate: rgba(255,195,100,0.6); /* amber ring for unverified */
```

---

### 11.7 Summary of changes to §4 required before Cline builds

The table below maps each finding to the section of §4 that Cline must update before writing code. Sections not listed are approved as-is.

| Finding | Action required in §4 |
|---------|----------------------|
| Rail too wide; map area < 85 % with detail card open | §4.1 tokens, §4.2 desktop layout: use revised `--rail-w`, add `--rail-collapsed-w`, add `--detail-panel-w`, move detail card to right grid column |
| Detail card overlaps map | §4.2: replace floating `position:absolute` detail card with a `320px` right grid column; rail collapses to icon strip when detail opens |
| Rail has no collapse affordance | §4.2: add sticky collapse toggle `◀/▶` button at the bottom of the rail |
| Peek height blocks map on mobile | §4.1 tokens, §4.4: change `--sheet-peek` to `72px` |
| Sheet at half/full intercepts Leaflet | §4.4: add `pointer-events: none` on `#map` via body `data-sheet-snap` attribute |
| Sheet has no dismiss-to-hidden | §4.4: add `hidden` snap state; `×` button in handle bar |
| Search pill hidden when sheet is full | §4.4: move search into sheet header at `full` snap; hide floating pill |
| Category chips overflow without scroll hint | §4.4: add `::after` fade gradient on chips container |
| Icon shapes are under-specified | §4.5: add shape-family spec (diamond/shield/teardrop), glyph spec, zoom-tier class system |
| Cluster icon not distinct from individual | §4.5: ring + count cluster icon spec |
| Found state: 0.55 opacity loses the marker | §4.5: replace opacity fade with surface-colour body + green tick badge |
| No on-map tier treatment for `community` | §4.5: add rim/outline CSS treatment per tier via `data-tier` attribute |
| No on-map verification legend | §4.5: add fixed 3-item legend strip, bottom-right of map column |
| Verification toggle is under-specified | §6.5 filters: use segmented button group with tier icon + label + count |
| Verification badge in detail panel lacks prominence | §6.3 detail: move tier badge to second element after name; add amber background for estimate |
| List rows lack tier indicator | §6.3/§6.4: add tier icon (12 px) in list row between chip and name |
| Loading shimmer only covers toolbar | §4.6: add skeleton rail during loading state |
| Scale bar missing | §4.5: add `L.control.scale()` with custom CSS |
| Hover state undefined | §4.5 / `map.css`: add `brightness(1.2) + translateY(-2px)` hover on `.g6-pin` |
