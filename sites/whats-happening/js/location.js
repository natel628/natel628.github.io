/* What's Happening? - "somewhere else" location.

   The built-in list is only ten cities, which is useless if you live
   anywhere else. This looks a typed town up with the Open-Meteo geocoding API
   (free, no key, no attribution requirement) and registers the result as a
   normal entry in W.CITIES, so distance, the map centre, the radius chips and
   every filter keep working exactly as before.

   The choice is stored in localStorage and re-registered on the next load, so
   the site reopens in the same place. If the lookup fails, nothing changes and
   the message says so - the ten built-in cities still work.

   Onboarding finishes on its own button, so a place typed in the "Where are
   you based?" box but never looked up used to be dropped: the sheet closed
   and app.js saved whatever the hidden <select> still held, i.e. the old
   place. That button is now intercepted here, the typed town resolved first,
   and only then is the click let through. */
(function () {
  'use strict';

  var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var lastCity = null;   // guards the placeholder <option> from breaking state
  var finishing = false; // one onboarding lookup at a time

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

  /* "Leeds, England" reads better than "Leeds, England, United Kingdom" and
     fits the topbar; the country is only used when there is no region. */
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

  /* Ask app.js to repaint without resetting filters or the current view. */
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
        s.insertBefore(o, s.lastElementChild);   // keep "Somewhere else" last
      }
      s.value = id;
    });
  }

  function lookup(q, cb) {
    if (typeof fetch !== 'function') { cb(new Error('This browser cannot look places up.')); return; }
    var url = GEO + '?name=' + encodeURIComponent(q) + '&count=1&language=en&format=json';
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctl ? setTimeout(function () { ctl.abort(); }, 8000) : null;
    fetch(url, ctl ? { signal: ctl.signal } : undefined).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      if (timer) clearTimeout(timer);
      var r = j && j.results && j.results[0];
      if (!r) { cb(new Error('Nothing matched that. Try a nearby larger town, or add the country.')); return; }
      cb(null, placeFrom(r));
    }).catch(function () {
      if (timer) clearTimeout(timer);
      cb(new Error('Place lookup is unavailable right now. You can still pick a city from the list.'));
    });
  }

  function submit(box, btn) {
    var input = box.querySelector('input');
    var hint = box.querySelector('.city-hint');
    var q = (input && input.value || '').trim();
    if (!q) {
      setHint(hint, 'Type a town or city first.');
      if (input) input.focus();
      return;
    }
    var label = btn ? (btn.getAttribute('data-label') || btn.textContent) : '';
    if (btn) { btn.setAttribute('data-label', label); btn.disabled = true; btn.textContent = 'Looking up\u2026'; }
    lookup(q, function (err, p) {
      if (btn) { btn.disabled = false; btn.textContent = label; }
      if (err) { setHint(hint, err.message); return; }
      apply(p);
      syncSelects(p.id, p.label);
      var tb = document.getElementById('tb-city');
      if (tb) tb.textContent = p.label;
      repaint();
      setHint(document.querySelector('.city-hint'), 'Using ' + p.label + '.');
    });
  }

  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var btn = e.target.closest('[data-action="save-city"]');
    if (!btn) return;
    var box = btn.closest('[data-citybox]');
    if (box) submit(box, btn);
  });

  /* ---- onboarding: keep a typed place that was never looked up ---- */

  function onboardingBox() {
    var sel = document.getElementById('ob-city');
    return sel && sel.closest ? sel.closest('[data-citybox]') : null;
  }
  /* cityField() renders a plain text input (.cityq). Looking only for
     input[type="search"] made this always return '', so the onboarding
     interception below never ran and a typed place was still dropped. */
  function typedText(box) {
    var input = box && box.querySelector('input.cityq, input[type="search"], input[type="text"]');
    return input ? input.value.trim() : '';
  }
  /* Already resolved, or the text is simply the place already selected? */
  function alreadyPlace(box, q) {
    var sel = box && box.querySelector('select[data-city]');
    if (!sel || sel.selectedIndex < 0) return false;
    var opt = sel.options[sel.selectedIndex];
    var text = opt ? String(opt.textContent || '').trim() : '';
    return text.toLowerCase() === q.toLowerCase();
  }

  /* Capture phase, so this runs before app.js's own click handler, which would
     otherwise read the untouched <select> and finish the setup on the old
     place. After a successful lookup the click is replayed and goes through
     untouched (the data-obcity stamp stops this handler looping). */
  document.addEventListener('click', function (e) {
    if (!e.target || !e.target.closest) return;
    var btn = e.target.closest('[data-action="ob-finish"]');
    if (!btn || finishing) return;
    var box = onboardingBox();
    var q = typedText(box);
    if (!q || alreadyPlace(box, q)) return;
    /* A lookup failed for this text and it was explained; let the second press
       finish with the place that is selected. */
    if (btn.getAttribute('data-obcity') === q) return;

    e.preventDefault();
    e.stopPropagation();
    finishing = true;
    var hint = box.querySelector('.city-hint');
    var html = btn.innerHTML;
    btn.disabled = true;
    btn.textContent = 'Looking up\u2026';
    lookup(q, function (err, p) {
      finishing = false;
      btn.disabled = false;
      btn.innerHTML = html;
      btn.setAttribute('data-obcity', q);
      if (err) {
        setHint(hint, err.message + ' Press Start exploring again to keep your current place.');
        return;
      }
      apply(p);
      syncSelects(p.id, p.label);
      var tb = document.getElementById('tb-city');
      if (tb) tb.textContent = p.label;
      setHint(hint, 'Using ' + p.label + '.');
      btn.click();   // now finishOnboarding() stores the looked-up place
    });
  }, true);

  document.addEventListener('change', function (e) {
    var s = e.target;
    if (!s || !s.getAttribute || s.getAttribute('data-city') !== '1') return;
    var box = s.closest('[data-citybox]');
    if (!box) return;
    var finder = box.querySelector('.cityfinder');
    if (finder) finder.hidden = s.value !== '__other';
    if (s.value === '__other') {
      var input = box.querySelector('input');
      if (input) setTimeout(function () { input.focus(); }, 0);
      setHint(box.querySelector('.city-hint'), '');
      /* app.js stores the raw select value on #set-city; put the previous
         place back so filters keep working while the user types. */
      var prev = lastCity;
      setTimeout(function () {
        if (prev && W().state.city === '__other') {
          W().state.city = prev;
          W().store.set('city', prev);
          repaint();
        }
      }, 0);
    }
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
