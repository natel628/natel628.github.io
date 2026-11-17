/* What's Happening? - runtime: router, interactions, map, live data */
(function () {
  'use strict';
  var W = window.WH, V = window.WHV, V2 = window.WHV2, S = W.state;
  var main, modal, toasts, lastRoute = null;

  var CATROUTE = { comedy: 'comedy', concerts: 'music', sports: 'sports', outdoor: 'outdoor' };

  function freshFilters(cats) {
    return { cats: cats || [], date: 'any', from: '', to: '', price: 'any', presence: 'any', time: 'any', where: 'near' };
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
    if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' in document.body.style ? 'instant' : 'auto' });
    if (document.getElementById('map')) initMap();
    updateNotifDot();
  }

  function route(force) {
    var name = (location.hash || '#/discover').replace(/^#\/?/, '') || 'discover';
    if (!document.querySelector('.navitem[href="#/' + name + '"]') && name !== 'browse') name = 'discover';
    var changed = name !== S.view || force;
    S.view = name;
    if (CATROUTE[name]) {
      if (lastRoute !== name) S.filters = freshFilters([CATROUTE[name]]);
      S.mapMode = false;
    }
    if (name === 'online' && lastRoute !== name) S.filters = freshFilters([]);
    if (name === 'near' && lastRoute !== name) S.filters = freshFilters([]);
    lastRoute = name;
    paint(true);
    if (changed) document.getElementById('main').focus({ preventScroll: true });
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
    paint(false);
    if (!modal.hidden) closeModal();
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
  var leafletP = null;
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

  function initMap() {
    var el = document.getElementById('map');
    if (!el) return;
    var list = W.query(S.filters, S.q).filter(function (e) { return e.lat != null && e.lng != null; });
    loadLeaflet().then(function () {
      if (!document.body.contains(el)) return;
      var city = W.city();
      var map = L.map(el, { scrollWheelZoom: false }).setView([city.lat, city.lng], 9);
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

  function normalizeTM(item) {
    try {
      var v = (item._embedded && item._embedded.venues && item._embedded.venues[0]) || {};
      var loc = v.location || {};
      var start = item.dates && item.dates.start ? item.dates.start : {};
      if (!start.localDate) return null;
      var seg = ((item.classifications && item.classifications[0]) || {}).segment || {};
      var genre = ((item.classifications && item.classifications[0]) || {}).genre || {};
      var cat = 'music';
      var segName = (seg.name || '').toLowerCase();
      if (segName.indexOf('sport') >= 0) cat = 'sports';
      else if (segName.indexOf('arts') >= 0 || (genre.name || '').toLowerCase().indexOf('comedy') >= 0) cat = 'comedy';
      else if (segName.indexOf('misc') >= 0) cat = 'festival';
      var price = null;
      if (item.priceRanges && item.priceRanges[0]) {
        price = { min: Math.round(item.priceRanges[0].min), max: Math.round(item.priceRanges[0].max), currency: item.priceRanges[0].currency || 'USD', verified: true };
      }
      return {
        id: 'tm-' + item.id,
        source: 'ticketmaster',
        title: item.name,
        description: (item.info && item.info.note) || (item.pleaseNote ? item.pleaseNote.replace(/<[^>]*>/g, '') : 'Listed by Ticketmaster with no additional description.') ,
        category: cat,
        presence: 'in-person',
        startLocal: start.localDate + 'T' + (start.localTime ? start.localTime.slice(0, 5) : '19:00'),
        duration: 150,
        venue: v.name || 'Venue not listed',
        cityId: '',
        lat: loc.latitude ? +loc.latitude : null,
        lng: loc.longitude ? +loc.longitude : null,
        popularity: 70,
        performers: [],
        tags: [(genre.name || '').toLowerCase()].filter(Boolean),
        price: price,
        ticketUrl: item.url || null,
        streamUrl: null,
        officialUrl: item.url || null,
        broadcast: null,
        channel: null,
        resort: null,
        premiere: false,
        timezone: (item.dates && item.dates.timezone) || '',
        venueCity: (v.city && v.city.name) || '',
        lastUpdated: new Date().toISOString()
      };
    } catch (e) { return null; }
  }

  function loadTicketmaster(cb) {
    if (!S.keys.ticketmaster) { S.liveStatus.tm = 'no key'; return cb && cb(); }
    var cached = W.store.get('tmCache', null);
    if (cached && Date.now() - cached.at < 600000) {
      mergeLive('ticketmaster', cached.events);
      S.liveStatus.tm = 'cached - ' + cached.events.length + ' events';
      return cb && cb();
    }
    S.liveStatus.tm = 'loading';
    var c = W.city();
    var url = 'https://app.ticketmaster.com/discovery/v2/events.json?apikey=' + encodeURIComponent(S.keys.ticketmaster) +
      '&latlong=' + c.lat + ',' + c.lng + '&radius=' + S.radius + '&unit=miles&size=40&sort=date,asc';
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var items = (j._embedded && j._embedded.events) || [];
      var events = items.map(normalizeTM).filter(Boolean);
      mergeLive('ticketmaster', events);
      W.store.set('tmCache', { at: Date.now(), events: events });
      S.liveStatus.tm = events.length + ' live events';
      S.liveError = '';
      if (cb) cb();
    }).catch(function (e) {
      S.liveStatus.tm = 'error';
      S.liveError = 'Ticketmaster: ' + (e.message === 'http 401' ? 'key rejected' : 'request failed');
      if (cb) cb();
    });
  }

  function normalizeYT(v) {
    var sn = v.snippet || {}, ld = v.liveStreamingDetails || {};
    if (!ld.scheduledStartTime && !ld.actualStartTime) return null;
    var when = ld.actualStartTime || ld.scheduledStartTime;
    var d = new Date(when);
    var live = sn.liveBroadcastContent === 'live';
    return {
      id: 'yt-' + v.id,
      source: 'youtube',
      title: sn.title,
      description: sn.description ? sn.description.slice(0, 220) : 'Scheduled on YouTube by ' + sn.channelTitle + '.',
      category: /comedy|stand-?up|podcast/i.test(sn.title) ? 'comedy' : 'online',
      presence: 'online',
      startLocal: stampLocal(d),
      duration: live ? 120 : 90,
      liveNow: live,
      venue: sn.channelTitle,
      cityId: '', lat: null, lng: null,
      popularity: 60,
      performers: [],
      tags: ['youtube', 'livestream'],
      price: { min: 0, max: 0, currency: 'USD', verified: true },
      ticketUrl: null,
      streamUrl: 'https://www.youtube.com/watch?v=' + v.id,
      officialUrl: 'https://www.youtube.com/watch?v=' + v.id,
      broadcast: null,
      channel: 'yt:' + sn.channelId,
      resort: null,
      premiere: false,
      channelName: sn.channelTitle,
      lastUpdated: new Date().toISOString()
    };
  }

  function loadYouTube(cb) {
    if (!S.keys.youtube) { S.liveStatus.yt = 'no key'; return cb && cb(); }
    var cached = W.store.get('ytCache', null);
    if (cached && Date.now() - cached.at < 1800000) {
      mergeLive('youtube', cached.events);
      S.liveStatus.yt = 'cached - ' + cached.events.length + ' streams';
      return cb && cb();
    }
    S.liveStatus.yt = 'loading';
    var key = encodeURIComponent(S.keys.youtube);
    var search = 'https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&eventType=upcoming&maxResults=10&order=date&q=live%20comedy%20podcast&key=' + key;
    fetch(search).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
      .then(function (j) {
        var ids = (j.items || []).map(function (i) { return i.id && i.id.videoId; }).filter(Boolean).slice(0, 10);
        if (!ids.length) { S.liveStatus.yt = 'no upcoming streams'; if (cb) cb(); return; }
        return fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=' + ids.join(',') + '&key=' + key)
          .then(function (r) { return r.json(); })
          .then(function (v) {
            var events = (v.items || []).map(normalizeYT).filter(Boolean);
            mergeLive('youtube', events);
            W.store.set('ytCache', { at: Date.now(), events: events });
            S.liveStatus.yt = events.length + ' streams';
            S.liveError = '';
            if (cb) cb();
          });
      }).catch(function (e) {
        S.liveStatus.yt = 'error';
        S.liveError = 'YouTube: ' + (e.message === 'http 403' ? 'quota or key rejected' : 'request failed');
        if (cb) cb();
      });
  }

  function mergeLive(source, events) {
    S.live = S.live.filter(function (e) { return e.source !== source; }).concat(events);
  }

  /* ---------------- events ---------------- */
  function bind() {
    document.addEventListener('click', function (e) {
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
        case 'resetfilters': S.filters = freshFilters(CATROUTE[S.view] ? [CATROUTE[S.view]] : []); paint(false); break;
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
        case 'save-keys': saveKeys(); break;
        case 'clear-keys': S.keys = { ticketmaster: '', youtube: '' }; W.store.set('keys', S.keys); S.live = []; S.liveStatus = { tm: 'off', yt: 'off' }; toast('Keys removed'); paint(false); break;
        case 'clear-data': S.saved = []; S.follows = []; W.store.set('saved', []); W.store.set('follows', []); toast('Saved events and follows cleared'); paint(false); break;
        case 'onboarding': openModal(V2.onboarding()); break;
        case 'ob-finish': finishOnboarding(); break;
        case 'ob-skip': S.onboarded = true; W.store.set('onboarded', true); closeModal(); break;
        case 'open-nav': document.body.classList.add('nav-open'); break;
        case 'close-nav': document.body.classList.remove('nav-open'); break;
      }
    });

    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.id === 'sort') { S.sort = t.value; paint(false); }
      else if (t.id === 'set-city') { S.city = t.value; W.store.set('city', S.city); fillTopbar(); paint(false); }
      else if (t.id === 'set-radius') { S.radius = +t.value; W.store.set('radius', S.radius); paint(false); }
      else if (t.id === 'f-from') { S.filters.from = t.value; paint(false); }
      else if (t.id === 'f-to') { S.filters.to = t.value; paint(false); }
      else if (t.getAttribute('data-action') === 'interest') {
        var v = t.value, i = S.interests.indexOf(v);
        if (t.checked && i < 0) S.interests.push(v);
        if (!t.checked && i >= 0) S.interests.splice(i, 1);
        W.store.set('interests', S.interests);
      } else if (t.getAttribute('data-action') === 'notif') {
        S.notifPrefs[t.value] = t.checked; W.store.set('notifPrefs', S.notifPrefs);
      } else if (t.getAttribute('data-action') === 'online-interest') {
        S.onlineInterest = t.checked; W.store.set('online', S.onlineInterest);
      }
    });

    var q = document.getElementById('q');
    var timer;
    q.addEventListener('input', function () {
      clearTimeout(timer);
      var v = q.value.trim();
      timer = setTimeout(function () {
        S.q = v;
        if (['browse', 'near', 'online', 'comedy', 'concerts', 'sports', 'outdoor'].indexOf(S.view) >= 0) {
          if (S.view !== 'browse' && v) { S.browseTitle = 'Results for ' + v; location.hash = '#/browse'; }
          else paint(false);
        }
      }, 220);
    });
    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      S.q = q.value.trim();
      S.browseTitle = S.q ? 'Results for ' + S.q : 'All events';
      location.hash = '#/browse';
      paint(true);
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

  function saveKeys() {
    var tm = document.getElementById('key-tm'), yt = document.getElementById('key-yt');
    S.keys = { ticketmaster: tm ? tm.value.trim() : '', youtube: yt ? yt.value.trim() : '' };
    W.store.set('keys', S.keys);
    W.store.set('tmCache', null);
    W.store.set('ytCache', null);
    S.live = [];
    toast('Keys saved in this browser');
    loadTicketmaster(function () { loadYouTube(function () { paint(false); }); });
    paint(false);
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
    var dot = document.getElementById('notif-dot');
    if (dot) dot.hidden = false;
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
    updateNotifDot();
    if (!S.onboarded) openModal(V2.onboarding());
    if (S.keys.ticketmaster || S.keys.youtube) {
      loadTicketmaster(function () { loadYouTube(function () { paint(false); }); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
