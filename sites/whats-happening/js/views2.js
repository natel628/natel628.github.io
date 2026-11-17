/* What's Happening? - calendar, watchlist, settings, modals */
window.WHV2 = (function () {
  'use strict';
  var W = window.WH, V = window.WHV, S = W.state;

  function channelName(ev) {
    if (!ev) return 'Online';
    var c = ev.channel ? W.channelById(ev.channel) : null;
    return (c && c.name) || ev.channelName || ev.venue || 'Online';
  }

  function groupByDay(list) {
    var map = {};
    list.forEach(function (e) {
      var k = W.ymd(W.parseLocal(e.startLocal));
      if (!map[k]) map[k] = [];
      map[k].push(e);
    });
    Object.keys(map).forEach(function (k) { map[k] = W.sortList(map[k], 'soonest'); });
    return map;
  }

  function calHead() {
    var cur = S.calCursor;
    var label = S.calMode === 'month' ? W.MONTHS[cur.getMonth()] + ' ' + cur.getFullYear()
      : S.calMode === 'week' ? 'Week of ' + W.fmtDay(W.addDays(cur, -cur.getDay()))
      : W.fmtDayLong(cur);
    return '<div class="calhead"><div class="calnav"><button class="iconbtn" data-action="cal-prev" aria-label="Previous">' + W.icon('left') + '</button>' +
      '<h2>' + W.esc(label) + '</h2>' +
      '<button class="iconbtn" data-action="cal-next" aria-label="Next">' + W.icon('right') + '</button>' +
      '<button class="chip" data-action="cal-today">Today</button></div>' +
      '<div class="seg">' + ['month', 'week', 'day'].map(function (m) {
        return '<button data-action="cal-mode" data-val="' + m + '" class="' + (S.calMode === m ? 'is-on' : '') + '">' + m.charAt(0).toUpperCase() + m.slice(1) + '</button>';
      }).join('') + '</div></div>';
  }

  function monthView(evs) {
    var cur = S.calCursor;
    var first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    var start = W.addDays(first, -first.getDay());
    var map = groupByDay(evs);
    var cells = '';
    for (var i = 0; i < 42; i++) {
      var day = W.addDays(start, i);
      var key = W.ymd(day);
      var items = map[key] || [];
      var other = day.getMonth() !== cur.getMonth();
      cells += '<div class="calcell' + (other ? ' is-out' : '') + (W.sameDay(day, new Date()) ? ' is-today' : '') + '">' +
        '<span class="calcell__n">' + day.getDate() + '</span>' +
        items.slice(0, 3).map(function (e) {
          var c = W.catOf(e.category);
          return '<button class="calitem" data-action="open" data-id="' + e.id + '" style="--h:' + c.hue + '"><span class="calitem__d"></span>' + W.esc(e.title) + '</button>';
        }).join('') +
        (items.length > 3 ? '<button class="calmore" data-action="cal-day" data-val="' + key + '">+' + (items.length - 3) + ' more</button>' : '') +
        '</div>';
    }
    return '<div class="calgrid">' + W.DAYS.map(function (d) { return '<div class="caldow">' + d + '</div>'; }).join('') + cells + '</div>';
  }

  function weekView(evs) {
    var start = W.addDays(S.calCursor, -S.calCursor.getDay());
    var map = groupByDay(evs);
    var cols = '';
    for (var i = 0; i < 7; i++) {
      var day = W.addDays(start, i);
      var items = map[W.ymd(day)] || [];
      cols += '<div class="weekcol' + (W.sameDay(day, new Date()) ? ' is-today' : '') + '"><p class="weekcol__h">' + W.DAYS[day.getDay()] + ' <span>' + day.getDate() + '</span></p>' +
        (items.length ? items.map(function (e) {
          var c = W.catOf(e.category);
          return '<button class="calitem" data-action="open" data-id="' + e.id + '" style="--h:' + c.hue + '"><span class="calitem__d"></span>' + W.esc(W.fmtTime(W.parseLocal(e.startLocal))) + ' ' + W.esc(e.title) + '</button>';
        }).join('') : '<p class="weekcol__empty">-</p>') +
        '</div>';
    }
    return '<div class="weekgrid">' + cols + '</div>';
  }

  function dayView(evs) {
    var items = groupByDay(evs)[W.ymd(S.calCursor)] || [];
    if (!items.length) return '<div class="empty"><h3>Nothing on this day</h3><p>Pick another day, or add events from Discover.</p></div>';
    return '<div class="daylist">' + items.map(function (e) { return V.card(e); }).join('') + '</div>';
  }

  function viewCalendar() {
    var evs = W.upcoming(W.allEvents(), 400);
    var body = S.calMode === 'month' ? monthView(evs) : S.calMode === 'week' ? weekView(evs) : dayView(evs);
    var saved = W.upcoming(S.saved.map(W.byId).filter(Boolean), 400);
    return '<div class="pagehead"><div><h1>Calendar</h1><p>Times are shown in your local time. Export any event, or everything you have saved, as a calendar file.</p></div>' +
      (saved.length ? '<button class="btn btn--ghost" data-action="ics-saved">' + W.icon('download') + 'Export ' + saved.length + ' saved</button>' : '') + '</div>' +
      calHead() + body +
      '<div class="legend">' + W.CATS.map(function (c) { return '<span class="legend__i"><span class="dotcat" style="--h:' + c.hue + '"></span>' + c.short + '</span>'; }).join('') + '</div>';
  }

  function followKey(key) {
    var parts = key.split(':'), type = parts[0], id = parts.slice(1).join(':');
    var name = id, sub = type;
    if (type === 'performer') { var p = W.personById(id); if (p) { name = p.name; sub = p.kind; } }
    else if (type === 'channel') { var c = W.channelById(id); if (c) name = c.name; }
    var related = W.upcoming(W.allEvents().filter(function (e) {
      if (type === 'performer') return e.performers.indexOf(id) >= 0;
      if (type === 'channel') return e.channel === id;
      if (type === 'venue') return e.venue === id;
      return false;
    }), 400);
    return { key: key, name: name, sub: sub, related: W.sortList(related, 'soonest') };
  }

  function viewWatchlist() {
    var savedEvs = S.saved.map(W.byId).filter(Boolean);
    var now = new Date();
    var upcoming = W.sortList(savedEvs.filter(function (e) { return W.endsAt(e) >= now; }), 'soonest');
    var past = W.sortList(savedEvs.filter(function (e) { return W.endsAt(e) < now; }), 'soonest');
    var follows = S.follows.map(followKey);

    var followBlock = follows.length ? '<div class="follows">' + follows.map(function (f) {
      return '<div class="fcard"><div class="fcard__h"><div><p class="fcard__type">' + W.esc(f.sub) + '</p><h3>' + W.esc(f.name) + '</h3></div>' +
        '<button class="iconbtn" data-action="follow" data-key="' + W.esc(f.key) + '" aria-label="Unfollow" title="Unfollow">' + W.icon('close') + '</button></div>' +
        (f.related.length
          ? '<p class="fcard__next">' + f.related.length + ' upcoming \u00b7 next ' + W.esc(W.relDay(W.parseLocal(f.related[0].startLocal))) + '</p><button class="linkbtn" data-action="open" data-id="' + f.related[0].id + '">' + W.esc(f.related[0].title) + '</button>'
          : '<p class="fcard__next">No upcoming dates found</p>') +
        '</div>';
    }).join('') + '</div>' : '<div class="empty"><h3>No follows yet</h3><p>Open any event and follow the performer, team or channel to build a personal feed.</p></div>';

    return '<div class="pagehead"><div><h1>My watchlist</h1><p>Saved events and the people, teams and channels you follow.</p></div>' +
      (upcoming.length ? '<button class="btn btn--ghost" data-action="ics-saved">' + W.icon('download') + 'Export calendar</button>' : '') + '</div>' +
      V.sectionHead('Saved events', upcoming.length + ' upcoming' + (past.length ? ' \u00b7 ' + past.length + ' past' : '')) +
      (upcoming.length
        ? '<div class="grid">' + upcoming.map(function (e) { return V.card(e); }).join('') + '</div>'
        : '<div class="empty"><h3>Your watchlist is empty</h3><p>Tap the bookmark on any event to keep it here.</p><a class="btn btn--ghost" href="#/discover">Discover events</a></div>') +
      V.sectionHead('Following', 'New dates from these appear across your feed') + followBlock +
      (past.length ? V.sectionHead('Past', 'Saved events that have finished') + '<div class="pastlist">' + past.map(function (e) {
        return '<button data-action="open" data-id="' + e.id + '" class="pastitem">' + W.esc(e.title) + ' <span>' + W.esc(W.relDay(W.parseLocal(e.startLocal))) + '</span></button>';
      }).join('') + '</div>' : '');
  }

  function viewSettings() {
    var c = W.city();
    var cities = W.CITIES.map(function (x) { return '<option value="' + x.id + '"' + (x.id === c.id ? ' selected' : '') + '>' + W.esc(x.label) + '</option>'; }).join('');
    var interests = W.CATS.map(function (k) {
      return '<label class="check"><input type="checkbox" data-action="interest" value="' + k.id + '"' + (S.interests.indexOf(k.id) >= 0 ? ' checked' : '') + '><span class="dotcat" style="--h:' + k.hue + '"></span>' + W.esc(k.short) + '</label>';
    }).join('');
    var notifs = [['today', 'Events happening today'], ['soon', 'Events starting soon'], ['watched', 'Saved events approaching'], ['interests', 'New events matching my interests']].map(function (n) {
      return '<label class="check"><input type="checkbox" data-action="notif" value="' + n[0] + '"' + (S.notifPrefs[n[0]] ? ' checked' : '') + '>' + W.esc(n[1]) + '</label>';
    }).join('');
    return '<div class="pagehead"><div><h1>Settings</h1><p>Everything here is stored only in this browser. Nothing is sent anywhere.</p></div></div>' +
      '<div class="settings">' +
      '<section class="panel"><h2>Location</h2><p class="panel__sub">Used for distance, the map and the featured event.</p>' +
      '<div class="field"><label for="set-city">City</label><select id="set-city">' + cities + '</select></div>' +
      '<div class="field"><label for="set-radius">Search radius</label><select id="set-radius">' + [10, 25, 50, 100, 250].map(function (r) { return '<option value="' + r + '"' + (S.radius === r ? ' selected' : '') + '>Within ' + r + ' miles</option>'; }).join('') + '</select></div>' +
      '<button class="btn btn--ghost" data-action="geolocate">' + W.icon('pin') + 'Use my current location</button>' +
      '<p class="hint">Location is only read when you press the button above.</p></section>' +
      '<section class="panel"><h2>Interests</h2><p class="panel__sub">Drives your featured and recommended events.</p><div class="checks">' + interests + '</div>' +
      '<label class="check check--wide"><input type="checkbox" data-action="online-interest"' + (S.onlineInterest ? ' checked' : '') + '>I am interested in online and livestream events</label></section>' +
      '<section class="panel"><h2>Notifications</h2><p class="panel__sub">Shown in the bell menu. Browser notifications are opt-in.</p><div class="checks">' + notifs + '</div>' +
      '<button class="btn btn--ghost" data-action="enable-push">' + W.icon('bell') + 'Enable browser notifications</button><p class="hint" id="push-hint"></p></section>' +
      '<section class="panel"><h2>Live data sources</h2><p class="panel__sub">Both are free. Keys never leave this browser and are sent only to the provider you are calling.</p>' +
      '<div class="field"><label for="key-tm">Ticketmaster Discovery API key</label><input id="key-tm" type="password" autocomplete="off" placeholder="Optional" value="' + W.esc(S.keys.ticketmaster) + '"></div>' +
      '<div class="field"><label for="key-yt">YouTube Data API v3 key</label><input id="key-yt" type="password" autocomplete="off" placeholder="Optional" value="' + W.esc(S.keys.youtube) + '"></div>' +
      '<div class="btnrow"><button class="btn btn--primary" data-action="save-keys">Save keys and refresh</button>' +
      (S.keys.ticketmaster || S.keys.youtube ? '<button class="btn btn--ghost" data-action="clear-keys">Remove keys</button>' : '') + '</div>' +
      '<p class="hint">Ticketmaster: free key, 5,000 calls/day, 5 req/sec. YouTube: 10,000 units/day with a separate 100/day search bucket. Results are cached for 10 minutes.</p>' +
      '<p class="hint">Status: Ticketmaster ' + W.esc(S.liveStatus.tm) + ' \u00b7 YouTube ' + W.esc(S.liveStatus.yt) + (S.liveError ? ' \u00b7 ' + W.esc(S.liveError) : '') + '</p></section>' +
      '<section class="panel"><h2>Your data</h2><p class="panel__sub">' + S.saved.length + ' saved events \u00b7 ' + S.follows.length + ' follows</p>' +
      '<div class="btnrow"><button class="btn btn--ghost" data-action="clear-data">Clear saved events and follows</button><button class="btn btn--ghost" data-action="onboarding">Re-run setup</button></div>' +
      '<p class="hint">Demonstration events are invented and labelled Demo. Nothing here claims a ticket link, a broadcast or a price that was not published by a source.</p></section>' +
      '</div>';
  }

  function eventModal(ev) {
    var c = W.catOf(ev.category);
    var d = W.parseLocal(ev.startLocal);
    var saved = S.saved.indexOf(ev.id) >= 0;
    var dist = W.distanceMi(ev);
    var city = W.eventCity(ev);
    var online = ev.presence === 'online';

    var actions = '';
    if (ev.ticketUrl) actions += '<a class="btn btn--primary" href="' + W.esc(ev.ticketUrl) + '" target="_blank" rel="noopener">' + W.icon('ticket') + 'Get tickets</a>';
    if (ev.streamUrl) actions += '<a class="btn btn--primary" href="' + W.esc(ev.streamUrl) + '" target="_blank" rel="noopener">' + W.icon('play') + 'Watch live</a>';
    if (ev.officialUrl) actions += '<a class="btn btn--ghost" href="' + W.esc(ev.officialUrl) + '" target="_blank" rel="noopener">' + W.icon('ext') + 'Official event page</a>';
    if (!actions) actions = '<p class="noactions">' + (ev.source === 'demo' ? 'This is a demonstration event, so there is no ticket or stream link to open.' : 'This listing did not publish a ticket or stream link.') + '</p>';

    var performers = ev.performers.map(function (pid) {
      var p = W.personById(pid);
      return p ? { id: pid, name: p.name } : null;
    }).filter(Boolean);

    return '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + W.esc(ev.title) + '">' +
      '<button class="sheet__x iconbtn" data-action="close-modal" aria-label="Close">' + W.icon('close') + '</button>' +
      '<div class="sheet__art art" style="--h:' + c.hue + '"><span class="art__glyph">' + W.icon(c.icon) + '</span><div class="art__tags">' + (ev.source === 'demo' ? '<span class="badge badge--demo">Demo</span>' : '') + V.badge(ev) + '</div></div>' +
      '<div class="sheet__body">' +
      '<p class="sheet__kicker"><span class="dotcat" style="--h:' + c.hue + '"></span>' + W.esc(c.label) + ' <span class="sep">\u00b7</span> ' + W.esc(W.presenceLabel(ev)) + '</p>' +
      '<h2>' + W.esc(ev.title) + '</h2>' +
      '<div class="detailgrid">' +
      '<div><span>When</span><strong>' + W.esc(W.fmtDayLong(d)) + '<br>' + W.esc(W.fmtTime(d)) + ' - ' + W.esc(W.fmtTime(W.endsAt(ev))) + '</strong>' + (ev.source !== 'demo' ? '<em>venue local time</em>' : '') + '</div>' +
      '<div><span>Where</span><strong>' + W.esc(online ? channelName(ev) : ev.venue) + '</strong>' + (city ? '<em>' + W.esc(city.label) + (dist != null ? ' \u00b7 ' + dist + ' mi away' : '') + '</em>' : '') + '</div>' +
      '<div><span>Price</span><strong>' + W.esc(W.priceLabel(ev)) + '</strong>' + (ev.price && !ev.price.verified && ev.source === 'demo' ? '<em>demonstration figure</em>' : '') + '</div>' +
      (ev.broadcast ? '<div><span>Broadcast</span><strong>' + W.esc(ev.broadcast) + '</strong></div>' : '') +
      (ev.resort ? '<div><span>Resort</span><strong>' + W.esc(ev.resort.name) + '</strong>' + (ev.resort.status ? '<em>' + W.esc(ev.resort.status) + '</em>' : '') + '</div>' : '') +
      '</div>' +
      '<p class="sheet__desc">' + W.esc(ev.description) + '</p>' +
      (performers.length ? '<div class="perfrow"><span>Featuring</span>' + performers.map(function (p) {
        return '<button class="chip" data-action="person" data-id="' + W.esc(p.id) + '">' + W.esc(p.name) + '</button>';
      }).join('') + '</div>' : '') +
      (ev.channel ? '<div class="perfrow"><span>Channel</span><button class="chip" data-action="follow" data-key="channel:' + W.esc(ev.channel) + '">' + (S.follows.indexOf('channel:' + ev.channel) >= 0 ? 'Following' : 'Follow') + ' ' + W.esc(channelName(ev)) + '</button></div>' : '') +
      '<div class="btnrow">' + actions + '</div>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost' + (saved ? ' is-on' : '') + '" data-action="save" data-id="' + ev.id + '">' + W.icon('bookmark') + (saved ? 'In watchlist' : 'Save to watchlist') + '</button>' +
      '<button class="btn btn--ghost" data-action="ics-one" data-id="' + ev.id + '">' + W.icon('download') + 'Add to calendar</button>' +
      (online ? '' : '<button class="btn btn--ghost" data-action="follow" data-key="venue:' + W.esc(ev.venue) + '">' + (S.follows.indexOf('venue:' + ev.venue) >= 0 ? 'Following venue' : 'Follow venue') + '</button>') +
      '</div></div></div>';
  }

  function personModal(id) {
    var p = W.personById(id);
    var ch = W.channelById(id);
    if (!p && !ch) return '<div class="sheet"><button class="sheet__x iconbtn" data-action="close-modal" aria-label="Close">' + W.icon('close') + '</button><div class="sheet__body"><h2>Not found</h2></div></div>';
    var name = p ? p.name : ch.name;
    var blurb = p ? p.blurb : ch.blurb;
    var type = p ? p.kind : 'channel';
    var key = 'performer:' + id;
    var dates = W.sortList(W.upcoming(W.allEvents().filter(function (e) { return e.performers.indexOf(id) >= 0; })), 'soonest');
    var related = p ? (p.related || []).map(function (rid) {
      var r = W.personById(rid);
      return r ? '<button class="chip" data-action="person" data-id="' + r.id + '">' + W.esc(r.name) + '</button>' : '';
    }).join('') : '';
    var venues = {};
    dates.forEach(function (e) { if (e.presence !== 'online') venues[e.venue] = true; });
    return '<div class="sheet"><button class="sheet__x iconbtn" data-action="close-modal" aria-label="Close">' + W.icon('close') + '</button>' +
      '<div class="sheet__body"><p class="sheet__kicker">' + W.esc(type) + '</p><h2>' + W.esc(name) + '</h2><p class="sheet__desc">' + W.esc(blurb) + '</p>' +
      '<div class="btnrow"><button class="btn btn--primary" data-action="follow" data-key="' + W.esc(key) + '">' + W.icon('check') + (S.follows.indexOf(key) >= 0 ? 'Following' : 'Follow') + '</button></div>' +
      (dates.length ? '<h3 class="subhead">Upcoming dates</h3><div class="datelist">' + dates.map(function (e) {
        return '<button class="daterow" data-action="open" data-id="' + e.id + '"><span>' + W.esc(W.relDay(W.parseLocal(e.startLocal))) + '</span><strong>' + W.esc(e.title) + '</strong><em>' + W.esc(e.presence === 'online' ? 'Online' : e.venue) + '</em></button>';
      }).join('') + '</div>' : '<p class="hint">No upcoming dates in this dataset.</p>') +
      (Object.keys(venues).length ? '<h3 class="subhead">Venues</h3><div class="perfrow">' + Object.keys(venues).map(function (v) { return '<span class="tag">' + W.esc(v) + '</span>'; }).join('') + '</div>' : '') +
      (related ? '<h3 class="subhead">Related</h3><div class="perfrow">' + related + '</div>' : '') +
      '</div></div>';
  }

  function notifications() {
    var evs = W.upcoming(W.allEvents(), 60);
    var out = [];
    if (S.notifPrefs.today) evs.filter(function (e) { return W.sameDay(W.parseLocal(e.startLocal), new Date()); }).forEach(function (e) { out.push({ t: 'Happening today', e: e }); });
    if (S.notifPrefs.soon) evs.filter(function (e) { var h = (W.parseLocal(e.startLocal) - new Date()) / 3600000; return h > 0 && h < 3; }).forEach(function (e) { out.push({ t: 'Starts in under 3 hours', e: e }); });
    if (S.notifPrefs.watched) W.upcoming(S.saved.map(W.byId).filter(Boolean), 14).forEach(function (e) { out.push({ t: 'Saved event approaching', e: e }); });
    if (S.notifPrefs.interests) evs.filter(function (e) { return S.interests.indexOf(e.category) >= 0 && !W.sameDay(W.parseLocal(e.startLocal), new Date()); }).slice(0, 6).forEach(function (e) { out.push({ t: 'Matches your interests', e: e }); });
    var seen = {};
    out = out.filter(function (x) { if (seen[x.e.id]) return false; seen[x.e.id] = 1; return true; }).slice(0, 12);
    return '<div class="sheet sheet--narrow"><button class="sheet__x iconbtn" data-action="close-modal" aria-label="Close">' + W.icon('close') + '</button>' +
      '<div class="sheet__body"><h2>Notifications</h2>' + (out.length ? '<ul class="notiflist">' + out.map(function (x) {
        return '<li><button data-action="open" data-id="' + x.e.id + '"><span class="notif__t">' + W.esc(x.t) + '</span><span class="notif__title">' + W.esc(x.e.title) + '</span><span class="notif__m">' + W.esc(W.relDay(W.parseLocal(x.e.startLocal)) + ' \u00b7 ' + W.fmtTime(W.parseLocal(x.e.startLocal))) + '</span></button></li>';
      }).join('') + '</ul>' : '<p class="hint">Nothing to show yet. Save a few events and notifications will appear here.</p>') +
      '<div class="btnrow"><button class="btn btn--ghost" data-action="enable-push">' + W.icon('bell') + 'Enable browser notifications</button></div></div></div>';
  }

  function onboarding() {
    return '<div class="sheet sheet--onboard"><div class="sheet__body"><p class="sheet__kicker">Welcome</p><h2>What do you actually want to see?</h2>' +
      '<p class="sheet__desc">Two questions, then you are in. You can change all of it later in Settings.</p>' +
      '<div class="field"><label for="ob-city">Where are you based?</label><select id="ob-city">' + W.CITIES.map(function (x) { return '<option value="' + x.id + '"' + (x.id === S.city ? ' selected' : '') + '>' + W.esc(x.label) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="ob-radius">How far will you travel?</label><select id="ob-radius">' + [10, 25, 50, 100, 250].map(function (r) { return '<option value="' + r + '"' + (S.radius === r ? ' selected' : '') + '>Within ' + r + ' miles</option>'; }).join('') + '</select></div>' +
      '<fieldset class="obcats"><legend>Pick a few interests</legend>' + W.CATS.map(function (c) {
        return '<label class="check"><input type="checkbox" class="ob-cat" value="' + c.id + '"' + (S.interests.indexOf(c.id) >= 0 ? ' checked' : '') + '><span class="dotcat" style="--h:' + c.hue + '"></span>' + W.esc(c.short) + '</label>';
      }).join('') + '</fieldset>' +
      '<label class="check check--wide"><input type="checkbox" id="ob-online"' + (S.onlineInterest ? ' checked' : '') + '>Include livestreams and online events</label>' +
      '<div class="btnrow"><button class="btn btn--primary" data-action="ob-finish">Start exploring' + W.icon('arrow') + '</button><button class="btn btn--ghost" data-action="ob-skip">Skip</button></div></div></div>';
  }

  return { viewCalendar: viewCalendar, viewWatchlist: viewWatchlist, viewSettings: viewSettings, eventModal: eventModal, personModal: personModal, notifications: notifications, onboarding: onboarding, groupByDay: groupByDay };
})();
