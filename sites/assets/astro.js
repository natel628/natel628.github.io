// astro.js — dependency-free astronomy helpers for the shower tracker.
//
// Accuracy target is "good enough to plan an evening": positions to well
// under a degree, moon illumination to a few percent. No external data or
// API calls, so the page works offline once loaded.

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const J2000 = 2451545.0;
const SYNODIC_MONTH = 29.530588853;
const NEW_MOON_JD = 2451550.1; // 2000-01-06 18:14 UTC
const YEAR_DAYS = 365;

export const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
export const norm360 = (deg) => ((deg % 360) + 360) % 360;

export function julianDate(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

export function gmstDeg(date) {
  const d = julianDate(date) - J2000;
  return norm360(280.46061837 + 360.98564736629 * d);
}

export function localSiderealDeg(date, lonDeg) {
  return norm360(gmstDeg(date) + lonDeg);
}

// Altitude above the horizon, in degrees, for an equatorial position.
export function altitude(raDeg, decDeg, date, latDeg, lonDeg) {
  const hourAngle = (localSiderealDeg(date, lonDeg) - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle);
  return Math.asin(clamp(sinAlt, -1, 1)) * RAD;
}

// Compass bearing in degrees (0 = north, 90 = east).
export function azimuth(raDeg, decDeg, date, latDeg, lonDeg) {
  const hourAngle = (localSiderealDeg(date, lonDeg) - raDeg) * DEG;
  const dec = decDeg * DEG;
  const lat = latDeg * DEG;
  const y = -Math.cos(dec) * Math.sin(hourAngle);
  const x = Math.sin(dec) * Math.cos(lat) - Math.cos(dec) * Math.sin(lat) * Math.cos(hourAngle);
  return norm360(Math.atan2(y, x) * RAD);
}

export function sunEquatorial(date) {
  const n = julianDate(date) - J2000;
  const meanLong = norm360(280.460 + 0.9856474 * n);
  const meanAnom = norm360(357.528 + 0.9856003 * n) * DEG;
  const lambda = (meanLong + 1.915 * Math.sin(meanAnom) + 0.020 * Math.sin(2 * meanAnom)) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;
  return {
    ra: norm360(Math.atan2(Math.cos(obliquity) * Math.sin(lambda), Math.cos(lambda)) * RAD),
    dec: Math.asin(Math.sin(obliquity) * Math.sin(lambda)) * RAD
  };
}

export function sunAltitude(date, latDeg, lonDeg) {
  const sun = sunEquatorial(date);
  return altitude(sun.ra, sun.dec, date, latDeg, lonDeg);
}

export function moonEquatorial(date) {
  const n = julianDate(date) - J2000;
  const meanLong = 218.316 + 13.176396 * n;
  const meanAnom = (134.963 + 13.064993 * n) * DEG;
  const meanDist = (93.289 + 13.229350 * n) * DEG;
  const lambda = (meanLong + 6.289 * Math.sin(meanAnom)) * DEG;
  const beta = 5.128 * Math.sin(meanDist) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;
  const ra = Math.atan2(
    Math.sin(lambda) * Math.cos(obliquity) - Math.tan(beta) * Math.sin(obliquity),
    Math.cos(lambda)
  ) * RAD;
  const dec = Math.asin(
    Math.sin(beta) * Math.cos(obliquity) + Math.cos(beta) * Math.sin(obliquity) * Math.sin(lambda)
  ) * RAD;
  return { ra: norm360(ra), dec };
}

export function moonAltitude(date, latDeg, lonDeg) {
  const moon = moonEquatorial(date);
  return altitude(moon.ra, moon.dec, date, latDeg, lonDeg);
}

export function moonPhase(date) {
  const rawAge = (julianDate(date) - NEW_MOON_JD) % SYNODIC_MONTH;
  const age = (rawAge + SYNODIC_MONTH) % SYNODIC_MONTH;
  const fraction = age / SYNODIC_MONTH;
  const illumination = (1 - Math.cos(2 * Math.PI * fraction)) / 2;
  return { age, fraction, illumination, name: phaseName(fraction) };
}

function phaseName(fraction) {
  if (fraction < 0.03 || fraction >= 0.97) return 'new moon';
  if (fraction < 0.22) return 'waxing crescent';
  if (fraction < 0.28) return 'first quarter';
  if (fraction < 0.47) return 'waxing gibbous';
  if (fraction < 0.53) return 'full moon';
  if (fraction < 0.72) return 'waning gibbous';
  if (fraction < 0.78) return 'last quarter';
  return 'waning crescent';
}

// 1 at astronomical night, 0 in daylight.
export function darknessFactor(sunAltDeg) {
  if (sunAltDeg <= -18) return 1;
  if (sunAltDeg <= -12) return 0.6;
  if (sunAltDeg <= -6) return 0.25;
  if (sunAltDeg <= 0) return 0.05;
  return 0;
}

// How much a moon of this brightness and altitude washes the sky out (1 = none).
export function moonGlow(illumination, moonAltDeg) {
  const up = moonAltDeg > 0 ? clamp(moonAltDeg / 25 + 0.2, 0, 1) : 0;
  return 1 - 0.9 * illumination * up;
}

export function expectedRate(zhr, activity, radiantAltDeg, glow, darkness) {
  if (radiantAltDeg <= 0 || activity <= 0 || darkness <= 0) return 0;
  return zhr * activity * Math.sin(clamp(radiantAltDeg, 0, 90) * DEG) * glow * darkness;
}

// ── Shower activity ───────────────────────────────────────────────────────
// Dates are handled as day-of-year with a circular distance so windows that
// cross New Year (the Quadrantids) behave like every other shower.

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function dayOfYear(year, month, day) {
  return Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1;
}

function circular(n) {
  const m = n % YEAR_DAYS;
  return m < 0 ? m + YEAR_DAYS : m;
}

// Signed days from b to a on a 365-day ring, in (-182.5, 182.5].
function dayDelta(a, b) {
  const d = circular(a - b);
  return d > YEAR_DAYS / 2 ? d - YEAR_DAYS : d;
}

export function activityFor(shower, date) {
  const year = date.getUTCFullYear();
  const doy = dayOfYear(year, date.getUTCMonth() + 1, date.getUTCDate());
  const peakDoy = dayOfYear(year, shower.peak[0], shower.peak[1]);
  const startDoy = dayOfYear(year, shower.start[0], shower.start[1]);
  const endDoy = dayOfYear(year, shower.end[0], shower.end[1]);

  const span = circular(endDoy - startDoy) || YEAR_DAYS;
  const fromStart = circular(doy - startDoy);
  const daysFromPeak = dayDelta(doy, peakDoy);

  if (fromStart > span) return { activity: 0, inRange: false, daysFromPeak };

  const sigma = clamp(span / 5, 1.2, 4);
  const activity = Math.exp(-(daysFromPeak * daysFromPeak) / (2 * sigma * sigma));
  return { activity: Math.max(0.05, activity), inRange: true, daysFromPeak };
}

// Local midnight at the start of the shower's next peak date.
export function nextPeak(shower, from = new Date()) {
  const [month, day] = shower.peak;
  for (let year = from.getFullYear(); year <= from.getFullYear() + 2; year++) {
    const candidate = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (candidate.getTime() >= from.getTime()) return candidate;
  }
  return new Date(from.getFullYear() + 1, month - 1, day, 0, 0, 0, 0);
}

// The next stretch where the Sun is 18° below the horizon.
export function darkWindow(latDeg, lonDeg, now = new Date(), hours = 30, stepMinutes = 10) {
  const stepMs = stepMinutes * 60000;
  const steps = Math.round((hours * 60) / stepMinutes);
  let start = null;
  let end = null;

  for (let i = 0; i <= steps; i++) {
    const time = new Date(now.getTime() + i * stepMs);
    const dark = sunAltitude(time, latDeg, lonDeg) <= -18;
    if (dark) {
      if (!start) start = time;
      end = time;
    } else if (start) {
      break;
    }
  }
  return start ? { start, end } : null;
}

function addDays(date, days) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

// The active period that contains today, or the next one if the shower is
// between seasons. Handles windows that wrap around New Year.
export function seasonWindow(shower, now = new Date()) {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  const year = base.getFullYear();
  let upcoming = null;

  for (const y of [year - 1, year, year + 1]) {
    const peakDoy = dayOfYear(y, shower.peak[0], shower.peak[1]);
    const startDoy = dayOfYear(y, shower.start[0], shower.start[1]);
    const endDoy = dayOfYear(y, shower.end[0], shower.end[1]);
    const peak = new Date(y, shower.peak[0] - 1, shower.peak[1]);
    const start = addDays(peak, -circular(peakDoy - startDoy));
    const end = addDays(peak, circular(endDoy - peakDoy));

    if (base >= start && base <= end) return { peak, start, end };
    if (!upcoming && start > base) upcoming = { peak, start, end };
  }
  return upcoming;
}

// One entry per night of the season, for the season chart.
export function seasonDays(shower, window_) {
  const days = [];
  const cursor = new Date(window_.start);
  while (cursor <= window_.end) {
    days.push({ date: new Date(cursor), activity: activityFor(shower, cursor).activity });
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// Score every 10-minute step of the next `hours` for one shower.
export function evaluateNight(shower, latDeg, lonDeg, now = new Date(), hours = 24, stepMinutes = 10) {
  const stepMs = stepMinutes * 60000;
  const steps = Math.round((hours * 60) / stepMinutes);
  const moon = moonPhase(now);
  const windows = [];
  const samples = [];
  let open = null;
  let best = null;

  for (let i = 0; i <= steps; i++) {
    const time = new Date(now.getTime() + i * stepMs);
    const darkness = darknessFactor(sunAltitude(time, latDeg, lonDeg));
    const glow = moonGlow(moon.illumination, moonAltitude(time, latDeg, lonDeg));
    const radiantAlt = altitude(shower.ra, shower.dec, time, latDeg, lonDeg);
    const { activity } = activityFor(shower, time);
    const rate = expectedRate(shower.zhr, activity, radiantAlt, glow, darkness);
    const usable = darkness > 0 && radiantAlt >= 15;

    const sample = { time, rate, radiantAlt, darkness, glow };
    samples.push(sample);
    if (!best || rate > best.rate) best = sample;

    if (usable) {
      if (!open) open = { start: time, end: time, peak: sample };
      else {
        open.end = time;
        if (rate > open.peak.rate) open.peak = sample;
      }
    } else if (open) {
      windows.push(open);
      open = null;
    }
  }
  if (open) windows.push(open);

  const bestWindow = windows.length
    ? windows.find((w) => w.start <= best.time && best.time <= w.end) ||
      windows.reduce((a, b) => (b.peak.rate > a.peak.rate ? b : a))
    : null;

  return { best, windows, bestWindow, moon, samples };
}
