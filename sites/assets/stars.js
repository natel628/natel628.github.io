// stars.js — page state, rendering and the location control.
// Astronomy lives in astro.js; the shower catalogue lives in showers.js.

import { SHOWERS } from './showers.js';
import {
  activityFor,
  azimuth,
  darkWindow,
  evaluateNight,
  moonPhase,
  nextPeak,
  norm360
} from './astro.js';

const STORE_KEY = 'meteor-tracker:location';
const DEFAULT_LOCATION = { lat: 41.82, lon: -71.4, label: 'Rhode Island (default)' };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const UPCOMING_DAYS = 30;

let state = loadLocation();
let filter = 'soon';
let lastRows = [];

const $ = (id) => document.getElementById(id);
const compass = (deg) => COMPASS[Math.round(norm360(deg) / 22.5) % 16];
const fmtTime = (date) => date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const fmtDay = (date) => date.toLocaleDateString([], { month: 'short', day: 'numeric' });

// Peak dates are often next year's once this year's has passed, so say so.
function fmtPeak(date, now) {
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString([], sameYear
    ? { weekday: 'short', month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

function loadLocation() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
        return { lat: saved.lat, lon: saved.lon, label: saved.label || 'saved location' };
      }
    }
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return { ...DEFAULT_LOCATION };
}

function saveLocation() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // Ignore — location just won't persist.
  }
}

function rateNum(rate) {
  if (!rate || rate <= 0) return '0';
  if (rate < 1) return '<1';
  if (rate < 20) return String(Math.round(rate));
  return String(Math.round(rate / 5) * 5);
}

function rateLabel(rate) {
  const num = rateNum(rate);
  return num === '0' || num === '<1' ? num : `~${num}`;
}

