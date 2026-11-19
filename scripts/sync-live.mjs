#!/usr/bin/env node
/* What's Happening? - scheduled listing sync.

   Runs in GitHub Actions (see .github/workflows/sync-live.yml) with the repo
   secrets TICKETMASTER_API_KEY and YOUTUBE_API_KEY. It pulls upcoming events
   from both providers, normalises them to the exact event shape the site
   renders, and writes sites/whats-happening/data/live.json.

   Design rules:
   - No dependencies. Only Node 20 built-ins (fetch, fs, path).
   - Never fail the workflow on an API hiccup: per-source errors are recorded
     in the JSON and the run exits 0.
   - Never wipe good data on a transient failure: if the run produces zero
     events but a previous live.json exists, the old file is kept.
   - Times: Ticketmaster gives venue-local wall time, which the site already
     treats as viewer-local (documented caveat). YouTube gives UTC, stored in
     `startUtc` so the site can render it in each viewer's own timezone.
   - Artwork: each event carries the provider's own photo in `image` /
     `thumbnail` (Ticketmaster's 16:9 shot, YouTube's thumbnail).
   - Coverage: the ten home metros are queried first, then a nationwide pass
     fills the rest, so a visitor in a city nobody listed (Boston, say) still
     sees real events near them instead of an empty Near me page.
   - Past events are dropped and the query asks Ticketmaster for listings from
     today onward, so the store is not wasted on things that already happened.
*/
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'sites', 'whats-happening', 'data', 'live.json');

const TM_KEY = process.env.TICKETMASTER_API_KEY || '';
const YT_KEY = process.env.YOUTUBE_API_KEY || '';

/* Home metros: small per-city pull so the original areas keep dense coverage. */
const CITIES = [
  { id: 'greenville-sc', lat: 34.8526, lng: -82.3940 },
  { id: 'charlotte-nc', lat: 35.2271, lng: -80.8431 },
  { id: 'asheville-nc', lat: 35.5951, lng: -82.5515 },
  { id: 'boone-nc', lat: 36.2168, lng: -81.6746 },
  { id: 'atlanta-ga', lat: 33.7490, lng: -84.3880 },
  { id: 'chicago-il', lat: 41.8781, lng: -87.6298 },
  { id: 'austin-tx', lat: 30.2672, lng: -97.7431 },
  { id: 'denver-co', lat: 39.7392, lng: -104.9903 },
  { id: 'seattle-wa', lat: 47.6062, lng: -122.3321 },
  { id: 'new-york-ny', lat: 40.7128, lng: -74.0060 }
];

const RING_SIZE = 20;      // per home metro
const NAT_SIZE = 200;      // per nationwide page
const NAT_PAGES = 3;       // 600 fetched, capped below
const MAX_EVENTS = 500;    // keeps live.json near 500KB

