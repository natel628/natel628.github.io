#!/usr/bin/env node
/* Candidate stories for The Daily Catch-Up.

   The "{date} → Daily Catch-Up" view in showsnew.html keeps a rundown board
   for today's episode, but it starts empty every morning, so the first job of
   the day is finding seven stories. This script bakes a handful of candidates
   per segment from keyless public sources into one line of the page:

       window.PODCAST_CANDIDATES = {"at":"...","segments":{...}};

   Each candidate is {h, u, s, d}: a headline, the link, where it came from and
   a short summary in the publisher's own words. The page drafts the day's
   episode from these; d is what the why-it-matters line is built on when no
   model is connected.

   It runs daily in GitHub Actions (.github/workflows/sync-catchup.yml) or by
   hand:

       node scripts/sync-catchup.mjs

   Design rules, the same ones scripts/sync-podcasts.mjs follows:
   - No dependencies: Node 20 built-ins only (fetch, fs, path, url).
   - A dead feed never fails the job: that segment is skipped, the reason is
     printed as a warning, and the rest are still baked.
   - A run that comes back nearly empty is treated as a broken run and leaves
     the candidates already in the page alone, exit 0.
   - It touches nothing but its own line, so the pagecrypt deploy is unchanged.
*/
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'showsnew.html');
const MARK = 'window.PODCAST_CANDIDATES = ';
const PER_SEGMENT = 4;
const MIN_TOTAL = 8; // below this the run did not really find the day's news
const TIMEOUT_MS = 20000;
const UA = 'daily-catch-up-sync (+https://github.com/natel628/natel628.github.io)';

/* One feed can cover several segments; each segment takes the first few
   items from its own list, so the same story never lands twice in a segment. */
const FEEDS = {
  headlines: [['https://feeds.npr.org/1001/rss.xml', 'NPR']],
  money: [['https://www.cnbc.com/id/20910258/device/rss/rss.html', 'CNBC Markets']],
  sports: [['https://www.espn.com/espn/rss/news', 'ESPN']],
  culture: [['https://variety.com/feed/', 'Variety']],
  newengland: [['https://www.wpri.com/feed/', 'WPRI']],
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function warn(msg) {
  console.log('::warning::' + msg);
}

async function get(url, as) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: as === 'json' ? 'application/json' : 'application/rss+xml, application/xml, text/xml' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
  return as === 'json' ? res.json() : res.text();
}

/* Feeds in the wild are RSS with plain or CDATA text, or Atom with a link
   element that carries the URL in an attribute. Both are flattened here. */
function clean(raw) {
  return String(raw || '')
    .replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, n) => {
      if (n[0] === '#') {
        const hex = n[1] === 'x' || n[1] === 'X';
        const code = parseInt(hex ? n.slice(2) : n.slice(1), hex ? 16 : 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : m;
      }
      return ENTITIES[n.toLowerCase()] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function items(xml, limit) {
  const out = [];
  for (const block of xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/gi) || []) {
    const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(block);
    const link = /<link[^>]*>([\s\S]*?)<\/link>/i.exec(block) || /<link[^>]*href="([^"]+)"/i.exec(block);
    const desc = /<(?:description|summary|content)[^>]*>([\s\S]*?)<\/(?:description|summary|content)>/i.exec(block);
    const h = clean(title && title[1]);
    const u = clean(link && link[1]);
    const d = clean(desc && desc[1]).slice(0, 240);
    if (h && /^https?:\/\//.test(u)) out.push({ h, u, d });
    if (out.length >= limit) break;
  }
  return out;
}

/* Long headlines make unreadable chips; the link always has the full title. */
function short(h) {
  return h.length > 120 ? h.slice(0, 117).replace(/[\s,;:.-]+$/, '') + '…' : h;
}

async function fromFeeds(feeds) {
  const seen = new Set();
  const out = [];
  for (const [url, source] of feeds) {
    let found = [];
    try {
      found = items(await get(url), PER_SEGMENT * 2);
    } catch (err) {
      warn(source + ' feed failed: ' + err.message);
    }
    for (const it of found) {
      if (seen.has(it.u)) continue;
      seen.add(it.u);
      out.push({ h: short(it.h), u: it.u, s: source, d: it.d || '' });
      if (out.length >= PER_SEGMENT) return out;
    }
  }
  return out;
}

async function hackerNews() {
  const ids = await get('https://hacker-news.firebaseio.com/v0/topstories.json', 'json');
  const out = [];
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, PER_SEGMENT * 2)) {
    if (out.length >= PER_SEGMENT) break;
    try {
      const item = await get('https://hacker-news.firebaseio.com/v0/item/' + id + '.json', 'json');
      if (item && item.title) {
        out.push({
          h: short(item.title),
          u: item.url || 'https://news.ycombinator.com/item?id=' + id,
          s: 'Hacker News',
          d: clean(item.text || '').slice(0, 240),
        });
      }
    } catch (err) {
      warn('Hacker News item ' + id + ' failed: ' + err.message);
    }
  }
  return out;
}

/* A story you would not have gone looking for: what happened on this date. */
async function onThisDay() {
  const now = new Date();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const data = await get('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/' + mm + '/' + dd, 'json');
  return (data.events || []).slice(0, PER_SEGMENT).map((ev) => {
    const page = ev.pages && ev.pages[0] && ev.pages[0].content_urls && ev.pages[0].content_urls.desktop;
    return {
      h: short(ev.year + ' — ' + ev.text),
      u: (page && page.page) || 'https://en.wikipedia.org/wiki/Wikipedia:On_this_day',
      s: 'Wikipedia, on this day',
      d: '',
    };
  });
}

const LOADERS = {
  headlines: () => fromFeeds(FEEDS.headlines),
  tech: hackerNews,
  money: () => fromFeeds(FEEDS.money),
  sports: () => fromFeeds(FEEDS.sports),
  culture: () => fromFeeds(FEEDS.culture),
  newengland: () => fromFeeds(FEEDS.newengland),
  rabbit: onThisDay,
};

const segments = {};
for (const [id, load] of Object.entries(LOADERS)) {
  let list = [];
  try {
    list = await load();
  } catch (err) {
    warn(id + ' failed: ' + err.message);
  }
  if (list.length) segments[id] = list;
}

const counts = Object.entries(segments).map(([id, list]) => id + ' ' + list.length);
const total = counts.reduce((n, line) => n + Number(line.split(' ')[1]), 0);

const html = readFileSync(PAGE, 'utf8');
const at = html.indexOf(MARK);
if (at < 0 || html.indexOf(MARK, at + MARK.length) >= 0) {
  console.error('::error::candidate line is missing or appears more than once in showsnew.html');
  process.exit(1);
}
const end = html.indexOf(';\n', at);
if (end < 0) {
  console.error('::error::candidate line has no end');
  process.exit(1);
}

if (total < MIN_TOTAL) {
  warn('only ' + total + ' candidates from ' + counts.length + ' segments; keeping the ones already in the page');
  process.exit(0);
}

const previous = (() => {
  try {
    return JSON.parse(html.slice(at + MARK.length, end));
  } catch {
    return {};
  }
})();

if (JSON.stringify(previous.segments || {}) === JSON.stringify(segments)) {
  console.log('candidates unchanged since ' + (previous.at || 'the last run') + ' (' + counts.join(' · ') + ')');
  process.exit(0);
}

const payload = { at: new Date().toISOString(), segments };
writeFileSync(PAGE, html.slice(0, at + MARK.length) + JSON.stringify(payload) + html.slice(end));
console.log('baked ' + total + ' candidates: ' + counts.join(' · '));