function countdown(ms) {
  if (ms <= 0) return 'now';
  const minutes = Math.round(ms / 60000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${rest}m`;
  return `${Math.max(1, rest)}m`;
}

function buildRows(now) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  return SHOWERS.map((shower) => {
    const night = evaluateNight(shower, state.lat, state.lon, now);
    const peak = nextPeak(shower, startOfToday);
    const activity = activityFor(shower, now);
    return {
      shower,
      night,
      peak,
      daysToPeak: Math.round((peak - startOfToday) / 86400000),
      active: activity.inRange
    };
  }).sort((a, b) => {
    const rateA = a.night.bestWindow ? a.night.bestWindow.peak.rate : 0;
    const rateB = b.night.bestWindow ? b.night.bestWindow.peak.rate : 0;
    if (Math.abs(rateA - rateB) > 0.5) return rateB - rateA;
    return a.daysToPeak - b.daysToPeak;
  });
}

function renderHero(rows, now) {
  const el = $('hero');
  const moon = moonPhase(now);
  const dark = darkWindow(state.lat, state.lon, now);
  const darkNow = Boolean(dark) && now >= dark.start && now <= dark.end;

  const darkLine = dark
    ? `Astronomical dark <b>${fmtTime(dark.start)}</b> → <b>${fmtTime(dark.end)}</b>${darkNow ? ' · dark right now' : ''}`
    : 'No full astronomical darkness at this latitude in the next day';

  const top = rows.find((row) => row.night.bestWindow && row.night.bestWindow.peak.rate >= 1);

  if (!top) {
    const soonest = rows.reduce((a, b) => (a.peak < b.peak ? a : b));
    el.innerHTML = `
      <p class="eyebrow">Tonight where you are</p>
      <h2 class="hero-title">Quiet skies tonight</h2>
      <p class="hero-sub">Nothing is above the useful threshold while it is properly dark. The next peak is the
        <b>${soonest.shower.name}</b> on <b>${fmtDay(soonest.peak)}</b>, ${countdown(soonest.peak - now)} from now.</p>
      <p class="hero-foot">${darkLine} · Moon ${Math.round(moon.illumination * 100)}% lit (${moon.name})</p>`;
    return;
  }

  const window_ = top.night.bestWindow;
  const sample = window_.peak;
  const peakMoon = moonPhase(sample.time);
  const bearing = compass(azimuth(top.shower.ra, top.shower.dec, sample.time, state.lat, state.lon));

  el.innerHTML = `
    <p class="eyebrow">Tonight where you are</p>
    <div class="hero-top">
      <div>
        <h2 class="hero-title">${top.shower.name}</h2>
        <p class="hero-sub">Best between <b>${fmtTime(window_.start)}</b> and <b>${fmtTime(window_.end)}</b>,
          with the radiant <b>${Math.round(sample.radiantAlt)}°</b> up in the <b>${bearing}</b>.</p>
      </div>
      <p class="hero-rate">
        <span class="hero-num">${rateNum(sample.rate)}</span>
        <span class="hero-unit">meteors/hr<br>estimated</span>
      </p>
    </div>
    <p class="hero-foot">${darkLine} · Moon ${Math.round(peakMoon.illumination * 100)}% lit (${peakMoon.name})</p>`;
}

function chipFor(row) {
  if (row.daysToPeak === 0) return '<span class="chip chip-hot">Peaks tonight</span>';
  if (row.active && row.daysToPeak <= 2) return '<span class="chip chip-warm">Near peak</span>';
  if (row.active) return '<span class="chip chip-on">Active</span>';
  return '<span class="chip">Off-season</span>';
}

function cardHTML(row, now) {
  const s = row.shower;
  const window_ = row.night.bestWindow;
  // A window with a rounding-to-nothing rate is noise, not a plan.
  const showWindow = Boolean(window_) && window_.peak.rate >= 0.5;
  const sampleTime = showWindow ? window_.peak.time : now;
  const moon = moonPhase(sampleTime);

  const stats = showWindow
    ? `<div><dt>Best window</dt><dd>${fmtTime(window_.start)} – ${fmtTime(window_.end)}</dd></div>
       <div><dt>Radiant</dt><dd>${Math.round(window_.peak.radiantAlt)}° ${compass(azimuth(s.ra, s.dec, sampleTime, state.lat, state.lon))}</dd></div>
       <div><dt>Est. rate</dt><dd>${rateLabel(window_.peak.rate)}/hr</dd></div>
       <div><dt>Moon</dt><dd>${Math.round(moon.illumination * 100)}% lit</dd></div>`
    : `<div><dt>Next peak</dt><dd>${fmtPeak(row.peak, now)}</dd></div>
       <div><dt>Countdown</dt><dd>${countdown(row.peak - now)}</dd></div>
       <div><dt>Tonight</dt><dd>${row.active ? 'radiant too low' : 'not active'}</dd></div>
       <div><dt>Moon then</dt><dd>${Math.round(moon.illumination * 100)}% lit</dd></div>`;

  return `
    <article class="card${row.active ? '' : ' is-off'}">
      <div class="card-top">
        <h3>${s.name} <span class="code">${s.code}</span></h3>
        ${chipFor(row)}
      </div>
      <p class="card-meta">Peak ${fmtPeak(row.peak, now)} · ZHR ${s.zhr} · ${s.velocity} km/s · ${s.parent}</p>
      <dl class="stats">${stats}</dl>
      <p class="card-note">${s.note}</p>
    </article>`;
}

// "Upcoming" means a peak inside the next month; anything further out is
// still there under the All filter.
const passesFilter = (row) => filter === 'all' || row.active || row.daysToPeak <= UPCOMING_DAYS;

function renderGrid(rows, now) {
  const visible = rows.filter(passesFilter);
  $('showCount').textContent = `Showing ${visible.length} of ${rows.length}`;

  $('grid').innerHTML = visible.length
    ? visible.map((row) => cardHTML(row, now)).join('')
    : `<p class="empty">No shower is active or peaks within ${UPCOMING_DAYS} days.
        <button type="button" class="btn btn-ghost btn-sm" data-show-all>Show all showers</button></p>`;
}

function setFilter(next) {
  filter = next;
  document.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.filter === filter));
  });
  renderGrid(lastRows, new Date());
}

function renderStrip(now) {
  const el = $('strip');
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const nextYear = new Date(now.getFullYear() + 1, 0, 1);
  const yearMs = nextYear - startOfYear;
  const pct = (date) => Math.min(100, Math.max(0, ((date - startOfYear) / yearMs) * 100)).toFixed(2);

  const dots = SHOWERS.map((s) => {
    const peak = new Date(now.getFullYear(), s.peak[0] - 1, s.peak[1]);
    const label = `${s.name}, peaks ${peak.toLocaleDateString([], { month: 'long', day: 'numeric' })}`;
    return `<span class="dot${peak < now ? ' past' : ''}" style="left:${pct(peak)}%"
      tabindex="0" role="img" aria-label="${label}" title="${label}"></span>`;
  }).join('');

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  el.innerHTML = `
    <div class="strip-track" aria-hidden="false">
      ${dots}
      <span class="now" style="left:${pct(now)}%" aria-hidden="true"></span>
    </div>
    <div class="strip-months">${months.map((m) => `<span>${m}</span>`).join('')}</div>`;
}

function render() {
  const now = new Date();
  $('locName').textContent = `${state.label} · ${state.lat.toFixed(2)}, ${state.lon.toFixed(2)}`;
  lastRows = buildRows(now);
  renderHero(lastRows, now);
  renderStrip(now);
  renderGrid(lastRows, now);
}

function setLocation(next, message) {
  state = next;
  saveLocation();
  render();
  $('locMsg').textContent = message || '';
}

$('geoBtn').addEventListener('click', () => {
  const msg = $('locMsg');
  if (!navigator.geolocation) {
    msg.textContent = 'This browser has no geolocation — enter coordinates instead.';
    return;
  }
  msg.textContent = 'Asking your browser for your location…';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      setLocation({
        lat: Number(position.coords.latitude.toFixed(3)),
        lon: Number(position.coords.longitude.toFixed(3)),
        label: 'your current location'
      }, 'Using the location your device reported.');
    },
    (error) => {
      msg.textContent = error.code === 1
        ? 'Location permission was denied — enter coordinates instead.'
        : 'Could not get your location — enter coordinates instead.';
    },
    { timeout: 10000 }
  );
});

$('manualBtn').addEventListener('click', () => {
  const form = $('manual');
  const open = form.hasAttribute('hidden');
  form.toggleAttribute('hidden', !open);
  $('manualBtn').setAttribute('aria-expanded', String(open));
  if (open) {
    $('lat').value = state.lat.toFixed(2);
    $('lon').value = state.lon.toFixed(2);
    $('lat').focus();
  }
});

$('manual').addEventListener('submit', (event) => {
  event.preventDefault();
  const lat = Number($('lat').value.trim());
  const lon = Number($('lon').value.trim());
  const msg = $('locMsg');

  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    msg.textContent = 'Enter a latitude between -90 and 90 and a longitude between -180 and 180.';
    return;
  }

  setLocation({ lat, lon, label: 'entered coordinates' }, 'Using the coordinates you entered.');
});

document.querySelector('.filters').addEventListener('click', (event) => {
  const btn = event.target.closest('.filter-btn');
  if (btn && btn.dataset.filter !== filter) setFilter(btn.dataset.filter);
});

$('grid').addEventListener('click', (event) => {
  if (event.target.closest('[data-show-all]')) setFilter('all');
});

render();
setInterval(render, 10 * 60 * 1000);
