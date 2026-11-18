#!/usr/bin/env node
/* Podcast chart refresh for showsnew.html.

   The Podcasts → Browse view draws its "Apple Podcasts chart" from a single
   line of baked JSON: window.PODCAST_CATALOG = {...};  Apple's charts move
   every week, so this script regenerates that line from the keyless iTunes
   chart feeds and rewrites it in place. It runs on a schedule in GitHub
   Actions (see .github/workflows/sync-podcasts.yml), or by hand:

       node scripts/sync-podcasts.mjs

   Design rules, the same ones scripts/sync-live.mjs follows:
   - No dependencies: Node 20 built-ins only (fetch, fs, path, url).
   - An API hiccup never fails the job: no chart, or a chart too small to be a
     chart, leaves the snapshot already in the page alone and exits 0.
   - It touches nothing but that one line. The page is deployed through
     pagecrypt, which encrypts the whole file at build time, so the catalog
     stays plain JSON in the same place and the deploy is unaffected.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(ROOT, 'showsnew.html');

const MARK = 'window.PODCAST_CATALOG = ';
const COUNTRY = 'us';
const TOP_N = 40;       // shows on the page's chart
const PER_GENRE = 8;
const MIN_TOP = 10;     // below this, the answer is not a chart: keep the old one

/* Apple's top-level podcast genres. The marketing feed has no genre filter,
   but the iTunes chart feed does, so the ids live here. */
const GENRES = [
  ['1301', 'Arts'],
  ['1303', 'Comedy'],
  ['1304', 'Education'],
  ['1305', 'Kids & Family'],
  ['1309', 'TV & Film'],
  ['1310', 'Music'],
  ['1314', 'Religion & Spirituality'],
  ['1318', 'Technology'],
  ['1321', 'Business'],
  ['1324', 'Society & Culture'],
  ['1483', 'Fiction'],
  ['1487', 'History'],
  ['1488', 'True Crime'],
  ['1489', 'News'],
  ['1502', 'Leisure'],
  ['1511', 'Government'],
  ['1512', 'Health & Fitness'],
  ['1533', 'Science'],
  ['1545', 'Sports'],
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* One chart, normalised to the compact shape the page's cards draw. */
async function chart(limit, genreId) {
  const url = 'https://itunes.apple.com/' + COUNTRY + '/rss/toppodcasts/limit=' + limit +
    (genreId ? '/genre=' + genreId : '') + '/json';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    const entries = (json.feed && json.feed.entry) || [];
    const seen = new Set();
    const shows = [];
    for (const entry of entries) {
      const show = normalise(entry);
      if (!show || seen.has(show.id)) continue;
      seen.add(show.id);
      shows.push(show);
    }
    return shows;
  } finally {
    clearTimeout(timer);
  }
}

function normalise(entry) {
  const id = entry.id && entry.id.attributes && entry.id.attributes['im:id'];
  const name = entry['im:name'] && entry['im:name'].label;
  if (!id || !name) return null;
  const images = Array.isArray(entry['im:image']) ? entry['im:image'] : [];
  const artwork = images.length ? String(images[images.length - 1].label || '') : '';
  return {
    id: String(id),
    n: String(name),
    a: (entry['im:artist'] && entry['im:artist'].label) || '',
    g: (entry.category && entry.category.attributes && entry.category.attributes.label) || '',
    /* The feed's largest image is 170px; the cards are wider than that, and
       mzstatic serves the same artwork at any size from the same path. */
    art: artwork.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/i, '/300x300bb.$1'),
  };
}

async function buildCatalog() {
  const top = await chart(TOP_N, null);
  if (top.length < MIN_TOP) throw new Error('the overall chart returned ' + top.length + ' shows');

  const genres = [];
  for (const [id, name] of GENRES) {
    await sleep(200); // stay polite; 19 small requests in a row
    try {
      const shows = await chart(PER_GENRE, id);
      if (shows.length) genres.push({ id, name, shows });
      else console.log('  ' + name + ': empty, skipped');
    } catch (e) {
      console.log('  ' + name + ': ' + String((e && e.message) || e));
    }
  }

  return { at: new Date().toISOString(), top, genres };
}

/* The one line this script is allowed to touch. Anything unexpected here is a
   structural error worth failing on, unlike a network problem. */
function catalogBounds(html) {
  const start = html.indexOf(MARK);
  if (start < 0) throw new Error('could not find "' + MARK.trim() + '" in showsnew.html');
  if (html.indexOf(MARK, start + MARK.length) >= 0) throw new Error('"' + MARK.trim() + '" appears more than once');
  const end = html.indexOf(';\n', start);
  if (end < 0) throw new Error('could not find the end of the catalog line');
  return { start, end };
}

async function main() {
  const html = readFileSync(PAGE, 'utf8');
  const { start, end } = catalogBounds(html);

  let catalog;
  try {
    catalog = await buildCatalog();
  } catch (e) {
    console.log('::warning::keeping the chart already in the page — ' + String((e && e.message) || e));
    return;
  }

  console.log('chart: ' + catalog.at + ' · ' + catalog.top.length + ' top · ' + catalog.genres.length + ' genres');

  /* Compare content, not the timestamp: an unchanged chart should not make a
     commit, and the date on the page should mean "when this chart changed". */
  const current = html.slice(start, end);
  let previous = null;
  try { previous = JSON.parse(current.slice(MARK.length)); } catch { /* rewrite it */ }
  const sameChart = previous &&
    JSON.stringify(previous.top) === JSON.stringify(catalog.top) &&
    JSON.stringify(previous.genres) === JSON.stringify(catalog.genres);
  if (sameChart) {
    console.log('chart unchanged since ' + previous.at);
    return;
  }

  writeFileSync(PAGE, html.slice(0, start) + MARK + JSON.stringify(catalog) + html.slice(end));
  console.log('wrote ' + PAGE);
}

main().catch((e) => {
  console.log('::error::' + String((e && e.message) || e));
  process.exitCode = 1;
});
