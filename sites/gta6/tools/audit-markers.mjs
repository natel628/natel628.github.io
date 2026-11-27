#!/usr/bin/env node
// Re-run the §16/§17 cross-check: does every curated pin sit where GTABase's
// markers say the same thing is?
//
//   node sites/gta6/tools/audit-markers.mjs
//   node sites/gta6/tools/audit-markers.mjs --threshold 500 --strict
//   node sites/gta6/tools/audit-markers.mjs --json > audit.json
//
// Two kinds of finding:
//
//   errors      a record claims a marker that does not exist, or sits further
//               from its recorded marker than --marker-tolerance (default 60 m).
//               These fail the run.
//   candidates  a record with no marker link whose best name match is more than
//               --threshold (default 500 m) away. This is exactly how the crab
//               lab, the Dino Golf bat and eleven others were found. Candidates
//               do not fail the run unless --strict, because some of them are
//               legitimately different places with a word in common.
//
// The artwork still decides. A candidate is a question, not a verdict: crop the
// tiles at both coordinates before moving anything (see REPORT §16).

import { readFile } from 'node:fs/promises';
import { loadMarkers, buildWeights, rankMatches, distanceToMarker } from './lib/markers.mjs';

const DATA = new URL('../data/', import.meta.url);
const read = async (file) => JSON.parse(await readFile(new URL(file, DATA), 'utf8'));

const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};
const threshold = Number(arg('--threshold', 500));
const tolerance = Number(arg('--marker-tolerance', 60));
const strict = argv.includes('--strict');
const minScore = Number(arg('--min-score', 5));
const asJson = argv.includes('--json');

const [locations, collections, markers] = await Promise.all([
  read('locations.json'),
  read('collections.json'),
  loadMarkers()
]);

const weights = buildWeights(markers);
const byId = new Map(markers.map((m) => [m.id, m]));

const errors = [];
const candidates = [];
const linked = [];

for (const rec of locations.locations) {
  if (rec.marker && rec.marker.id) {
    const m = byId.get(rec.marker.id);
    if (!m) {
      errors.push({ id: rec.id, problem: `marker "${rec.marker.id}" is not in the snapshot` });
      continue;
    }
    const d = distanceToMarker(rec, m);
    linked.push({ id: rec.id, marker: m.id, name: m.name, distance: d });
    if (d > tolerance) {
      errors.push({ id: rec.id, problem: `pin is ${d} m from its marker "${m.name}" (${m.id}) — tolerance ${tolerance} m` });
    }
    continue;
  }

  const ranked = rankMatches(rec, markers, weights);
  const best = ranked[0];
  if (!best) continue;
  // Two guard rails against "shares a word" noise: at least two shared name
  // words, and at least one of them distinctive (a word only a few dozen
  // markers use). "Yellow Loot Box (beside the boat)" shares 'beside'; that is
  // not a match, it is a preposition.
  const maxIdf = Math.max(0, ...best.shared.map((t) => weights.get(t) || 0));
  if (best.distance > threshold && best.score >= minScore && best.shared.length >= 2 && maxIdf >= 5) {
    candidates.push({
      id: rec.id,
      name: rec.name,
      pin: `${rec.position.x}, ${rec.position.y}`,
      marker: best.marker.id,
      markerName: best.marker.name,
      markerAt: `${best.marker.x}, ${best.marker.y}`,
      distance: best.distance,
      score: best.score,
      shared: best.shared
    });
  }
}

// Collection pins are copied from markers, so they should be exact. A drift
// here means the import or a later edit moved a pin off its own coordinate.
const collectionErrors = [];
for (const rec of collections.collections) {
  const gb = rec._gb && rec._gb.id;
  if (!gb) { collectionErrors.push({ id: rec.id, problem: 'no _gb.id' }); continue; }
  const m = byId.get(gb);
  if (!m) { collectionErrors.push({ id: rec.id, problem: `marker "${gb}" is not in the snapshot` }); continue; }
  const d = Math.abs(m.x - rec.position.x) + Math.abs(m.y - rec.position.y);
  if (d > 2) collectionErrors.push({ id: rec.id, problem: `pin is ${Math.round(d)} m off marker "${gb}"` });
}

candidates.sort((a, b) => b.distance - a.distance);

if (asJson) {
  console.log(JSON.stringify({ scanned: locations.locations.length, markers: markers.length,
                               linked, errors, collectionErrors, candidates }, null, 2));
} else {
  console.log(`markers: ${markers.length} in the snapshot`);
  console.log(`curated: ${locations.locations.length} records, ${linked.length} linked to a marker, ` +
              `${locations.locations.length - linked.length} unlinked`);
  console.log(`collections: ${collections.collections.length} pins checked against their own marker id`);

  if (linked.length) {
    const worst = [...linked].sort((a, b) => b.distance - a.distance).slice(0, 5);
    console.log('\nclosest/furthest linked pins:');
    linked.slice(0, 0);
    worst.forEach((l) => console.log(`  ${String(l.distance).padStart(4)} m  ${l.id} → ${l.marker} (${l.name})`));
  }

  if (candidates.length) {
    console.log(`\ncandidates — best same-name marker more than ${threshold} m away (${candidates.length}):`);
    for (const c of candidates) {
      console.log(`  ${String(c.distance).padStart(6)} m  ${c.id}`);
      console.log(`            pin ${c.pin}  vs  ${c.markerName} (${c.marker}) at ${c.markerAt}`);
      console.log(`            shared: ${c.shared.join(', ')}  score ${c.score}`);
    }
  }

  if (collectionErrors.length) {
    console.log(`\ncollection errors (${collectionErrors.length}):`);
    collectionErrors.forEach((e) => console.log(`  ✗ ${e.id}: ${e.problem}`));
  }

  if (errors.length) {
    console.log(`\nlinked-marker errors (${errors.length}):`);
    errors.forEach((e) => console.log(`  ✗ ${e.id}: ${e.problem}`));
  }
}

const failed = errors.length > 0 || collectionErrors.length > 0 || (strict && candidates.length > 0);
if (!asJson) {
  console.log(failed ? '\nFAILED' : (candidates.length ? '\nOK (candidates are questions, not failures)' : '\nOK — every pin agrees with its marker'));
}
process.exit(failed ? 1 : 0);
