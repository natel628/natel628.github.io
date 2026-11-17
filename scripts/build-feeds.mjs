#!/usr/bin/env node
/* What's Happening? - subscribable calendar feeds.

   Reads sites/whats-happening/data/live.json (written by scripts/sync-live.mjs
   from the same Ticketmaster + YouTube pull) and writes one .ics file per
   feed under sites/whats-happening/feeds/.

   The scheduled Action runs this right after the sync, so every feed is
   regenerated from the same source daily with no extra keys or services.
   Per-event UIDs are stable across regenerations, so Google and Apple
   Calendar update entries in place instead of duplicating them.

   No dependencies. Only Node 20 built-ins. Never fails the workflow: with
   no live.json yet it writes valid-but-empty calendars so feed URLs resolve.
*/
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE = join(ROOT, 'sites', 'whats-happening');
const LIVE = join(SITE, 'data', 'live.json');
const OUT = join(SITE, 'feeds');
const UID_DOMAIN = 'whats-happening.natel628.github.io';
const MAX_PER_FEED = 200;
const RADIUS_MI = 100;

const CITIES = [
  { id: 'greenville-sc', label: 'Greenville, SC', lat: 34.8526, lng: -82.3940 },
  { id: 'charlotte-nc', label: 'Charlotte, NC', lat: 35.2271, lng: -80.8431 },
  { id: 'asheville-nc', label: 'Asheville, NC', lat: 35.5951, lng: -82.5515 },
  { id: 'boone-nc', label: 'Boone, NC', lat: 36.2168, lng: -81.6746 },
  { id: 'atlanta-ga', label: 'Atlanta, GA', lat: 33.7490, lng: -84.3880 },
  { id: 'chicago-il', label: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
  { id: 'austin-tx', label: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
  { id: 'denver-co', label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  { id: 'seattle-wa', label: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  { id: 'new-york-ny', label: 'New York, NY', lat: 40.7128, lng: -74.0060 }
];

const BS = String.fromCharCode(92);
const CRLF = String.fromCharCode(13, 10);
const ICSNL = BS + 'n';
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);

function pad(n) { return (n < 10 ? '0' : '') + n; }
function stampUTC(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}
function stampFloat(d) {
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' +
    pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}
function parseWall(s) {
  if (typeof s !== 'string' || s.length < 16) return null;
  const y = +s.slice(0, 4), mo = +s.slice(5, 7), da = +s.slice(8, 10);
  const h = +s.slice(11, 13), mi = +s.slice(14, 16);
  if (!isFinite(y + mo + da + h + mi) || mo < 1 || mo > 12 || da < 1 || da > 31) return null;
  return new Date(Date.UTC(y, mo - 1, da, h, mi, 0));
}
function timeOf(ev) {
  if (ev.startUtc) {
    const d = new Date(ev.startUtc);
    if (!isNaN(d.getTime())) return { d, utc: true };
  }
  const d = parseWall(ev.startLocal);
  return d ? { d, utc: false } : null;
}
function distMi(lat1, lng1, lat2, lng2) {
  const R = 3958.8, toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad, dLng = (lng2 - lng1) * toRad;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}
function esc(s) {
  let t = String(s == null ? '' : s);
  t = t.split(BS).join(BS + BS);
  t = t.split(';').join(BS + ';');
  t = t.split(',').join(BS + ',');
  t = t.split(CR + LF).join(ICSNL);
  t = t.split(CR).join(ICSNL);
  t = t.split(LF).join(ICSNL);
  return t;
}
function fold(line) {
  if (line.length <= 74) return line;
  let out = line.slice(0, 74), rest = line.slice(74);
  while (rest.length > 73) { out += CRLF + ' ' + rest.slice(0, 73); rest = rest.slice(73); }
  return out + CRLF + ' ' + rest;
}
function upcoming(list) {
  const now = Date.now();
  return list.filter((ev) => {
    const t = timeOf(ev);
    return t && (t.d.getTime() + (ev.duration || 120) * 60000) >= now;
  });
}
function byTime(a, b) { return timeOf(a).d.getTime() - timeOf(b).d.getTime(); }
function isOnline(ev) {
  return ev.presence === 'online' || ev.presence === 'both' || !!ev.streamUrl || !!ev.channel;
}
function vevent(ev, dtstamp) {
  const t = timeOf(ev);
  if (!t) return null;
  const end = new Date(t.d.getTime() + (ev.duration || 120) * 60000);
  const startProp = t.utc ? 'DTSTART:' + stampUTC(t.d) : 'DTSTART:' + stampFloat(t.d);
  const endProp = t.utc ? 'DTEND:' + stampUTC(end) : 'DTEND:' + stampFloat(end);
  const link = ev.ticketUrl || ev.streamUrl || ev.officialUrl || '';
  const desc = ev.description + (link ? ICSNL + ICSNL + link : '') +
    ICSNL + ICSNL + 'Refreshed daily from live listings.';
  const loc = ev.venue + (ev.venueCity ? ', ' + ev.venueCity : '');
  const lines = [
    'BEGIN:VEVENT',
    'UID:' + ev.id + '@' + UID_DOMAIN,
    'DTSTAMP:' + dtstamp,
    startProp,
    endProp,
    'SUMMARY:' + esc(ev.title),
    'DESCRIPTION:' + esc(desc),
    'LOCATION:' + esc(loc),
    'STATUS:CONFIRMED'
  ];
  if (link) lines.push('URL:' + esc(link));
  lines.push('END:VEVENT');
  return lines.map(fold).join(CRLF);
}
function calendar(name, desc, events) {
  const dtstamp = stampUTC(new Date());
  const body = events.map((ev) => vevent(ev, dtstamp)).filter(Boolean).join(CRLF);
  const head = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Whats Happening//Live Feeds//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:' + esc(name),
    'X-WR-CALDESC:' + esc(desc)
  ].map(fold).join(CRLF);
  return head + (body ? CRLF + body : '') + CRLF + 'END:VCALENDAR' + CRLF;
}
function main() {
  let events = [];
  if (existsSync(LIVE)) {
    try {
      const j = JSON.parse(readFileSync(LIVE, 'utf8'));
      if (j && Array.isArray(j.events)) events = j.events;
    } catch (e) { console.log('::warning::live.json unreadable, writing empty feeds'); }
  }
  const live = upcoming(events);
  const weekCut = Date.now() + 7 * 86400000;
  const feeds = [
    { file: 'all.ics', name: "What's Happening? - Everything", desc: 'Every upcoming live listing.', test: () => true },
    { file: 'week.ics', name: "What's Happening? - This week", desc: 'The next 7 days.', test: (ev) => timeOf(ev).d.getTime() <= weekCut },
    { file: 'online.ics', name: "What's Happening? - Online", desc: 'Scheduled streams and premieres you can actually open.', test: isOnline },
    { file: 'comedy.ics', name: "What's Happening? - Comedy", desc: 'Upcoming comedy.', test: (ev) => ev.category === 'comedy' },
    { file: 'concerts.ics', name: "What's Happening? - Concerts", desc: 'Upcoming concerts and music.', test: (ev) => ev.category === 'music' },
    { file: 'sports.ics', name: "What's Happening? - Sports", desc: 'Upcoming sports.', test: (ev) => ev.category === 'sports' },
    { file: 'outdoor.ics', name: "What's Happening? - Outdoors", desc: 'Ski, snowboard and outdoor events.', test: (ev) => ev.category === 'outdoor' }
  ];
  for (const c of CITIES) {
    feeds.push({
      file: 'near-' + c.id + '.ics',
      name: "What's Happening? - Near " + c.label,
      desc: 'Upcoming events within 100 miles of ' + c.label + '.',
      test: (ev) => ev.lat != null && ev.lng != null && distMi(c.lat, c.lng, ev.lat, ev.lng) <= RADIUS_MI
    });
  }
  mkdirSync(OUT, { recursive: true });
  for (const f of feeds) {
    const list = live.filter((ev) => { try { return timeOf(ev) && f.test(ev); } catch (e) { return false; } });
    list.sort(byTime);
    writeFileSync(join(OUT, f.file), calendar(f.name, f.desc, list.slice(0, MAX_PER_FEED)));
    console.log(f.file + ': ' + Math.min(list.length, MAX_PER_FEED) + ' events');
  }
}
main();
