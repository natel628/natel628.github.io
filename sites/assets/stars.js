// stars.js — page state, rendering and the location control.
// Astronomy lives in astro.js; the shower catalogue lives in showers.js.

import { SHOWERS } from './showers.js';
import {
  activityFor,
  azimuth,
  darkWindow,
  evaluateNight,
  moonPhase,
  norm360,
  seasonDays as seasonNights,
  seasonWindow
} from './astro.js';
import { nightChart, seasonChart, skyDial } from './charts.js';
import { clearAt, cloudCover } from './weather.js';

const STORE_KEY = 'meteor-tracker:location';
const DEFAULT_LOCATION = { lat: 41.82, lon: -71.4, label: 'Rhode Island (default)', sky: 'suburban' };

// Limiting magnitudes of roughly 6.5 (dark rural), 5.5 (suburban) and 4.5
// (city), applied as the standard 2.5^(lm - 6.5) correction to ZHR.
const SKY = { dark: 1, suburban: 2.5 ** -1, city: 2.5 ** -2 };
const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

const UPCOMING_DAYS = 30;

let state = loadLocation();
let filter = 'soon';
let lastRows = [];
let weather = { points: null, key: '', failedAt: 0, pending: false };
let rowMap = new Map();
// Remembers the hour each tile was scrubbed to, so the 10-minute refresh
// doesn't reset the dial under the reader.
const lookIndexByShower = new Map();

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

