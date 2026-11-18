/* What's Happening? - runtime: router, interactions, map, live data */
(function () {
  'use strict';
  var W = window.WH, V = window.WHV, V2 = window.WHV2, S = W.state;
  var main, modal, toasts, lastRoute = null;

  var CATROUTE = { comedy: 'comedy', concerts: 'music', sports: 'sports', outdoor: 'outdoor' };
  var COLLECTION = ['browse', 'near', 'online', 'comedy', 'concerts', 'sports', 'outdoor'];
  var ROUTES = ['discover', 'near', 'comedy', 'concerts', 'sports', 'outdoor', 'online', 'browse', 'calendar', 'watchlist', 'settings'];

  function freshFilters(cats) {
    return { cats: cats || [], date: 'any', from: '', to: '', price: 'any', presence: 'any', time: 'any', where: 'near' };
  }

  /* Defaults per section. Category pages browse the whole category (Ski & Outdoor
     events are mountain towns, so a 50-mile radius would empty the page); the
     Near me page stays radius-bound; Online starts on online-only. */
  function routeDefaults(name) {
    var f = freshFilters(CATROUTE[name] ? [CATROUTE[name]] : []);
    if (name === 'online') f.where = 'online';
    else if (CATROUTE[name]) f.where = 'anywhere';
    return f;
  }

  function renderFor(name) {
    switch (name) {
      case 'discover': return V.viewDiscover();
      case 'near': return V.viewNear();
      case 'comedy': return V.viewCategory('comedy');
      case 'concerts': return V.viewCategory('music');
      case 'sports': return V.viewCategory('sports');
      case 'outdoor': return V.viewCategory('outdoor');
      case 'online': return V.viewOnline();
      case 'browse': return V.viewBrowse();
      case 'calendar': return V2.viewCalendar();
      case 'watchlist': return V2.viewWatchlist();
      case 'settings': return V2.viewSettings();
      default: return V.viewDiscover();
    }
  }

  function markNav() {
    Array.prototype.forEach.call(document.querySelectorAll('.navitem'), function (a) {
      var href = a.getAttribute('href') || '';
      a.classList.toggle('is-active', href === '#/' + S.view);
      if (href === '#/' + S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#/' + S.view);
    });
  }

  function paint(scrollTop) {
    main.innerHTML = renderFor(S.view);
    markNav();
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'auto' });
    if (document.getElementById('map')) initMap();
    updateNotifDot();
  }

  function route(force) {
    var h = location.hash.slice(1);
    if (h.charAt(0) === '/') h = h.slice(1);
    var name = h || 'discover';
    if (ROUTES.indexOf(name) < 0) name = 'discover';
    var changed = name !== S.view || force;
    S.view = name;
    var entering = lastRoute !== name;
    if (entering) { S.filters = routeDefaults(name); S.mapMode = false; }
    lastRoute = name;
    paint(true);
    if (changed) main.focus({ preventScroll: true });
  }

  /* ---------------- modal ---------------- */
  function openModal(html) {
    modal.innerHTML = '<div class="modal__backdrop" data-action="close-modal"></div>' + html;
    modal.hidden = false;
    document.body.classList.add('is-locked');
    var f = modal.querySelector('button, a, input, select');
    if (f) f.focus({ preventScroll: true });
  }
  function closeModal() {
    modal.hidden = true;
    modal.innerHTML = '';
    document.body.classList.remove('is-locked');
  }

  function toast(msg) {
    var el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(function () { el.classList.add('is-out'); }, 2200);
    setTimeout(function () { el.remove(); }, 2700);
  }
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 3000);
  }

  /* ---------------- actions ---------------- */
  function toggleSave(id) {
    var i = S.saved.indexOf(id);
    if (i >= 0) { S.saved.splice(i, 1); toast('Removed from watchlist'); }
    else { S.saved.push(id); toast('Saved to watchlist'); }
    W.store.set('saved', S.saved);
    paint(false);
    refreshOpenEvent(id);
  }

  function toggleFollow(key) {
    var i = S.follows.indexOf(key);
    if (i >= 0) { S.follows.splice(i, 1); toast('Unfollowed'); }
    else { S.follows.push(key); toast('Following'); }
    W.store.set('follows', S.follows);
    if (!modal.hidden) closeModal();
    paint(false);
  }

  function refreshOpenEvent(id) {
    if (modal.hidden) return;
    var ev = W.byId(id);
    if (ev && modal.querySelector('.sheet')) openModal(V2.eventModal(ev));
  }

  function updateNotifDot() {
    var list = W.upcoming(W.allEvents(), 3);
    var dot = document.getElementById('notif-dot');
    if (dot) dot.hidden = list.length === 0;
  }

  function highlightCard(id) {
    S.highlight = id;
    paint(false);
    var el = main.querySelector('.card[data-id="' + id + '"]');
    if (el) { el.classList.add('is-hl'); el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  /* ---------------- map ---------------- */
  var leafletP = null, mapInstance = null;
  function loadLeaflet() {
    if (window.L) return Promise.resolve();
    if (leafletP) return leafletP;
    leafletP = new Promise(function (res, rej) {
      var css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
      var js = document.createElement('script');
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.onload = function () { res(); };
      js.onerror = function () { rej(new Error('leaflet')); };
      document.head.appendChild(js);
    });
    return leafletP;
  }

  function destroyMap() {
    if (!mapInstance) return;
    try { mapInstance.remove(); } catch (e) { /* already detached */ }
    mapInstance = null;
  }
  function initMap() {
    var el = document.getElementById('map');
    destroyMap();
    if (!el) return;
    var list = W.query(S.filters, S.q).filter(function (e) { return e.lat != null && e.lng != null; });
    if (S.view === 'online' && V.watchable) list = list.filter(V.watchable);
    loadLeaflet().then(function () {
      if (!document.body.contains(el)) return;
      var city = W.city();
      var map = L.map(el, { scrollWheelZoom: false }).setView([city.lat, city.lng], 9);
      mapInstance = map;
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);
      var layer = L.layerGroup().addTo(map);
      function draw() {
        layer.clearLayers();
        if (!list.length) return;
        var z = map.getZoom(), cell = 64, groups = {};
        list.forEach(function (ev) {
          var p = map.project([ev.lat, ev.lng], z);
          var k = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell);
          if (!groups[k]) groups[k] = [];
          groups[k].push(ev);
        });
        Object.keys(groups).forEach(function (k) {
          var g = groups[k], first = g[0], c = W.catOf(first.category);
          var color = 'hsl(' + c.hue + ' 72% 56%)';
          if (g.length === 1) {
            var m = L.circleMarker([first.lat, first.lng], { radius: 8, color: '#0b0d10', weight: 2, fillColor: color, fillOpacity: 1 }).addTo(layer);
            m.bindTooltip(W.esc(first.title), { direction: 'top' });
            m.on('click', function () { highlightCard(first.id); });
          } else {
            var lat = 0, lng = 0;
            g.forEach(function (x) { lat += x.lat; lng += x.lng; });
            lat /= g.length; lng /= g.length;
            var cm = L.marker([lat, lng], {
              icon: L.divIcon({ className: 'cluster', html: '<span>' + g.length + '</span>', iconSize: [36, 36] })
            }).addTo(layer);
            cm.on('click', function () { map.setView([lat, lng], Math.min(z + 2, 15)); });
          }
        });
      }
      draw();
      map.on('zoomend', draw);
      setTimeout(function () { map.invalidateSize(); }, 120);
    }).catch(function () {
      el.innerHTML = '<p class="maphint">The map library could not load (offline or blocked). The list below still works.</p>';
    });
  }

  /* ---------------- live providers ---------------- */
  function stampLocal(d) {
    return d.getFullYear() + '-' + W.pad(d.getMonth() + 1) + '-' + W.pad(d.getDate()) + 'T' + W.pad(d.getHours()) + ':' + W.pad(d.getMinutes());
  }

  /* The scheduled Action publishes data/live.json once a day. Everyone gets
     the real listings; pasted API keys only ever add fresher local data. */
  function loadLiveFile(cb) {
    fetch('data/live.json', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var list = (j && Array.isArray(j.events)) ? j.events : [];
      list.forEach(function (ev) {
        if (ev && ev.startUtc) ev.startLocal = stampLocal(new Date(ev.startUtc));
      });
      if (j && j.generatedAt) S.liveGeneratedAt = j.generatedAt;
      S.live = list;
      if (cb) cb();
    }).catch(function () {
      if (cb) cb();   // no published file yet (or offline): demo data stays
    });
  }

  /* ---------------- events ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
      if (!e.target || !e.target.closest) return;
      var t = e.target.closest('[data-action]');
      if (!t) return;
      var a = t.getAttribute('data-action');
      var id = t.getAttribute('data-id');
      var val = t.getAttribute('data-val');
      switch (a) {
        case 'open': {
          var ev = W.byId(id);
          if (!ev) return;
          S.viewed[id] = (S.viewed[id] || 0) + 1;
          W.store.set('viewed', S.viewed);
          openModal(V2.eventModal(ev));
          break;
        }
        case 'person': openModal(V2.personModal(id)); break;
        case 'save': e.stopPropagation(); toggleSave(id); break;
        case 'follow': toggleFollow(t.getAttribute('data-key')); break;
        case 'close-modal': closeModal(); break;
        case 'notifications': openModal(V2.notifications()); break;
        case 'filter': {
          var g = t.getAttribute('data-group');
          if (g === 'cats') {
            var i = S.filters.cats.indexOf(val);
            if (i >= 0) S.filters.cats.splice(i, 1); else S.filters.cats.push(val);
          } else { S.filters[g] = val; }
          paint(false);
          break;
        }
        case 'resetfilters': S.filters = routeDefaults(S.view); paint(false); break;
        case 'radius': S.radius = +val; W.store.set('radius', S.radius); paint(false); break;
        case 'maptoggle': S.mapMode = val === 'map'; paint(false); break;
        case 'cal-prev': case 'cal-next': {
          var step = a === 'cal-next' ? 1 : -1;
          var d = new Date(S.calCursor);
          if (S.calMode === 'month') d.setMonth(d.getMonth() + step);
          else if (S.calMode === 'week') d = W.addDays(d, 7 * step);
          else d = W.addDays(d, step);
          S.calCursor = d; paint(false); break;
        }
        case 'cal-today': S.calCursor = W.startOfDay(new Date()); paint(false); break;
        case 'cal-mode': S.calMode = val; paint(false); break;
        case 'cal-day': S.calCursor = W.parseLocal(val + 'T00:00'); S.calMode = 'day'; paint(false); break;
        case 'ics-one': {
          var ev2 = W.byId(id);
          if (ev2) { download('event-' + ev2.id + '.ics', W.icsFor([ev2])); toast('Calendar file downloaded'); }
          break;
        }
        case 'ics-saved': {
          var saved = W.upcoming(S.saved.map(W.byId).filter(Boolean), 400);
          if (saved.length) { download('whats-happening-watchlist.ics', W.icsFor(saved)); toast(saved.length + ' events exported'); }
          break;
        }
        case 'enable-push': requestPush(t); break;
        case 'geolocate': geolocate(); break;
        case 'clear-data':
          S.saved = []; S.follows = []; S.viewed = {};
          W.store.set('saved', []); W.store.set('follows', []); W.store.set('viewed', {});
          toast('Saved events and follows cleared');
          paint(false);
          break;
        case 'onboarding': openModal(V2.onboarding()); break;
        case 'ob-finish': finishOnboarding(); break;
        case 'ob-skip': S.onboarded = true; W.store.set('onboarded', true); closeModal(); break;
        case 'open-nav': document.body.classList.add('nav-open'); break;
        case 'close-nav': document.body.classList.remove('nav-open'); break;
      }
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      var action = t.getAttribute('data-action');
      if (t.id === 'sort') { S.sort = t.value; paint(false); }
      else if (t.id === 'set-city') { S.city = t.value; W.store.set('city', S.city); fillTopbar(); paint(false); }
      else if (t.id === 'set-radius') { S.radius = +t.value; W.store.set('radius', S.radius); paint(false); }
      else if (t.id === 'f-from') { S.filters.from = t.value; paint(false); }
      else if (t.id === 'f-to') { S.filters.to = t.value; paint(false); }
      else if (action === 'interest') {
        var i = S.interests.indexOf(t.value);
        if (t.checked && i < 0) S.interests.push(t.value);
        if (!t.checked && i >= 0) S.interests.splice(i, 1);
        W.store.set('interests', S.interests);
      } else if (action === 'notif') {
        S.notifPrefs[t.value] = t.checked;
        W.store.set('notifPrefs', S.notifPrefs);
      } else if (action === 'online-interest') {
        S.onlineInterest = t.checked;
        W.store.set('online', S.onlineInterest);
      }
    });

    var q = document.getElementById('q');
    var timer;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      var v = q.value.trim();
      timer = setTimeout(function () {
        S.q = v;
        if (COLLECTION.indexOf(S.view) >= 0) paint(false);
      }, 220);
    });

    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      S.q = q.value.trim();
      S.browseTitle = S.q ? 'Results for ' + S.q : 'All events';
      if (location.hash === '#/browse') paint(true);
      else location.hash = '#/browse';
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.hidden) closeModal();
    });
    window.addEventListener('hashchange', function () { route(false); });
  }

  function finishOnboarding() {
    var c = document.getElementById('ob-city');
    var r = document.getElementById('ob-radius');
    var o = document.getElementById('ob-online');
    var cats = Array.prototype.slice.call(document.querySelectorAll('.ob-cat:checked')).map(function (x) { return x.value; });
    if (c) { S.city = c.value; W.store.set('city', S.city); }
    if (r) { S.radius = +r.value; W.store.set('radius', S.radius); }
    if (o) { S.onlineInterest = o.checked; W.store.set('online', S.onlineInterest); }
    S.interests = cats.length ? cats : S.interests;
    W.store.set('interests', S.interests);
    S.onboarded = true;
    W.store.set('onboarded', true);
    closeModal();
    fillTopbar();
    paint(true);
  }

  function requestPush(btn) {
    var hint = document.getElementById('push-hint');
    if (!('Notification' in window)) { if (hint) hint.textContent = 'This browser does not support notifications.'; return; }
    Notification.requestPermission().then(function (p) {
      if (p === 'granted') {
        new Notification('What\u2019s Happening?', { body: 'Notifications enabled. You will hear about events you saved and things starting soon.' });
        if (btn) btn.textContent = 'Notifications enabled';
        if (hint) hint.textContent = 'Enabled for this browser.';
      } else if (hint) hint.textContent = 'Permission was not granted, so nothing will be sent.';
    });
  }

  function geolocate() {
    if (!navigator.geolocation) { toast('Location is not available in this browser'); return; }
    toast('Checking your location');
    navigator.geolocation.getCurrentPosition(function (pos) {
      var best = null, bestD = 1e9;
      W.CITIES.forEach(function (c) {
        var dLat = (pos.coords.latitude - c.lat) * Math.PI / 180, dLng = (pos.coords.longitude - c.lng) * Math.PI / 180;
        var d = Math.sqrt(dLat * dLat + dLng * dLng);
        if (d < bestD) { bestD = d; best = c; }
      });
      if (best) {
        S.city = best.id; W.store.set('city', S.city);
        fillTopbar(); paint(false);
        toast('Using ' + best.label);
      }
    }, function () { toast('Could not read your location'); }, { timeout: 8000 });
  }

  function fillTopbar() {
    var now = new Date();
    var el = document.getElementById('tb-date');
    if (el) el.textContent = W.DAYS_LONG[now.getDay()] + ', ' + W.MONTHS[now.getMonth()] + ' ' + now.getDate();
    var c = document.getElementById('tb-city');
    if (c) c.textContent = W.city().label;
  }

  function boot() {
    main = document.getElementById('main');
    modal = document.getElementById('modal');
    toasts = document.getElementById('toasts');
    Array.prototype.forEach.call(document.querySelectorAll('[data-icon]'), function (el) {
      el.innerHTML = W.icon(el.getAttribute('data-icon'));
    });
    fillTopbar();
    bind();
    route(true);
    if (!S.onboarded) openModal(V2.onboarding());
    loadLiveFile(function () { paint(false); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
