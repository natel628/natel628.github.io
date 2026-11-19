#!/usr/bin/env node
/* Deploy guard: refuse to publish when the live feed is missing, empty or stale.
   scripts/sync-live.mjs is the only writer of data/live.json, so a silent sync
   outage would otherwise ship a site showing days-old listings.
   Pass a file path as the first argument to check another feed. */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_AGE_HOURS = 48;
const LIVE = process.argv[2]
  ? resolve(process.argv[2])
  : join(dirname(fileURLToPath(import.meta.url)), '..', 'sites', 'whats-happening', 'data', 'live.json');

function fail(msg) {
  console.error('::error::live data: ' + msg);
  process.exit(1);
}

let raw;
try {
  raw = readFileSync(LIVE, 'utf8');
} catch (e) {
  fail('data/live.json is missing - run the "Sync live events" workflow');
}

let j;
try {
  j = JSON.parse(raw);
} catch (e) {
  fail('data/live.json is not valid JSON: ' + e.message);
}

const events = Array.isArray(j && j.events) ? j.events : null;
if (!events) fail('data/live.json has no events array');
if (events.length === 0) fail('data/live.json contains zero events - the last sync fetched nothing');

const gen = Date.parse((j && j.generatedAt) || '');
if (Number.isNaN(gen)) fail('data/live.json has no readable generatedAt');
const ageHours = (Date.now() - gen) / 36e5;
if (ageHours > MAX_AGE_HOURS) {
  fail('data/live.json is ' + Math.round(ageHours) + 'h old (limit ' + MAX_AGE_HOURS + 'h) - the daily sync looks stopped');
}

console.log('OK: ' + events.length + ' events, ' + Math.round(ageHours) + 'h old, generatedAt ' + j.generatedAt);
