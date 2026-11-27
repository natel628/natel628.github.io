#!/usr/bin/env node
// Import the GTABase marker kinds this map wants as bulk pins.
//
//   node sites/gta6/tools/import-gtabase.mjs [--dry-run]
//
// Source: data/gtabase-markers.json (the snapshot described in
// ../data/gtabase-markers.meta.json). Positions are copied unmodified — they
// are the published marker coordinates, `method: "reported"`, 40 m.
//
// Two things are ours, not theirs:
//   • the category: GTABase has ~70 kinds, this map has 14 legends, so each
//     imported kind is folded into the category it belongs to (table below);
//   • region and county: the snapshot dropped GTABase's `town` field, so each
//     pin inherits the region/county of the nearest already-labelled record.
//     That is a classification, not a reading, and REPORT §23 says so.
//
// Wording is GTABase's own marker name and description, credited to them; it is
// never rewritten here, because rewriting 2,600 names by hand is how errors get
// in. Records already in collections.json are left alone.

import { readFile, writeFile } from 'node:fs/promises';

const DATA = new URL('../data/', import.meta.url);
const SNAPSHOT = new URL('./data/gtabase-markers.json', import.meta.url);
const read = async (url) => JSON.parse(await readFile(url, 'utf8'));

const DRY = process.argv.includes('--dry-run');

// GTABase kind → this map's category. Only the kinds named in the request:
// loot boxes, safes, businesses/services and vehicle spawns.
const KIND = {
  // loot, stashes and safes
  'yellow-loot-box': 'collectible',
  'safe':            'stash',
  'treasure':        'stash',
  // vehicles
  'standout-vehicle': 'vehicle',
  'vehicle-spawn':   'vehicle',
  // businesses and services
  'street-food':     'shop',
  'cafe-takeout':    'shop',
  'convenience-store': 'shop',
  'gas-station':     'shop',
  'bar':             'shop',
  'atm':             'shop',
  'towable-atm':     'shop',
  'ev-charger':      'shop',
  'bus-stop':        'shop',
  // weapons
  'weapon-spawn':    'weapon',
  'unique-weapon':   'weapon',
  // secrets and landmarks
  'easter-egg':      'easter-egg',
  'landmark':        'landmark',
  'helipad':         'landmark',
  'under-the-bridge': 'landmark',
  // collectible sets
  'scoop-container': 'collectible',
  'magazine':        'collectible',
  'style-magazine':  'collectible',
  'cocaine-flamingo': 'collectible',
  'ahol-street-art': 'collectible',
  // things to do
  'random-event':    'activity',
  'basketball':      'activity',
  'race':            'activity',
  'drone-race':      'activity',
  'fishing':         'activity'
};

