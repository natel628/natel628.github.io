#!/usr/bin/env node
// Put the marker id on the record, so later audits do not have to re-guess.
//
//   node sites/gta6/tools/link-markers.mjs                 # dry run: proposals
//   node sites/gta6/tools/link-markers.mjs --write         # apply proposals
//   node sites/gta6/tools/link-markers.mjs --set id=marker-id --write
//
// A proposal needs a shared name word (score ≥ --min-score) and a pin within
// --max-distance of the marker. Both are printed, so a bad proposal is visible
// before it is written. `--set` is for the cases where the names differ but the
// link is already established by hand (the §16 moves, for example).
//
// Records keep the marker's name in the link: if GTABase renames a marker, the
// audit can still say which one was meant.

import { readFile, writeFile } from 'node:fs/promises';
import { loadMarkers, buildWeights, rankMatches, distanceToMarker } from './lib/markers.mjs';

const DATA = new URL('../data/', import.meta.url);
const FILE = new URL('locations.json', DATA);
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const maxDistance = Number(arg('--max-distance', 120));
const minScore = Number(arg('--min-score', 1));
const write = has('--write');
const relink = has('--relink');
const includeEstimated = has('--include-estimated');
const sets = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set') sets.push(argv[++i]);
}

const [locations, markers] = await Promise.all([readJson(FILE), loadMarkers()]);
const byId = new Map(markers.map((m) => [m.id, m]));
const weights = buildWeights(markers);

const plans = [];
const problems = [];

for (const spec of sets) {
  const [recId, markerId] = String(spec || '').split('=');
  const rec = locations.locations.find((r) => r.id === recId);
  const marker = byId.get(markerId);
  if (!rec) { problems.push(`--set ${spec}: no record "${recId}"`); continue; }
  if (!marker) { problems.push(`--set ${spec}: no marker "${markerId}"`); continue; }
  plans.push({ rec, marker, distance: distanceToMarker(rec, marker), score: null, shared: [], source: 'set' });
}

for (const rec of locations.locations) {
  if (rec.marker && !relink) continue;
  // Only pins whose position came from a marker can honestly claim one. An
  // estimate that happens to sit near a marker keeps its estimate and is
  // covered by the audit's candidate list instead.
  if (rec.position.method !== 'reported' && !includeEstimated) continue;
  if (plans.some((p) => p.rec.id === rec.id)) continue;

  const best = rankMatches(rec, markers, weights, { useHint: false })[0];
  if (!best) continue;
  if (best.score < minScore) continue;
  if (best.distance > maxDistance) continue;
  plans.push({ rec, marker: best.marker, distance: best.distance, score: best.score,
               shared: best.shared, source: 'match' });
}

for (const p of plans) {
  const tag = p.source === 'set' ? 'set  ' : 'match';
  console.log(`${tag} ${p.rec.id}`);
  console.log(`        → ${p.marker.id}  "${p.marker.name}"  ${p.distance} m` +
              (p.score !== null ? `  score ${p.score} (${p.shared.join(', ')})` : ''));
}

if (problems.length) {
  console.log('\nproblems:');
  problems.forEach((p) => console.log('  ✗ ' + p));
}

if (!plans.length) {
  console.log('nothing to link');
  process.exit(problems.length ? 1 : 0);
}

if (!write) {
  console.log(`\n${plans.length} proposal(s). Re-run with --write to put them in data/locations.json.`);
  process.exit(problems.length ? 1 : 0);
}

let text = await readFile(FILE, 'utf8');

for (const { rec, marker, distance } of plans) {
  if (rec.marker) {
    // Replace the existing link line in place.
    const re = new RegExp(`(\\n      "id": "${rec.id}",[\\s\\S]*?)"marker": \\{[^}]*\\},`);
    const next = text.replace(re, `$1"marker": { "source": "gtabase", "id": ${JSON.stringify(marker.id)}, "name": ${JSON.stringify(marker.name)} },`);
    if (next === text) {
      console.log(`  ! ${rec.id}: could not rewrite its existing marker line`);
      continue;
    }
    text = next;
    continue;
  }

  const start = text.indexOf(`\n    {\n      "id": "${rec.id}",`);
  if (start === -1) { console.log(`  ! ${rec.id}: record block not found`); continue; }
  const end = text.indexOf('\n    },', start);
  const block = text.slice(start, end);
  const verLine = block.match(/\n      "verification": "[^"]*",/);
  if (!verLine) { console.log(`  ! ${rec.id}: no verification line to insert after`); continue; }
  const at = start + verLine.index + verLine[0].length;
  const line = `\n      "marker": { "source": "gtabase", "id": ${JSON.stringify(marker.id)}, "name": ${JSON.stringify(marker.name)} },`;
  text = text.slice(0, at) + line + text.slice(at);
  console.log(`  + ${rec.id} → ${marker.id} (${distance} m)`);
}

JSON.parse(text); // must still parse before anything is written
await writeFile(FILE, text);
console.log(`\nwrote ${plans.length} link(s) to data/locations.json`);
process.exit(problems.length ? 1 : 0);
