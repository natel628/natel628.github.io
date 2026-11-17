/* What's Happening? - live snow depth and forecast for outdoor and resort cards.

   Source: Open-Meteo (https://open-meteo.com), free, no API key, CC BY 4.0.
   One batched request covers every visible resort, results are cached in
   localStorage for 20 minutes, and every failure path is silent: a card that
   cannot get weather keeps a one-line note instead of an error or a gap.

   This file only decorates elements that views.js already rendered with a
   data-wx="lat,lng" attribute. It never blocks rendering and never throws. */
window.WHWX = (function () {
  'use strict';

  var TTL = 20 * 60 * 1000;   // Open-Meteo refreshes hourly; 20 minutes is plenty
  var STALE = 6 * 60 * 60 * 1000;  // older than this and we show cached data but refetch
  var TIMEOUT = 9000;
  var KEY = 'wxCache';

  var cache = load();
  var inflight = false;
  var failed = false;

  function load() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var c = raw ? JSON.parse(raw) : null;
      return c && c.byKey ? c : { at: 0, byKey: {} };
    } catch (e) { return { at: 0, byKey: {} }; }
  }
  function save() {
    try { window.localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) { /* private mode, no quota */ }
  }

  function keyFor(lat, lng) { return lat.toFixed(2) + ',' + lng.toFixed(2); }

  function readNode(node) {
    var raw = node.getAttribute('data-wx') || '';
    var bits = raw.split(',');
    var lat = parseFloat(bits[0]);
    var lng = parseFloat(bits[1]);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat: lat, lng: lng, key: keyFor(lat, lng) };
  }

  /* WMO weather interpretation codes, shortened. */
  var CODES = {
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Freezing fog',
    51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Freezing rain',
    71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm, hail', 99: 'Thunderstorm, hail'
  };

  function num(v, map) {
    if (v == null || !isFinite(v)) return null;
    return map ? map(+v) : +v;
  }

  function normalize(res) {
    var cur = (res && res.current) || {};
    var daily = (res && res.daily) || {};
    var fall = Array.isArray(daily.snowfall_sum) ? daily.snowfall_sum : [];
    var codes = Array.isArray(daily.weather_code) ? daily.weather_code : [];
    var forecastCm = 0;
    for (var i = 1; i < Math.min(fall.length, 4); i++) forecastCm += +fall[i] || 0;
    return {
      at: Date.now(),
      depthIn: num(cur.snow_depth, function (m) { return m * 39.3701; }),
      tempF: num(cur.temperature_2m, function (c) { return c * 9 / 5 + 32; }),
      code: cur.weather_code == null ? null : +cur.weather_code,
      forecastIn: fall.length > 1 ? (forecastCm > 0 ? forecastCm / 2.54 : 0) : null,
      nextCode: codes.length > 1 && codes[1] != null ? +codes[1] : null
    };
  }

  var COLS = ['#e8eaf0', '#9aa2ae', '#7d8590', '#6b7280'];

  function item(label, value, tone) {
    if (!value) return '';
    return '<span class="wx__item' + (tone ? ' wx__item--' + tone : '') + '"><span class="wx__k">' + label + '</span><b>' + value + '</b></span>';
  }

  function depthText(v) {
    if (v == null) return 'not reported';
    if (v <= 0.04) return '0 in';
    if (v < 1) return '&lt;1 in';
    return Math.round(v) + ' in';
  }
  function forecastText(v) {
    if (v == null) return 'n/a';
    if (v <= 0.04) return 'no snow';   // genuinely nothing forecast, not missing data
    if (v < 1) return 'trace';
    return '+' + Math.round(v) + ' in';
  }
  function tempText(v) { return v == null ? '' : Math.round(v) + '\u00b0F'; }
  function codeText(c) { return c != null && CODES[c] ? CODES[c] : ''; }

  function bodyHtml(rec) {
    var now = [tempText(rec.tempF), codeText(rec.code)].filter(Boolean).join(' \u00b7 ');
    var cold = rec.tempF != null && rec.tempF <= 32;
    return item('Snow depth', depthText(rec.depthIn), 'snow') +
      item('Next 3 days', forecastText(rec.forecastIn), rec.forecastIn > 0.04 ? 'snow' : '') +
      item('Now', now, cold ? 'snow' : 'warm');
  }

  function headHtml() {
    return '<span class="wx__head"><span class="wx__title">Conditions</span>' +
      '<a class="wx__src" href="https://open-meteo.com/" target="_blank" rel="noopener" data-action="wx-source" title="Weather data by Open-Meteo (CC BY 4.0)">Open-Meteo</a></span>';
  }

  function paint(node, p) {
    var rec = p ? cache.byKey[p.key] : null;
    var sig, html, cls;
    if (rec) {
      sig = 'ok:' + rec.at;
      html = headHtml() + '<span class="wx__body">' + bodyHtml(rec) + '</span>';
      cls = 'wx is-ok';
    } else if (failed) {
      sig = 'err';
      html = '<p class="wx__msg">Live snow and weather data is unavailable right now.</p>';
      cls = 'wx is-err';
    } else {
      sig = 'load';
      html = '<p class="wx__msg">Checking snow conditions\u2026</p>';
      cls = 'wx is-load';
    }
    if (node.getAttribute('data-wx-r') === sig) return;
    node.innerHTML = html;
    node.setAttribute('data-wx-r', sig);
    node.className = cls;
  }

  function scan() {
    var nodes = document.querySelectorAll('[data-wx]');
    if (!nodes.length) return;
    var pending = {};
    var any = false;
    Array.prototype.forEach.call(nodes, function (node) {
      var p = readNode(node);
      if (!p) { node.style.display = 'none'; return; }
      var rec = cache.byKey[p.key];
      if (!rec || Date.now() - rec.at > STALE) { pending[p.key] = p; any = true; }
      paint(node, p);
    });
    if (any && !inflight) fetchAll(pending);
  }

  function fetchAll(points) {
    var keys = Object.keys(points);
    if (!keys.length) return;
    if (typeof fetch !== 'function') { failed = true; repaint(); return; }
    inflight = true;
    var lat = keys.map(function (k) { return points[k].lat; }).join(',');
    var lng = keys.map(function (k) { return points[k].lng; }).join(',');
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng +
      '&current=temperature_2m,snow_depth,weather_code' +
      '&daily=snowfall_sum,weather_code' +
      '&forecast_days=4&timezone=auto';

    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, TIMEOUT) : null;

    fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var list = Array.isArray(j) ? j : [j];
      list.forEach(function (res, i) {
        var k = null;
        if (res && typeof res.latitude === 'number' && typeof res.longitude === 'number') {
          var rk = keyFor(res.latitude, res.longitude);
          if (points[rk]) k = rk;
        }
        if (!k) k = keys[i];
        if (k) cache.byKey[k] = normalize(res);
      });
      cache.at = Date.now();
      failed = false;
      save();
    }).catch(function () {
      failed = true;   // network, 4xx/5xx, timeout or bad JSON all land here
    }).then(function () {
      if (timer) clearTimeout(timer);
      inflight = false;
      repaint();
    });
  }

  /* Repaint without scheduling a new request loop. */
  function repaint() {
    var nodes = document.querySelectorAll('[data-wx]');
    Array.prototype.forEach.call(nodes, function (node) {
      var p = readNode(node);
      if (p) paint(node, p);
    });
  }

  function start() {
    scan();
    if (typeof MutationObserver !== 'function') return;
    var queued = false;
    var mo = new MutationObserver(function () {
      if (queued) return;
      queued = true;
      var run = function () { queued = false; scan(); };
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
      else setTimeout(run, 60);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return {
    refresh: function () { cache = { at: 0, byKey: {} }; save(); scan(); },
    status: function () { return failed ? 'unavailable' : (inflight ? 'loading' : 'ok'); }
  };
})();