const CROP = { xMin: -11000, yMin: -9000, xMax: 4000, yMax: 11000 };
const TAGS = /<[^>]*>/g;
const clean = (s, max) => String(s || '')
  .replace(TAGS, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
  .replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

const markers = await (async () => {
  const raw = await read(SNAPSHOT);
  return Array.isArray(raw) ? raw : raw.markers;
})();

const collectionsFile = await read(new URL('collections.json', DATA));
const curatedFile = await read(new URL('locations.json', DATA));
const curated = curatedFile.locations || [];

// The importer owns everything it wrote: a re-run drops its own records and
// rebuilds them from the snapshot, so the result is idempotent and changing the
// table above cannot leave a stale pin behind.
const TAG = 'gtabase-markers.json';
const existing = (collectionsFile.collections || [])
  .filter((r) => !(r._gb && r._gb.source === TAG));

// Already-labelled pins, used both for the region lookup and for dedupe.
const labelled = [...curated, ...existing].filter((r) => r.region && r.county && r.position);

function nearestLabel(x, y) {
  let best = null, bestD = Infinity;
  for (const r of labelled) {
    const d = (r.position.x - x) ** 2 + (r.position.y - y) ** 2;
    if (d < bestD) { bestD = d; best = r; }
  }
  return { region: best.region, county: best.county, distance: Math.round(Math.sqrt(bestD)) };
}

const takenMarkerIds = new Set();
for (const r of curated) if (r.marker && r.marker.id) takenMarkerIds.add(r.marker.id);
for (const r of existing) if (r._gb && r._gb.id) takenMarkerIds.add(r._gb.id);

// A curated record without a marker link can still be the same find as a bulk
// marker (the hand-written pin came from a guide, the bulk one from GTABase).
// Two pins on one spot read as two things to collect, so anything within 6 m of
// a curated record is left to the curated record.
const NEAR_CURATED = 6;
function nearCurated(x, y) {
  for (const r of curated) {
    if (!r.position) continue;
    if (Math.hypot(r.position.x - x, r.position.y - y) <= NEAR_CURATED) return r.id;
  }
  return null;
}

const seen = new Set();
const added = [];
let skippedTaken = 0, skippedCrop = 0, skippedNoName = 0, skippedTwin = 0;

for (const m of markers) {
  const category = KIND[m.category];
  if (!category) continue;
  if (takenMarkerIds.has(m.id) || seen.has(m.id)) { skippedTaken++; continue; }
  seen.add(m.id);

  if (m.x < CROP.xMin || m.x > CROP.xMax || m.y < CROP.yMin || m.y > CROP.yMax) {
    skippedCrop++;
    continue;
  }

  const name = clean(m.name, 90);
  if (!name) { skippedNoName++; continue; }

  const twin = nearCurated(m.x, m.y);
  if (twin) { skippedTwin++; continue; }

  const description = clean(m.description, 240);
  const where = nearestLabel(m.x, m.y);

  added.push({
    id: 'gb-' + m.id,
    name,
    category,
    region: where.region,
    county: where.county,
    position: { x: m.x, y: m.y, method: 'reported', accuracy: 40 },
    verification: 'community',
    summary: '',
    hint: description || 'Community marker on the GTABase map; no description was published with it.',
    code: null,
    risk: null,
    sources: [{
      label: `GTABase map — ${name}`.slice(0, 80),
      url: `https://www.gtabase.com/gta-6/map/?feature=${m.category}#${m.id}`
    }],
    _gb: { id: m.id, category: m.category, source: 'gtabase-markers.json' }
  });
}

const order = new Map([...new Set(Object.values(KIND))].map((c, i) => [c, i]));
added.sort((a, b) =>
  (order.get(a.category) - order.get(b.category)) ||
  a.id.localeCompare(b.id, 'en', { numeric: true }));

const merged = [...existing, ...added];
const out = {
  schema: collectionsFile.schema,
  updated: new Date().toISOString().slice(0, 10),
  coordinateSpace: collectionsFile.coordinateSpace,
  note: collectionsFile.note,
  collections: merged
};

const byCat = {};
for (const r of added) byCat[r.category] = (byCat[r.category] || 0) + 1;

console.log(`snapshot markers        ${markers.length}`);
console.log(`imported                ${added.length}`);
Object.entries(byCat).forEach(([c, n]) => console.log(`  ${c.padEnd(18)}${n}`));
console.log(`already a record        ${skippedTaken}`);
console.log(`same spot as curated    ${skippedTwin}`);
console.log(`outside the map crop    ${skippedCrop}`);
console.log(`no usable name          ${skippedNoName}`);
console.log(`collections.json        ${existing.length} → ${merged.length}`);

if (DRY) {
  console.log('\n--dry-run: nothing written');
} else {
  // Compact: this file is generated, 4,000+ records, and fetched by every visitor.
  // Pretty-printing it would add about a megabyte for nobody's benefit.
  await writeFile(new URL('collections.json', DATA), JSON.stringify(out) + '\n');
  console.log('\nwrote data/collections.json');
}
