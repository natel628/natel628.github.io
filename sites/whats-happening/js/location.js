/* What's Happening? - location lookup.

   The visitor types where they are - "Greenville, SC", "Asheville", a ZIP or
   postcode, or coordinates - and this resolves it to a lat/lng that behaves
   exactly like the built-in cities: distance, the map centre, the radius chips
   and every filter keep working.

   Two keyless geocoders, in order, so one outage or block is not the end:
     1. Open-Meteo geocoding (fast, good with "Town, Region" and "Town, Country")
     2. OpenStreetMap Nominatim (better with bare ZIP/postcodes and addresses)
   Coordinates typed directly are used as-is and never hit the network.

   The choice is stored in localStorage and re-registered on the next load, so
   the site reopens in the same place. If both lookups are unreachable the
   current place is left alone and the hint says what happened. */
(function () {
  'use strict';

  var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var NOMINATIM = 'https://nominatim.openstreetmap.org/search';
  var lastCity = null;

  function W() { return window.WH; }
  function isCustom(id) { return typeof id === 'string' && id.indexOf('loc-') === 0; }

  function addPlace(p) {
    var list = W().CITIES;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === p.id) {
        list[i].label = p.label;
        list[i].lat = p.lat;
        list[i].lng = p.lng;
        return p;
      }
    }
    list.push(p);
    return p;
  }

  function labelFor(r) {
    var bits = [r.name];
    if (r.admin1 && r.admin1 !== r.name) bits.push(r.admin1);
    else if (r.country) bits.push(r.country);
    return bits.join(', ');
  }

  function placeFrom(r) {
    var lat = +r.latitude, lng = +r.longitude;
    return {
      id: 'loc-' + lat.toFixed(2) + ',' + lng.toFixed(2),
      label: labelFor(r),
      lat: lat,
      lng: lng,
      tz: r.timezone || ''
    };
  }

  /* Nominatim returns display_name and an address breakdown; prefer the same
     "Town, State" shape the rest of the UI uses. */
  function placeFromNominatim(r) {
    var lat = +r.lat, lng = +r.lon;
    var a = r.address || {};
    var town = a.city || a.town || a.village || a.hamlet || a.municipality || a.county || '';
    var region = a.state || a.region || a.country || '';
    var label = [town, region].filter(Boolean).join(', ');
    if (!label) {
      label = String(r.display_name || '').split(',').slice(0, 2).join(',').trim();
    }
    return {
      id: 'loc-' + lat.toFixed(2) + ',' + lng.toFixed(2),
      label: label || 'Your place',
      lat: lat,
      lng: lng,
      tz: ''
    };
  }

  /* "34.85,-82.39" - no lookup needed, and handy when geocoders are blocked. */
  function fromCoords(q) {
    var m = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(q);
    if (!m) return null;
    var lat = +m[1], lng = +m[2];
    if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return {
      id: 'loc-' + lat.toFixed(2) + ',' + lng.toFixed(2),
      label: lat.toFixed(2) + ', ' + lng.toFixed(2),
      lat: lat,
      lng: lng,
      tz: ''
    };
  }

  function restore() {
    var saved = W().store.get('customCity', null);
    if (saved && saved.id && isFinite(saved.lat) && isFinite(saved.lng)) {
      addPlace(saved);
      lastCity = saved.id;
    } else {
      lastCity = W().state.city;
    }
  }

  function apply(p) {
    addPlace(p);
    W().state.city = p.id;
    W().store.set('city', p.id);
    W().store.set('customCity', p);
    lastCity = p.id;
  }

  function repaint() {
    var ev;
    try { ev = new Event('hashchange'); }
    catch (e) { ev = document.createEvent('Event'); ev.initEvent('hashchange', false, false); }
    window.dispatchEvent(ev);
  }

  function setHint(el, msg) { if (el) el.textContent = msg || ''; }

  function syncSelects(id, label) {
    var list = document.querySelectorAll('select[data-city]');
    Array.prototype.forEach.call(list, function (s) {
      var found = false;
      Array.prototype.forEach.call(s.options, function (o) {
        if (o.value === id) found = true;
      });
      if (!found) {
        var o = document.createElement('option');
        o.value = id;
        o.textContent = label;
        s.appendChild(o);
      }
      s.value = id;
    });
  }

  function getJSON(url, ms) {
    if (typeof fetch !== 'function') return Promise.reject(new Error('no fetch'));
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, ms) : null;
    return fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw e;
    });
  }

  function geocodeOpenMeteo(q) {
    return getJSON(GEO + '?name=' + encodeURIComponent(q) + '&count=1&language=en&format=json', 7000).then(function (j) {
      var r = j && j.results && j.results[0];
      if (!r) throw new Error('no match');
      return placeFrom(r);
    });
  }

  function geocodeNominatim(q) {
    var url = NOMINATIM + '?format=jsonv2&limit=1&addressdetails=1&q=' + encodeURIComponent(q);
    return getJSON(url, 9000).then(function (j) {
      var r = j && j[0];
      if (!r) throw new Error('no match');
      var lat = +r.lat, lng = +r.lon;
      if (!isFinite(lat) || !isFinite(lng)) throw new Error('no match');
      return placeFromNominatim(r);
    });
  }

  /* cb(err, place). err.network is set when no service answered at all, so the
     caller can distinguish "nothing matched that" from "the lookup is down". */
  function lookup(q, cb) {
    var direct = fromCoords(q);
    if (direct) { cb(null, direct); return; }
    var reached = false;
    function attempt(fn) {
      return fn(q).then(function (p) {
        reached = true;
        return p;
      });
    }
    attempt(geocodeOpenMeteo).catch(function () {
      reached = true;   // it answered, it just had no match or was blocked mid-flight
      return attempt(geocodeNominatim);
    }).catch(function (e) {
      if (!reached) {
        var err = new Error('Place lookup is unavailable right now. Check your connection and try again, or type coordinates like 34.85,-82.39.');
        err.network = true;
        cb(err);
        return;
      }
      cb(new Error('Nothing matched that. Try "City, ST", a ZIP code, or a nearby larger town.'));
    }).then(function (p) {
      if (p) cb(null, p);
    });
  }

  function submit(box, btn) {
    var input = box.querySelector('.cityq') || box.querySelector('input');
    var hint = box.querySelector('.city-hint');
    var q = (input && input.value || '').trim();
    if (!q) {
      setHint(hint, 'Type a city, state or ZIP code first.');
      if (input) input.focus();
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Looking up\u2026'; }
    setHint(hint, '');
    lookup(q, function (err, p) {
      if (btn) { btn.disabled = false; btn.textContent = 'Use this place'; }
      if (err) { setHint(hint, err.message); return; }
      apply(p);
      if (input) input.value = p.label;
      syncSelects(p.id, p.label);
      var tb = document.getElementById('tb-city');
      if (tb) tb.textContent = p.label;
      repaint();
      setHint(hint, 'Using ' + p.label + '.');
    });
  }

  /* Enter in the city field submits it, like the button. */
  document.addEventListener('keydown', function (e) {
    if (!e.target || !e.target.classList || !e.target.classList.contains('cityq')) return;
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var box = e.target.closest ? e.target.closest('[data-citybox]') : null;
    if (box) submit(box, box.querySelector('[data-action="save-city"]'));
  });

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var btn = e.target.closest('[data-action="save-city"]');
    if (!btn) return;
    var box = btn.closest('[data-citybox]');
    if (box) submit(box, btn);
  });

  function boot() {
    restore();
    var hint = document.querySelector('.city-hint');
    if (hint) {
      var c = W().city();
      hint.textContent = isCustom(c.id) ? 'Using ' + c.label + '.' : '';
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.WHLOC = {
    lookup: function (q, cb) { lookup(q, cb); },
    current: function () { return W().city(); }
  };
})();
