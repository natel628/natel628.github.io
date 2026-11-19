#!/usr/bin/env node
/* Curated and monthly podcast data for showsnew.html.

   podcast.html is the full public podcast browser: it already bakes 12
   hand-picked collections (each show carrying an editorial score, tags and the
   reason to listen) plus Podtrac's monthly US audience ranking, which
   scripts/fetch-data.mjs refreshes. showsnew.html is a single encrypted file
   that has to work offline, so it cannot read podcast.html at runtime — this
   script copies the two lists into one baked line instead:

       window.PODCAST_VIEWS = {...};

   It rewrites that line in place and touches nothing else. Run it after
   podcast.html's data has been regenerated:

       node scripts/bake-podcast-views.mjs

   No dependencies: Node 20 built-ins only. If podcast.html has no monthly
   ranking yet, the month list is written empty and the page says so rather
   than inventing one.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'podcast.html');
const PAGE = join(ROOT, 'showsnew.html');

const MARK = 'window.PODCAST_VIEWS = ';
const MONTH_ENTRIES = 20;

/* Both data blocks are single assignments of one JSON object, so the object is
   found by brace matching rather than by a regex over a 1 MB line. */
function grab(source, name) {
  const i = source.indexOf('window.' + name + ' = ');
  if (i < 0) return null;
  const start = source.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < source.length; j++) {
    const c = source[j];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return JSON.parse(source.slice(start, j + 1));
  }
  return null;
}

const norm = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const src = readFileSync(SOURCE, 'utf8');
const data = grab(src, 'PODCAST_DATA');
const monthly = grab(src, 'PODCAST_MONTHLY');

if (!data || !data.curated || !Array.isArray(data.curated.picks)) {
  console.error('podcast.html has no PODCAST_DATA.curated — nothing to bake.');
  process.exit(1);
}

/* Artwork lives in the show dictionary, keyed by Apple id; a few picks only
   match on title, so both are tried before giving up on a cover. */
const shows = data.podcasts || {};
const byTitle = new Map(Object.values(shows).map(show => [norm(show.name), show]));
const lookup = (id, title) => shows[String(id)] || byTitle.get(norm(title)) || null;

const picks = data.curated.picks.map(pick => {
  const show = lookup(pick.id, pick.title);
  return {
    id: String(pick.id),
    n: pick.title,
    a: pick.artist,
    g: (show && show.primaryGenre) || (pick.tags || [])[0] || 'Podcast',
    art: (show && show.artwork) || '',
    w: pick.why,
    t: pick.tags || [],
    c: pick.collections || [],
    s: pick.editorialScore,
  };
});

const months = ((monthly && monthly.months) || []).filter(month => (month.entries || []).length);
const month = months.length ? months[months.length - 1] : null;
const entries = ((month && month.entries) || []).slice(0, MONTH_ENTRIES).map(entry => {
  const show = lookup(entry.id, entry.title);
  return {
    id: entry.id ? String(entry.id) : '',
    n: entry.title,
    a: entry.publisher || '',
    r: entry.rank,
    d: Number(entry.delta) || 0,
    art: (show && show.artwork) || '',
    g: (show && show.primaryGenre) || '',
  };
});

const views = {
  at: data.curated.generatedAt || '',
  curated: {
    collections: (data.curated.collections || []).map(c => ({ id: c.id, title: c.title, icon: c.icon, blurb: c.blurb })),
    picks,
  },
  month: {
    label: (month && month.label) || '',
    at: (month && month.at) || (monthly && monthly.generatedAt) || '',
    source: (monthly && monthly.source && monthly.source.name) || 'Podtrac',
    metric: (monthly && monthly.source && monthly.source.metric) || 'Unique monthly audience',
    note: (monthly && monthly.source && monthly.source.note) || '',
    entries,
  },
};

const line = 'window.PODCAST_VIEWS = ' + JSON.stringify(views) + ';';
const page = readFileSync(PAGE, 'utf8');

if (page.includes(MARK)) {
  const from = page.indexOf(MARK);
  const to = page.indexOf('\n', from);
  writeFileSync(PAGE, page.slice(0, from) + line + page.slice(to));
  console.log(`Rewrote PODCAST_VIEWS: ${picks.length} picks, ${entries.length} monthly rows.`);
} else {
  console.error('showsnew.html has no window.PODCAST_VIEWS line — add one first.');
  process.exit(1);
}
