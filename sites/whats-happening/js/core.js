/* What's Happening? - core: icons, helpers, state, data access */
window.WH = (function () {
  'use strict';
  var D = window.WHATS;
  var CITIES = D.CITIES, CATS = D.CATEGORIES, PEOPLE = D.PEOPLE, CHANNELS = D.CHANNELS, DEMO = D.EVENTS;

  var PATHS = {
    compass: '<circle cx="12" cy="12" r="9"/><path d="M15.6 8.4l-2.2 5-3.9 2 2.1-5z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    mic: '<rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4"/>',
    music: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
    trophy: '<path d="M8 3h8v6a4 4 0 0 1-8 0zM8 5H5v2a3 3 0 0 0 3 3M16 5h3v2a3 3 0 0 1-3 3M12 13v4M8 21h8"/>',
    mountain: '<path d="M3 20l6.5-11 4 6.5 2.5-4L21 20z"/>',
    play: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/>',
    bookmark: '<path d="M6 3h12v18l-6-4.5L6 21z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9z"/><path d="M10.5 21a2 2 0 0 0 3 0"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    left: '<path d="M15 18l-6-6 6-6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    map: '<path d="M9 3L3 5v16l6-2 6 2 6-2V3l-6 2-6-2z"/><path d="M9 3v16M15 5v16"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    spark: '<path d="M12 2l2.2 6.4L21 11l-6.8 2.6L12 20l-2.2-6.4L3 11l6.8-2.6z"/>',
    download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    ticket: '<path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-6z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
  };
  function icon(name, cls) {
    return '<svg class="i ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (PATHS[name] || '') + '</svg>';
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseLocal(s) {
    if (!s) return new Date();
    var parts = String(s).split('T');
    var dmy = parts[0].split('-').map(Number);
    var hm = (parts[1] || '00:00').split(':').map(Number);
    return new Date(dmy[0], dmy[1] - 1, dmy[2], hm[0] || 0, hm[1] || 0, 0, 0);
  }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function sameDay(a, b) { return ymd(a) === ymd(b); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function fmtTime(d) { var h = d.getHours(), m = d.getMinutes(); var ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(m) + ' ' + ap; }
  function fmtDay(d) { return DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate(); }
  function fmtDayLong(d) { return DAYS_LONG[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function relDay(d) {
    var t = startOfDay(new Date()), x = startOfDay(d);
    var diff = Math.round((x - t) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff === -1) return 'Yesterday';
    if (diff > 1 && diff < 7) return DAYS_LONG[d.getDay()];
    return fmtDay(d);
  }

  var LS = 'wh.v1.';
  var store = {
    get: function (k, fb) { try { var v = localStorage.getItem(LS + k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set: function (k, v) { try { localStorage.setItem(LS + k, JSON.stringify(v)); } catch (e) {} }
  };

  var state = {
    view: 'discover',
    city: store.get('city', 'greenville-sc'),
    radius: store.get('radius', 50),
    interests: store.get('interests', ['comedy', 'music']),
    onlineInterest: store.get('online', true),
    presencePref: store.get('presencePref', 'any'),
    saved: store.get('saved', []),
    follows: store.get('follows', []),
    viewed: store.get('viewed', {}),
    keys: store.get('keys', { ticketmaster: '', youtube: '' }),
    notifPrefs: store.get('notifPrefs', { today: true, soon: true, watched: true, interests: true }),
    onboarded: store.get('onboarded', false),
    live: [],
    liveStatus: { tm: 'off', yt: 'off' },
    liveError: '',
    filters: { cats: [], date: 'any', from: '', to: '', price: 'any', presence: 'any', time: 'any', where: 'near' },
    sort: 'recommended',
    q: '',
    browseTitle: 'All events',
    mapMode: false,
    calCursor: startOfDay(new Date()),
    calMode: 'month',
    highlight: null,
    hiddenNoPrice: 0
  };

  function city() {
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i].id === state.city) return CITIES[i];
    return CITIES[0];
  }
  function catOf(id) {
    for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i];
    return { id: id, label: id, short: id, hue: 220, icon: 'spark' };
  }
  function personById(id) {
    for (var i = 0; i < PEOPLE.length; i++) if (PEOPLE[i].id === id) return PEOPLE[i];
    return null;
  }
  function channelById(id) {
    for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].id === id) return CHANNELS[i];
    return null;
  }

  /* Real listings only, once the feed has any. The invented set in data.js is
     the offline fallback: it is what you see before the first sync or when the
     feed cannot load, and it is never mixed in beside live events. */
  function allEvents() { return state.live.length ? state.live : DEMO; }
  function demoEvents() { return DEMO || []; }

  function byId(id) {
    var list = allEvents();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function distanceMi(ev) {
    if (ev.lat == null || ev.lng == null) return null;
    var c = city();
    var R = 3958.8, toRad = Math.PI / 180;
    var dLat = (ev.lat - c.lat) * toRad, dLng = (ev.lng - c.lng) * toRad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(c.lat * toRad) * Math.cos(ev.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return Math.round(2 * R * Math.asin(Math.sqrt(a)));
  }
  function eventCity(ev) {
    for (var i = 0; i < CITIES.length; i++) if (CITIES[i].id === ev.cityId) return CITIES[i];
    return null;
  }
  function endsAt(ev) { return new Date(parseLocal(ev.startLocal).getTime() + (ev.duration || 120) * 60000); }
  function liveState(ev) {
    if (ev.presence === 'in-person') return 'none';
    var now = new Date(), s = parseLocal(ev.startLocal), e = endsAt(ev);
    if (now >= s && now <= e) return 'live';
    if (now < s && (s - now) < 3 * 3600000) return 'soon';
    if (ev.premiere) return 'premiere';
    return 'scheduled';
  }

  function score(ev) {
    var reasons = [], s = 0;
    if (state.interests.indexOf(ev.category) >= 0) { s += 26; reasons.push('Matches your ' + catOf(ev.category).short.toLowerCase() + ' interest'); }
    var followed = false;
    ev.performers.forEach(function (p) {
      if (state.follows.indexOf('performer:' + p) >= 0) { followed = true; }
    });
    if (ev.channel && state.follows.indexOf('channel:' + ev.channel) >= 0) followed = true;
    if (followed) { s += 34; reasons.push('From someone you follow'); }
    var savedHit = state.saved.some(function (id) { var e = byId(id); return e && e.category === ev.category; });
    if (savedHit) { s += 10; reasons.push('Similar to events you saved'); }
    var dist = distanceMi(ev);
    if (dist != null) {
      var near = Math.max(0, 22 - dist / 6);
      s += near;
      if (dist <= 25) reasons.push(dist + ' mi away');
    }
    var d = parseLocal(ev.startLocal);
    var hours = (d - new Date()) / 3600000;
    if (hours >= 0 && hours < 30) { s += 16; reasons.push('Happening soon'); }
    else if (hours >= 0 && hours < 24 * 7) s += 8;
    s += (ev.popularity || 0) * 0.14;
    if (ev.popularity >= 85) reasons.push('Trending with other people');
    if (ev.presence === 'online' || ev.presence === 'both') { if (state.onlineInterest) { s += 6; reasons.push('You can watch from home'); } }
    if (state.viewed[ev.id]) s -= 4;
    return { score: s, reasons: reasons.slice(0, 2) };
  }

  function peopleNames(ev) {
    return ev.performers.map(function (id) { var p = personById(id); return p ? p.name : null; }).filter(Boolean);
  }

  function textMatch(ev, q) {
    var hay = [ev.title, ev.venue, ev.description, catOf(ev.category).label, ev.channel || ''].concat(peopleNames(ev), ev.tags, [(eventCity(ev) || {}).label || '']).join(' ').toLowerCase();
    return hay.indexOf(q.toLowerCase()) >= 0;
  }

  function dateOk(ev, f) {
    var d = parseLocal(ev.startLocal), now = new Date();
    var today = startOfDay(now);
    var dow = now.getDay();
    var untilFri = (5 - dow + 7) % 7;
    var fri = addDays(today, untilFri);
    switch (f.date) {
      case 'today': return sameDay(d, now);
      case 'tonight': return sameDay(d, now) && d.getHours() >= 17;
      case 'tomorrow': return sameDay(d, addDays(now, 1));
      case 'weekend': return startOfDay(d) >= fri && startOfDay(d) <= addDays(fri, 2);
      case '7': return startOfDay(d) >= today && startOfDay(d) < addDays(today, 7);
      case '30': return startOfDay(d) >= today && startOfDay(d) < addDays(today, 30);
      case 'custom': {
        if (f.from && startOfDay(d) < parseLocal(f.from + 'T00:00')) return false;
        if (f.to && startOfDay(d) > parseLocal(f.to + 'T00:00')) return false;
        return true;
      }
      default: return true;
    }
  }

  function priceOk(ev, f) {
    if (f.price === 'any') return true;
    var p = ev.price;
    if (!p) { state.hiddenNoPrice++; return false; }
    if (f.price === 'free') return p.min === 0;
    if (f.price === 'u25') return p.min < 25;
    if (f.price === '25-50') return p.min >= 25 && p.min <= 50;
    if (f.price === '50-100') return p.min > 50 && p.min <= 100;
    if (f.price === '100plus') return p.min > 100;
    return true;
  }

  function presenceOk(ev, f) {
    if (f.presence === 'any') return true;
    if (f.presence === 'online') return ev.presence === 'online' || ev.presence === 'both';
    if (f.presence === 'in-person') return ev.presence === 'in-person' || ev.presence === 'both';
    return ev.presence === f.presence;
  }

  function timeOk(ev, f) {
    if (f.time === 'any') return true;
    var h = parseLocal(ev.startLocal).getHours();
    if (f.time === 'morning') return h < 12;
    if (f.time === 'afternoon') return h >= 12 && h < 17;
    if (f.time === 'evening') return h >= 17 && h < 21;
    if (f.time === 'late') return h >= 21;
    return true;
  }

  function whereOk(ev, f) {
    if (f.where === 'online') return ev.presence === 'online' || ev.presence === 'both';
    if (f.where === 'anywhere') return true;
    var d = distanceMi(ev);
    return d != null && d <= state.radius;
  }

  function query(f, q) {
    state.hiddenNoPrice = 0;
    var list = allEvents().filter(function (ev) {
      if (f.cats.length && f.cats.indexOf(ev.category) < 0) return false;
      if (q && !textMatch(ev, q)) return false;
      if (!dateOk(ev, f)) return false;
      if (!presenceOk(ev, f)) return false;
      if (!timeOk(ev, f)) return false;
      if (!whereOk(ev, f)) return false;
      if (!priceOk(ev, f)) return false;
      return true;
    });
    return sortList(list, state.sort);
  }

  function sortList(list, mode) {
    var copy = list.slice();
    copy.sort(function (a, b) {
      if (mode === 'soonest') return parseLocal(a.startLocal) - parseLocal(b.startLocal);
      if (mode === 'closest') return (distanceMi(a) == null ? 1e9 : distanceMi(a)) - (distanceMi(b) == null ? 1e9 : distanceMi(b));
      if (mode === 'popular') return (b.popularity || 0) - (a.popularity || 0);
      if (mode === 'price') {
        var pa = a.price ? a.price.min : 1e9, pb = b.price ? b.price.min : 1e9;
        return pa - pb;
      }
      return score(b).score - score(a).score;
    });
    return copy;
  }

  function upcoming(list, days) {
    var now = new Date(), lim = addDays(startOfDay(now), days == null ? 3650 : days);
    return list.filter(function (ev) {
      var d = parseLocal(ev.startLocal);
      return endsAt(ev) >= now && startOfDay(d) <= lim;
    });
  }

  function priceLabel(ev) {
    if (!ev.price) return 'Price not published';
    if (ev.price.min === 0 && ev.price.max === 0) return 'Free';
    if (ev.price.min === ev.price.max) return '$' + ev.price.min;
    return '$' + ev.price.min + '-' + ev.price.max;
  }
  function presenceLabel(ev) {
    if (ev.presence === 'online') return 'Online only';
    if (ev.presence === 'both') return 'In person + online';
    return 'In person';
  }

  function icsFor(events) {
    function f(d) { return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'; }
    function t(s) { return String(s || '').replace(/[\\;,]/g, function (m) { return '\\' + m; }).replace(/\n/g, '\\n'); }
    var lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Whats Happening//EN', 'CALSCALE:GREGORIAN'];
    events.forEach(function (ev) {
      var s = parseLocal(ev.startLocal), e = endsAt(ev);
      lines.push('BEGIN:VEVENT');
      lines.push('UID:' + ev.id + '@whats-happening');
      lines.push('DTSTAMP:' + f(new Date()));
      lines.push('DTSTART:' + f(s));
      lines.push('DTEND:' + f(e));
      lines.push('SUMMARY:' + t(ev.title));
      lines.push('LOCATION:' + t(ev.presence === 'online' ? (ev.channel ? 'Online - ' + ev.channel : 'Online') : ev.venue));
      lines.push('DESCRIPTION:' + t(ev.description));
      if (ev.officialUrl) lines.push('URL:' + ev.officialUrl);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  return {
    D: D, CITIES: CITIES, CATS: CATS, PEOPLE: PEOPLE, CHANNELS: CHANNELS,
    icon: icon, esc: esc, pad: pad, ymd: ymd, parseLocal: parseLocal, addDays: addDays,
    startOfDay: startOfDay, sameDay: sameDay, fmtTime: fmtTime, fmtDay: fmtDay, fmtDayLong: fmtDayLong, relDay: relDay,
    MONTHS: MONTHS, DAYS: DAYS, DAYS_LONG: DAYS_LONG,
    store: store, state: state, city: city, catOf: catOf, personById: personById, channelById: channelById,
    allEvents: allEvents, demoEvents: demoEvents, byId: byId, distanceMi: distanceMi, eventCity: eventCity, endsAt: endsAt, liveState: liveState,
    score: score, peopleNames: peopleNames, query: query, sortList: sortList, upcoming: upcoming,
    priceLabel: priceLabel, presenceLabel: presenceLabel, icsFor: icsFor
  };
})();
