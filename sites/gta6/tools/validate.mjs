#!/usr/bin/env node
// One-command check of everything in sites/gta6/data/.
//
//   node sites/gta6/tools/validate.mjs
//
// Errors (exit 1) are things that would break the app or make a pin lie:
// malformed records, unknown categories/regions/counties, ids that collide,
// coordinates outside the map, missing sources, a marker link on a record that
// is not `reported`, or the same marker claimed by two records.
//
// Warnings (exit 0) are things a human should look at: pins sitting on top of
// each other, a `reported` pin with a very wide accuracy, duplicate names.

import { readFile } from 'node:fs/promises';

const DATA = new URL('../data/', import.meta.url);
const read = async (file) => JSON.parse(await readFile(new URL(file, DATA), 'utf8'));

const CROP = { xMin: -11000, yMin: -9000, xMax: 4000, yMax: 11000 };
const METHODS = new Set(['estimated', 'reported']);
const TIERS = new Set(['official', 'community', 'estimate']);

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function checkRecord(rec, where, { collection = false } = {}) {
  if (!isStr(rec.id)) err(where, 'missing id');
  if (!isStr(rec.name)) err(where, 'missing name');
  if (!isStr(rec.category)) err(where, 'missing category');
  if (!isStr(rec.region)) err(where, 'missing region');
  if (!isStr(rec.county)) err(where, 'missing county');
  if (!isStr(rec.verification)) err(where, 'missing verification');
  if (!isStr(rec.hint)) err(where, 'missing hint');
  if (typeof rec.summary !== 'string') err(where, 'summary must be a string (may be empty)');

  // `tips` and `rewards` may be absent on a record that has neither.
  if (rec.tips !== undefined) {
    if (!Array.isArray(rec.tips)) err(where, 'tips must be an array when present');
    else rec.tips.forEach((t, i) => { if (!isStr(t)) err(where, `tips[${i}] is empty`); });
  }

  if (rec.rewards !== undefined) {
    if (!Array.isArray(rec.rewards)) err(where, 'rewards must be an array when present');
    else rec.rewards.forEach((t, i) => { if (!isStr(t)) err(where, `rewards[${i}] is empty`); });
  }

  if (!Array.isArray(rec.sources) || rec.sources.length === 0) {
    err(where, 'no sources');
  } else {
    rec.sources.forEach((s, i) => {
      if (!s || !isStr(s.label)) err(where, `sources[${i}] has no label`);
      if (!s || !isStr(s.url) || !/^https:\/\//.test(s.url)) err(where, `sources[${i}] is not an https URL`);
    });
  }

  const p = rec.position;
  if (!p || typeof p !== 'object') { err(where, 'missing position'); return; }
  if (!isNum(p.x) || !isNum(p.y)) err(where, 'position x/y must be numbers');
  else if (p.x < CROP.xMin || p.x > CROP.xMax || p.y < CROP.yMin || p.y > CROP.yMax) {
    err(where, `position ${p.x}, ${p.y} is outside the map crop`);
  }
  if (!METHODS.has(p.method)) err(where, `position.method "${p.method}" is not one of ${[...METHODS].join('/')}`);
  if (!isNum(p.accuracy) || p.accuracy <= 0 || p.accuracy > 5000) {
    err(where, 'position.accuracy must be 1–5000 metres');
  }
  if (p.method === 'reported' && p.accuracy > 250) {
    warn(where, `reported pin with accuracy ${p.accuracy} m — reported pins are marker positions, not estimates`);
  }
  if (TIERS.has(rec.verification) === false) err(where, `verification "${rec.verification}" is unknown`);

  if (rec.marker !== undefined && rec.marker !== null) {
    const m = rec.marker;
    if (!m || m.source !== 'gtabase' || !isStr(m.id)) err(where, 'marker must be { source: "gtabase", id: "…" }');
    if (p.method !== 'reported') err(where, 'has a marker link but position.method is not "reported"');
    if (m && m.name !== undefined && !isStr(m.name)) err(where, 'marker.name must be a non-empty string when present');
  }

  if (collection) {
    if (!rec._gb || !isStr(rec._gb.id)) err(where, 'collection record has no _gb.id');
  }

  if (rec.code !== undefined && rec.code !== null && !isStr(rec.code)) {
    err(where, 'code must be a non-empty string or null');
  }
}

const [locationsFile, collectionsFile, categoriesFile, regionsFile, creditsFile] = await Promise.all([
  read('locations.json'),
  read('collections.json'),
  read('categories.json'),
  read('regions.json'),
  read('credits.json').catch(() => null)
]);

const credits = creditsFile ? (creditsFile.entries || creditsFile.credits || []) : [];

const curated = locationsFile.locations || [];
const collections = collectionsFile.collections || [];
const categories = new Set((categoriesFile.categories || []).map((c) => c.id));
const regions = new Map((regionsFile.regions || []).map((r) => [r.id, r]));
const counties = new Set((regionsFile.counties || []).map((c) => (typeof c === 'string' ? c : c.id)));

if (!Array.isArray(curated) || curated.length === 0) err('locations.json', 'no records');
if (!Array.isArray(collections) || collections.length === 0) err('collections.json', 'no records');
if (counties.size === 0) err('regions.json', 'no counties');
if (!Array.isArray(credits) || credits.length === 0) {
  err('credits.json', 'no credit entries');
} else {
  credits.forEach((c, i) => {
    if (!isStr(c.asset) || !isStr(c.work)) err('credits.json', `entries[${i}] needs asset and work`);
  });
}

const ids = new Map();
function registerId(id, where) {
  if (!isStr(id)) return;
  if (ids.has(id)) err(where, `duplicate id "${id}" (also in ${ids.get(id)})`);
  else ids.set(id, where);
}

const markersUsed = new Map();

for (const rec of curated) {
  const where = `locations.json ${rec.id || '(no id)'}`;
  registerId(rec.id, 'locations.json');
  checkRecord(rec, where);

  if (isStr(rec.category) && !categories.has(rec.category)) err(where, `unknown category "${rec.category}"`);
  if (isStr(rec.region) && !regions.has(rec.region)) err(where, `unknown region "${rec.region}"`);
  if (isStr(rec.county) && counties.size && !counties.has(rec.county)) err(where, `unknown county "${rec.county}"`);

  if (rec.marker && isStr(rec.marker.id)) {
    if (markersUsed.has(rec.marker.id)) {
      err(where, `marker "${rec.marker.id}" is already linked by ${markersUsed.get(rec.marker.id)}`);
    } else {
      markersUsed.set(rec.marker.id, where);
    }
  }
}

for (const rec of collections) {
  const where = `collections.json ${rec.id || '(no id)'}`;
  registerId(rec.id, 'collections.json');
  checkRecord(rec, where, { collection: true });
  if (isStr(rec.category) && !categories.has(rec.category)) err(where, `unknown category "${rec.category}"`);
  if (isStr(rec.region) && !regions.has(rec.region)) err(where, `unknown region "${rec.region}"`);
  if (isStr(rec.county) && counties.size && !counties.has(rec.county)) err(where, `unknown county "${rec.county}"`);
}

// Pins on top of each other: legal, but almost always a sign two records are
// the same find under two names. The crab outpost/lab pair is deliberate.
// Bulk imports sit in clusters by nature (a bar and its ATM, two street-food
// carts on one corner), so pairs between two bulk pins are counted, not listed;
// every pair involving a hand-written record is still printed in full.
const CURATED_IDS = new Set(curated.map((r) => r.id));
const PROXIMITY_ALL = process.argv.includes('--proximity-all');
const all = [...curated, ...collections];
let bulkPairs = 0;
for (let i = 0; i < all.length; i++) {
  for (let j = i + 1; j < all.length; j++) {
    const a = all[i].position, b = all[j].position;
    if (!a || !b) continue;
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d > 20) continue;
    if (!PROXIMITY_ALL && !CURATED_IDS.has(all[i].id) && !CURATED_IDS.has(all[j].id)) { bulkPairs++; continue; }
    warn(`${all[i].id} / ${all[j].id}`, `${Math.round(d)} m apart`);
  }
}
if (bulkPairs > 0) {
  warn('collections.json', `${bulkPairs} pairs of bulk pins within 20 m (normal in dense areas; run --proximity-all to list them)`);
}

// Bulk collection pins deliberately reuse names ("Meteorite, no directions
// given"), so the duplicate-name check only looks at curated records.
const names = new Map();
for (const rec of curated) {
  const key = `${(rec.name || '').toLowerCase().trim()}|${rec.category}`;
  if (names.has(key)) warn(`${rec.id} / ${names.get(key)}`, `same name and category: "${rec.name}"`);
  else names.set(key, rec.id);
}

const today = new Date().toISOString().slice(0, 10);
if (locationsFile.updated !== today) {
  warn('locations.json', `"updated" says ${locationsFile.updated}, today is ${today} — bump it when the data changes`);
}

console.log(`records: ${curated.length} curated + ${collections.length} collection = ${all.length}`);
console.log(`markers linked: ${markersUsed.size}`);

if (warnings.length) {
  console.log(`\nwarnings (${warnings.length}):`);
  warnings.forEach((w) => console.log('  ! ' + w));
}

if (errors.length) {
  console.log(`\nerrors (${errors.length}):`);
  errors.forEach((e) => console.log('  ✗ ' + e));
  process.exit(1);
}

console.log('\nOK — schema, ids, categories, regions, counties, sources and marker links all valid.');