const YT_QUERIES = [
  { q: 'live comedy show', category: 'comedy' },
  { q: 'live concert stream', category: 'music' },
  { q: 'live sports stream', category: 'sports' }
];

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function getJSON(url, timeoutMs) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 15000);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('http ' + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

/* Ticketmaster sends one entry per crop and size. The 16:9 shot is the one
   that fits a tile; fall back to the first usable URL rather than to nothing. */
function tmImage(images) {
  if (!Array.isArray(images) || !images.length) return null;
  let first = null;
  for (const im of images) {
    if (!im || typeof im.url !== 'string' || !im.url) continue;
    if (im.ratio === '16_9' && (im.width || 0) >= 640) return im.url;
    if (!first) first = im.url;
  }
  return first;
}

function ytImage(snippet) {
  const t = (snippet && snippet.thumbnails) || {};
  const pick = t.maxres || t.standard || t.high || t.medium || t.default || null;
  return pick && typeof pick.url === 'string' ? pick.url : null;
}

function tmCategory(item) {
  const cls = (item.classifications && item.classifications[0]) || {};
  const seg = (cls.segment || {}).name || '';
  const genre = (cls.genre || {}).name || '';
  const s = seg.toLowerCase();
  if (s.includes('sport')) return 'sports';
  if (s.includes('arts') || genre.toLowerCase().includes('comedy')) return 'comedy';
  if (s.includes('misc')) return 'festival';
  return 'music';
}

function normalizeTM(item) {
  const v = (item._embedded && item._embedded.venues && item._embedded.venues[0]) || {};
  const loc = v.location || {};
  const start = (item.dates && item.dates.start) || {};
  if (!start.localDate) return null;
  const pr = (item.priceRanges && item.priceRanges[0]) || null;
  const img = tmImage(item.images);
  return {
    id: 'tm-' + item.id,
    source: 'ticketmaster',
    title: item.name,
    description: ((item.info && item.info.note) || (item.pleaseNote || '').replace(/<[^>]*>/g, '') || 'Listed by Ticketmaster with no additional description.').slice(0, 300),
    category: tmCategory(item),
    presence: 'in-person',
    startLocal: start.localDate + 'T' + (start.localTime ? start.localTime.slice(0, 5) : '19:00'),
    duration: 150,
    venue: v.name || 'Venue not listed',
    cityId: '',
    lat: loc.latitude ? +loc.latitude : null,
    lng: loc.longitude ? +loc.longitude : null,
    popularity: 70,
    performers: [],
    tags: [(((item.classifications && item.classifications[0] && item.classifications[0].genre) || {}).name || '').toLowerCase()].filter(Boolean),
    price: pr ? { min: Math.round(pr.min), max: Math.round(pr.max), currency: pr.currency || 'USD', verified: true } : null,
    ticketUrl: item.url || null,
    streamUrl: null,
    officialUrl: item.url || null,
    broadcast: null,
    channel: null,
    resort: null,
    premiere: false,
    timezone: (item.dates && item.dates.timezone) || '',
    venueCity: (v.city && v.city.name) || '',
    stateCode: (v.state && v.state.stateCode) || '',
    image: img,
    thumbnail: img,
    lastUpdated: new Date().toISOString()
  };
}

function ytCategory(title, fallback) {
  const t = (title || '').toLowerCase();
  if (/comedy|stand-?up|improv|podcast/.test(t)) return 'comedy';
  if (/concert|music|band|dj|symphony/.test(t)) return 'music';
  if (/sport|game|match|race|fight|esports|tournament/.test(t)) return 'sports';
  return fallback || 'online';
}

function normalizeYT(v, fallbackCat) {
  const sn = v.snippet || {};
  const ld = v.liveStreamingDetails || {};
  const iso = ld.actualStartTime || ld.scheduledStartTime;
  if (!iso) return null;
  const live = sn.liveBroadcastContent === 'live';
  const img = ytImage(sn);
  return {
    id: 'yt-' + v.id,
    source: 'youtube',
    title: sn.title,
    description: (sn.description ? sn.description.slice(0, 220) : 'Scheduled on YouTube by ' + sn.channelTitle + '.'),
    category: ytCategory(sn.title, fallbackCat),
    presence: 'online',
    startLocal: iso.slice(0, 16),
    startUtc: iso,
    duration: live ? 180 : 90,
    venue: sn.channelTitle,
    channelName: sn.channelTitle,
    cityId: '',
    lat: null,
    lng: null,
    popularity: 60,
    performers: [],
    tags: ['youtube', 'livestream'],
    price: { min: 0, max: 0, currency: 'USD', verified: true },
    ticketUrl: null,
    streamUrl: 'https://www.youtube.com/watch?v=' + v.id,
    officialUrl: 'https://www.youtube.com/watch?v=' + v.id,
    broadcast: null,
    channel: 'yt:' + sn.channelId,
    resort: null,
    premiere: sn.liveBroadcastContent === 'upcoming' && /premiere/i.test(sn.title || ''),
    image: img,
    thumbnail: img,
    lastUpdated: new Date().toISOString()
  };
}

const TM_API = 'https://app.ticketmaster.com/discovery/v2/events.json';

async function fetchTicketmaster() {
  if (!TM_KEY) return { status: 'skipped', error: 'TICKETMASTER_API_KEY secret not set', events: [] };
  const events = [];
  const errors = [];
  const startDateTime = new Date().toISOString().slice(0, 19) + 'Z';

  /* Home metros first, so the towns this site started with stay dense. */
  for (const c of CITIES) {
    const url = TM_API + '?apikey=' + encodeURIComponent(TM_KEY) +
      '&latlong=' + c.lat + ',' + c.lng + '&radius=100&unit=miles' +
      '&size=' + RING_SIZE + '&sort=date,asc&startDateTime=' + encodeURIComponent(startDateTime);
    try {
      const j = await getJSON(url, 20000);
      for (const item of (j._embedded && j._embedded.events) || []) {
        const e = normalizeTM(item);
        if (e) events.push(e);
      }
    } catch (e) {
      errors.push(c.id + ': ' + String((e && e.message) || e));
    }
    await sleep(300); // stay far under the 5 req/sec limit
  }

  /* Then the whole country, so any town has something to show. */
  for (let page = 0; page < NAT_PAGES; page++) {
    const url = TM_API + '?apikey=' + encodeURIComponent(TM_KEY) +
      '&countryCode=US&size=' + NAT_SIZE + '&page=' + page +
      '&sort=date,asc&startDateTime=' + encodeURIComponent(startDateTime);
    try {
      const j = await getJSON(url, 25000);
      const items = (j._embedded && j._embedded.events) || [];
      for (const item of items) {
        const e = normalizeTM(item);
        if (e) events.push(e);
      }
      if (items.length < NAT_SIZE) break;   // last page
    } catch (e) {
      errors.push('nationwide page ' + page + ': ' + String((e && e.message) || e));
      break;
    }
    await sleep(300);
  }

  /* A ring or page can fail without taking the run down: only report an error
     when nothing at all came back. */
  if (!events.length && errors.length) {
    return { status: 'error', error: errors[0], events };
  }
  return { status: 'ok', error: errors.length ? errors.length + ' page(s) skipped' : null, events };
}

async function fetchYouTube() {
  if (!YT_KEY) return { status: 'skipped', error: 'YOUTUBE_API_KEY secret not set', events: [] };
  const events = [];
  try {
    for (const { q, category } of YT_QUERIES) {
      const search = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=upcoming' +
        '&maxResults=12&order=date&q=' + encodeURIComponent(q) + '&key=' + encodeURIComponent(YT_KEY);
      const j = await getJSON(search, 20000);
      const ids = (j.items || []).map((i) => i.id && i.id.videoId).filter(Boolean).slice(0, 12);
      if (!ids.length) continue;
      const v = await getJSON('https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=' +
        ids.join(',') + '&key=' + encodeURIComponent(YT_KEY), 20000);
      for (const item of v.items || []) {
        const e = normalizeYT(item, category);
        if (e) events.push(e);
      }
      await sleep(300);
    }
    return { status: 'ok', error: null, events };
  } catch (e) {
    return { status: 'error', error: String((e && e.message) || e), events };
  }
}

async function main() {
  const generatedAt = new Date().toISOString();
  const today = generatedAt.slice(0, 10);
  const [tm, yt] = [await fetchTicketmaster(), await fetchYouTube()];

  const seen = new Set();
  const events = [];
  for (const e of tm.events.concat(yt.events)) {
    if (!e || !e.id || seen.has(e.id)) continue;
    if (e.source === 'ticketmaster' && String(e.startLocal).slice(0, 10) < today) continue; // already happened
    seen.add(e.id);
    events.push(e);
    if (events.length >= MAX_EVENTS) break;
  }

  console.log('ticketmaster: ' + tm.status + ' (' + tm.events.length + ' events)' + (tm.error ? ' - ' + tm.error : ''));
  console.log('youtube: ' + yt.status + ' (' + yt.events.length + ' events)' + (yt.error ? ' - ' + yt.error : ''));
  console.log('total unique events: ' + events.length);

  if (!events.length && existsSync(OUT)) {
    console.log('::warning::No events fetched and a previous live.json exists - keeping the old file.');
    return;
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({
    generatedAt,
    sources: {
      ticketmaster: { status: tm.status, events: tm.events.length, error: tm.error },
      youtube: { status: yt.status, events: yt.events.length, error: yt.error }
    },
    events
  }));
  console.log('wrote ' + OUT);
}

main().catch((e) => {
  console.log('::warning::sync failed: ' + String((e && e.stack) || e));
});
