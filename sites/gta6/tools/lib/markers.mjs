// Shared helpers for the GTABase marker audits.
//
// The snapshot in ../data/gtabase-markers.json is the community map's marker
// list (6,510 markers) trimmed to the fields an audit needs: id, name,
// category, x, y, description. Provenance is in ../data/gtabase-markers.meta.json.
//
// Coordinates are in the same metre frame as data/locations.json, so a marker
// and a pin can be compared with plain Pythagoras.

import { readFile } from 'node:fs/promises';

export const SNAPSHOT = new URL('../data/gtabase-markers.json', import.meta.url);

export async function loadMarkers(file = SNAPSHOT) {
  const raw = JSON.parse(await readFile(file, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.markers;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`no markers found in ${file.toString()}`);
  }
  return list.map((m) => {
    if (typeof m.id !== 'string' || typeof m.name !== 'string' ||
        typeof m.x !== 'number' || typeof m.y !== 'number') {
      throw new Error(`malformed marker in ${file.toString()}: ${JSON.stringify(m).slice(0, 120)}`);
    }
    return {
      id: m.id,
      name: m.name,
      category: m.category || '',
      x: m.x,
      y: m.y,
      description: m.description || ''
    };
  });
}

// Words that appear in dozens of marker names and say nothing about which
// place is meant. They stay searchable in the app; they are just not evidence.
const STOP = new Set([
  'the', 'of', 'and', 'a', 'an', 'in', 'on', 'at', 'by', 'to', 'for', 'near',
  'north', 'south', 'east', 'west', 'upper', 'lower', 'northwest', 'northeast',
  'southwest', 'southeast', 'old', 'new', 'big', 'little', 'small', 'main',
  'garage', 'warehouse', 'motel', 'hotel', 'shop', 'store', 'station', 'house',
  'home', 'safe', 'safes', 'keypad', 'door', 'code', 'codes', 'lab', 'labs',
  'facility', 'facilities', 'site', 'area', 'building', 'building', 'block',
  'street', 'road', 'avenue', 'drive', 'boulevard', 'highway', 'route', 'county',
  'city', 'town', 'village', 'beach', 'island', 'islands', 'key', 'keys', 'park',
  'lake', 'river', 'bay', 'creek', 'point', 'port', 'harbor', 'harbour', 'marina',
  'yard', 'field', 'lot', 'farm', 'plant', 'depot', 'works', 'club', 'bar',
  'cafe', 'restaurant', 'diner', 'market', 'mall', 'plaza', 'center', 'centre',
  'office', 'apartment', 'apartments', 'residence', 'residences', 'tower',
  'casino', 'resort', 'arena', 'stadium', 'airport', 'airfield', 'strip',
  'museum', 'church', 'school', 'hospital', 'police', 'fire', 'gas', 'fuel',
  'parking', 'lot', 'gate', 'entrance', 'exit', 'eastside', 'westside',
  'northside', 'southside', 'downtown', 'uptown', 'beach', 'shore', 'shores'
]);

export function tokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t));
}

// Inverse document frequency over marker names: a word only a few markers use
// is evidence, a word hundreds use is not.
export function buildWeights(markers) {
  const df = new Map();
  for (const m of markers) {
    for (const t of new Set(tokens(m.name))) df.set(t, (df.get(t) || 0) + 1);
  }
  const n = markers.length;
  const weights = new Map();
  for (const [t, count] of df) weights.set(t, Math.log(n / count));
  return weights;
}

export function scoreMatch(recordTokens, markerTokens, weights) {
  let score = 0;
  const shared = [];
  for (const t of recordTokens) {
    if (markerTokens.has(t)) {
      score += weights.get(t) || 0;
      shared.push(t);
    }
  }
  return { score, shared };
}

// Rank markers for one record by name overlap, and among equals prefer the
// closer one, because a marker 20 km away that shares a word is not the same
// place. Hints are deliberately not used: a hint mentions the town, the road
// and half the map, and once it is allowed to score, every record "matches"
// something far away. A name match is the only claim this audit makes.
export function rankMatches(record, markers, weights) {
  const rt = tokens(record.name);
  const out = [];

  for (const m of markers) {
    const mt = new Set(tokens(m.name));
    const { score, shared } = scoreMatch(rt, mt, weights);
    if (score <= 0) continue;
    out.push({
      marker: m,
      score: Number(score.toFixed(3)),
      shared,
      distance: Math.round(Math.hypot(m.x - record.position.x, m.y - record.position.y))
    });
  }

  out.sort((a, b) => (b.score - a.score) || (a.distance - b.distance));
  return out;
}

export function distanceToMarker(record, marker) {
  return Math.round(Math.hypot(marker.x - record.position.x, marker.y - record.position.y));
}
