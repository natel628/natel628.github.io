// weather.js — cloud cover from Open-Meteo (free, no key, CORS enabled).
//
// Everything here can fail: the page treats a missing forecast as "unknown
// sky" and keeps working with the astronomy-only numbers.

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const CACHE_MS = 30 * 60 * 1000;

let cache = null;

// Open-Meteo returns "2026-11-16T00:00" for timezone=UTC.
function parseStamp(stamp) {
  if (stamp.length === 16) return new Date(`${stamp}:00Z`);
  return new Date(stamp);
}

export async function cloudCover(lat, lon) {
  const fresh = cache
    && Math.abs(cache.lat - lat) < 0.05
    && Math.abs(cache.lon - lon) < 0.05
    && Date.now() - cache.at < CACHE_MS;
  if (fresh) return cache.points;

  const url = `${ENDPOINT}?latitude=${lat.toFixed(3)}&longitude=${lon.toFixed(3)}`
    + '&hourly=cloud_cover&forecast_days=2&timezone=UTC';

  const response = await fetch(url);
  if (!response.ok) throw new Error(`cloud forecast failed: ${response.status}`);

  const data = await response.json();
  const stamps = data?.hourly?.time ?? [];
  const covers = data?.hourly?.cloud_cover ?? [];
  if (!stamps.length) throw new Error('cloud forecast was empty');

  const points = stamps.map((stamp, index) => ({
    time: parseStamp(stamp),
    cloud: Number(covers[index] ?? 0)
  }));

  cache = { lat, lon, points, at: Date.now() };
  return points;
}

// Fraction of the sky that is clear at `date`, 0–1, or null if the nearest
// forecast hour is too far away to be meaningful.
export function clearAt(points, date) {
  if (!points || !points.length) return null;

  const target = date.getTime();
  let nearest = points[0];
  let best = Infinity;

  for (const point of points) {
    const delta = Math.abs(point.time.getTime() - target);
    if (delta < best) {
      best = delta;
      nearest = point;
    }
  }
  if (best > 3 * 60 * 60 * 1000) return null;

  return Math.min(1, Math.max(0, 1 - nearest.cloud / 100));
}