// "Nov 6 – Nov 30", or with years when the season crosses New Year.
function fmtRange(start, end) {
  if (start.getFullYear() === end.getFullYear()) {
    return `${fmtDay(start)} – ${fmtDay(end)}`;
  }
  const withYear = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString([], withYear)} – ${end.toLocaleDateString([], withYear)}`;
}

function loadLocation() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
        return {
          lat: saved.lat,
          lon: saved.lon,
          label: saved.label || 'saved location',
          sky: SKY[saved.sky] ? saved.sky : DEFAULT_LOCATION.sky
        };
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

// Clear-sky fraction from the forecast, or null when there isn't one.
function clearFor(time) {
  if (!weather.points) return null;
  return clearAt(weather.points, time);
}

function cloudPercent(time) {
  const clear = clearFor(time);
  return clear === null ? null : Math.round((1 - clear) * 100);
}

function buildRows(now) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const skyFactor = SKY[state.sky] ?? 1;
  const clearSky = weather.points
    ? (time) => {
      const value = clearAt(weather.points, time);
      return value === null ? 1 : value;
    }
    : null;

  return SHOWERS.map((shower) => {
    const night = evaluateNight(shower, state.lat, state.lon, now, { skyFactor, clearSky });
    // The season containing today (or the next one) is what the card talks
    // about, so the peak shown always belongs to the range beside it.
    const season = seasonWindow(shower, now);
    const activity = activityFor(shower, now);
    return {
      shower,
      night,
      season,
      seasonDays: seasonNights(shower, season),
      peak: season.peak,
      daysToPeak: Math.round((season.peak - startOfToday) / 86400000),
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

  const quietCloudPct = cloudPercent(now);
  const quietCloud = quietCloudPct === null ? '' : ` · sky ${quietCloudPct}% cloud`;

  const top = rows.find((row) => row.night.bestWindow && row.night.bestWindow.peak.rate >= 1);

  if (!top) {
    const soonest = rows.reduce((a, b) => (a.peak < b.peak ? a : b));
    el.innerHTML = `
      <p class="eyebrow">Tonight where you are</p>
      <h2 class="hero-title">Quiet skies tonight</h2>
      <p class="hero-sub">Nothing is above the useful threshold while it is properly dark. The next peak is the
        <b>${soonest.shower.name}</b> on <b>${fmtDay(soonest.peak)}</b>, ${countdown(soonest.peak - now)} from now.</p>
      <p class="hero-foot">${darkLine} · Moon ${Math.round(moon.illumination * 100)}% lit (${moon.name})${quietCloud}</p>`;
    return;
  }

  const window_ = top.night.bestWindow;
  const sample = window_.peak;
  const peakMoon = moonPhase(sample.time);
  const bearing = compass(azimuth(top.shower.ra, top.shower.dec, sample.time, state.lat, state.lon));
  const cloudPct = cloudPercent(sample.time);

  el.innerHTML = `
    <p class="eyebrow">Tonight where you are</p>
    <div class="hero-top">
      <div>
        <h2 class="hero-title">${top.shower.name}</h2>
        <p class="hero-sub">Best between <b>${fmtTime(window_.start)}</b> and <b>${fmtTime(window_.end)}</b>.
          Meteors will appear to come from the <b>${bearing}</b>, <b>${Math.round(sample.radiantAlt)}°</b> above the horizon.</p>
      </div>
      <p class="hero-rate">
        <span class="hero-num">${rateNum(sample.rate)}</span>
        <span class="hero-unit">meteors/hr<br>estimated</span>
      </p>
    </div>
    <p class="hero-foot">${darkLine} · Moon ${Math.round(peakMoon.illumination * 100)}% lit (${peakMoon.name})${cloudPct === null ? '' : ` · sky ${cloudPct}% cloud`}</p>`;
}

function lookIndex(row) {
  const samples = row.night.samples;
  const remembered = lookIndexByShower.get(row.shower.id);
  if (Number.isInteger(remembered) && remembered < samples.length) return remembered;

  const target = (row.night.bestWindow ? row.night.bestWindow.peak.time : new Date()).getTime();
  let index = 0;
  samples.forEach((sample, i) => {
    if (Math.abs(sample.time - target) < Math.abs(samples[index].time - target)) index = i;
  });
  return index;
}

function aimText(shower, sample) {
  if (sample.radiantAlt < 0) {
    return 'The radiant is below the horizon at this hour, so nothing from this shower is visible yet.';
  }
  const bearing = compass(azimuth(shower.ra, shower.dec, sample.time, state.lat, state.lon));
  return `Face <b>${bearing}</b> and look about <b>${Math.round(sample.radiantAlt)}°</b> up`;
}

function dialLabel(shower, sample) {
  const bearing = compass(azimuth(shower.ra, shower.dec, sample.time, state.lat, state.lon));
  return `${shower.name} radiant at ${bearing}, ${Math.round(sample.radiantAlt)} degrees above the horizon`;
}

function lookBlock(row) {
  const s = row.shower;
  const samples = row.night.samples;
  const index = lookIndex(row);
  const sample = samples[index];
  const first = fmtTime(samples[0].time);
  const last = fmtTime(samples[samples.length - 1].time);

  return `
        <div class="look">
          <h4>Where to look</h4>
          <div class="look-grid">
            <div class="look-dial" data-look-dial>${skyDial({
              azimuth: azimuth(s.ra, s.dec, sample.time, state.lat, state.lon),
              altitude: sample.radiantAlt,
              label: dialLabel(s, sample)
            })}</div>
            <div class="look-side">
              <p class="look-time"><b data-look-time>${fmtTime(sample.time)}</b> · <span data-look-rate>${rateLabel(sample.rate)}/hr</span></p>
              <p class="look-aim" data-look-aim>${aimText(s, sample)}</p>
              <input class="look-slider" type="range" min="0" max="${samples.length - 1}" step="1" value="${index}"
                data-look-slider aria-label="Time to plan for" aria-valuetext="${fmtTime(sample.time)}">
              <p class="look-scale"><span>${first}</span><span>${last}</span></p>
            </div>
          </div>
          <p class="chart-caption">Centre of the circle is straight overhead, the rim is the horizon. The dot is where the meteors appear to come from — they fan out around it, so keep that part of the sky in view.</p>
        </div>`;
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
  const samples = row.night.samples;
  const highest = samples.reduce((a, b) => (b.radiantAlt > a.radiantAlt ? b : a), samples[0]);
  const range = fmtRange(row.season.start, row.season.end);
  const nights = Math.round((row.season.end - row.season.start) / 86400000) + 1;
  const windowCloud = cloudPercent(window_ ? window_.peak.time : now);
  const look = lookBlock(row);

  const stats = showWindow
    ? `<div><dt>Best window</dt><dd>${fmtTime(window_.start)} – ${fmtTime(window_.end)}</dd></div>
       <div><dt>Coming from</dt><dd>${Math.round(window_.peak.radiantAlt)}° ${compass(azimuth(s.ra, s.dec, sampleTime, state.lat, state.lon))}</dd></div>
       <div><dt>Est. rate</dt><dd>${rateLabel(window_.peak.rate)}/hr</dd></div>
       <div><dt>Moon</dt><dd>${Math.round(moon.illumination * 100)}% lit</dd></div>`
    : `<div><dt>Next peak</dt><dd>${fmtPeak(row.peak, now)}</dd></div>
       <div><dt>Countdown</dt><dd>${countdown(row.peak - now)}</dd></div>
       <div><dt>Tonight</dt><dd>${row.active ? 'radiant too low' : 'not active'}</dd></div>
       <div><dt>Moon then</dt><dd>${Math.round(moon.illumination * 100)}% lit</dd></div>`;

  const first = samples[0].time.getTime();
  const last = samples[samples.length - 1].time.getTime();
  const ticks = [0, 1, 2, 3, 4]
    .map((i) => fmtTime(new Date(first + ((last - first) * i) / 4)));

  const hasForecast = Boolean(weather.points);
  const hourly = nightChart(
    samples,
    window_,
    `Estimated meteors per hour over the next 24 hours, ${ticks[0]} to ${ticks[4]}`
      + (hasForecast ? ', with forecast cloud cover' : ''),
    { cloud: hasForecast }
  );
  const season = seasonChart(row.seasonDays, {
    today: now,
    peak: row.season.peak,
    label: `${s.name} activity from ${range}, peaking ${fmtDay(row.season.peak)}`
  });

  return `
    <details class="card${row.active ? '' : ' is-off'}" data-id="${s.id}">
      <summary class="card-face">
        <div class="card-top">
          <h3>${s.name} <span class="code">${s.code}</span></h3>
          ${chipFor(row)}
        </div>
        <p class="card-meta">Peak ${fmtPeak(row.peak, now)} · ZHR ${s.zhr} · ${s.velocity} km/s</p>
        <p class="card-range">Active <strong>${range}</strong> · ${nights} nights</p>
        <dl class="stats">${stats}</dl>
        <p class="card-toggle">Charts &amp; details <span class="chev" aria-hidden="true">▾</span></p>
      </summary>
      <div class="card-detail">
        ${look}
        <div class="chart-block">
          <h4>Next 24 hours</h4>
          ${hourly}
          <p class="chart-axis">${ticks.map((tick) => `<span>${tick}</span>`).join('')}</p>
          <p class="chart-caption">Gold band is the usable window, grey bands are the dark hours${hasForecast ? ', and the dashed line is forecast cloud cover (100% at the top)' : ''}.</p>
        </div>
        <div class="chart-block">
          <h4>Every night of the season</h4>
          ${season}
          <p class="chart-caption">${range} · peak ${fmtDay(row.season.peak)}${row.active ? ' · today is the teal bar' : ''}</p>
        </div>
        <p class="card-facts">The radiant — the patch of sky these meteors appear to come from — is highest at <b>${fmtTime(highest.time)}</b>, <b>${Math.round(highest.radiantAlt)}°</b> above the horizon.${windowCloud === null ? '' : ` Forecast: <b>${windowCloud}%</b> cloud around the window.`} Debris from ${s.parent}.</p>
        <p class="card-note">${s.note}</p>
      </div>
    </details>`;
}

// "Upcoming" means a peak inside the next month; anything further out is
// still there under the All filter.
const passesFilter = (row) => filter === 'all' || row.active || row.daysToPeak <= UPCOMING_DAYS;

function renderGrid(rows, now) {
  const visible = rows.filter(passesFilter);
  // The 10-minute refresh rebuilds the markup, so remember which tiles the
  // reader had opened and put them back.
  const openIds = [...document.querySelectorAll('#grid .card[open]')].map((el) => el.dataset.id);

  $('showCount').textContent = `Showing ${visible.length} of ${rows.length}`;

  $('grid').innerHTML = visible.length
    ? visible.map((row) => cardHTML(row, now)).join('')
    : `<p class="empty">No shower is active or peaks within ${UPCOMING_DAYS} days.
        <button type="button" class="btn btn-ghost btn-sm" data-show-all>Show all showers</button></p>`;

  rowMap = new Map(visible.map((row) => [row.shower.id, row]));

  document.querySelectorAll('#grid .card').forEach((el) => {
    if (openIds.includes(el.dataset.id)) el.open = true;
  });
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

function paint() {
  const now = new Date();
  $('locName').textContent = `${state.label} · ${state.lat.toFixed(2)}, ${state.lon.toFixed(2)}`;
  lastRows = buildRows(now);
  renderHero(lastRows, now);
  renderStrip(now);
  renderGrid(lastRows, now);
}

// The forecast is the only network call the page makes: fetch it once per
// location, repaint when it lands, and only retry after a cooling-off period
// so an offline reader never sees a request loop.
function ensureWeather() {
  const key = `${state.lat},${state.lon}`;
  if (weather.pending) return;
  const settled = weather.key === key
    && (weather.points || Date.now() - weather.failedAt < 10 * 60 * 1000);
  if (settled) return;

  weather.pending = true;
  cloudCover(state.lat, state.lon)
    .then((points) => {
      weather = { points, key, failedAt: 0, pending: false };
      paint();
    })
    .catch(() => {
      weather = { points: null, key, failedAt: Date.now(), pending: false };
      paint();
    });
}

function render() {
  paint();
  ensureWeather();
}

function setLocation(next, message) {
  state = { ...state, ...next };
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

// Scrubbing the hour updates the dial in place, so the tile never closes.
$('grid').addEventListener('input', (event) => {
  const slider = event.target.closest('[data-look-slider]');
  if (!slider) return;

  const card = slider.closest('.card');
  const row = rowMap.get(card?.dataset.id);
  if (!row) return;

  const index = Number(slider.value);
  const sample = row.night.samples[index];
  if (!sample) return;

  lookIndexByShower.set(row.shower.id, index);
  const aim = aimText(row.shower, sample);

  card.querySelector('[data-look-dial]').innerHTML = skyDial({
    azimuth: azimuth(row.shower.ra, row.shower.dec, sample.time, state.lat, state.lon),
    altitude: sample.radiantAlt,
    label: dialLabel(row.shower, sample)
  });
  card.querySelector('[data-look-time]').textContent = fmtTime(sample.time);
  card.querySelector('[data-look-rate]').textContent = `${rateLabel(sample.rate)}/hr`;
  card.querySelector('[data-look-aim]').innerHTML = aim;
  slider.setAttribute('aria-valuetext', `${fmtTime(sample.time)}: ${aim.replace(/<[^>]*>/g, '')}`);
});

$('sky').addEventListener('change', () => {
  state = { ...state, sky: $('sky').value };
  saveLocation();
  render();
});

$('sky').value = state.sky;
render();
setInterval(render, 10 * 60 * 1000);
