/* What's Happening? - view rendering */
window.WHV = (function () {
  'use strict';
  var W = window.WH, S = W.state;

  function badge(ev) {
    var ls = W.liveState(ev);
    var streamable = !!ev.streamUrl || !!ev.channel;
    if (streamable) {
      if (ls === 'live') return '<span class="badge badge--live"><span class="pulse" aria-hidden="true"></span>Live now</span>';
      if (ls === 'premiere') return '<span class="badge badge--prem">Premiere</span>';
      if (ls === 'soon') return '<span class="badge badge--soon">Starts soon</span>';
      if (ls === 'scheduled') return '<span class="badge">Scheduled stream</span>';
    }
    if (ev.presence === 'both') return '<span class="badge">In person + online</span>';
    return '';
  }

  function art(ev, cls) {
    var c = W.catOf(ev.category);
    var saved = S.saved.indexOf(ev.id) >= 0;
    var demo = ev.source === 'demo' ? '<span class="badge badge--demo">Demo</span>' : '';
    return '<div class="art ' + (cls || '') + '" style="--h:' + c.hue + '">' +
      '<span class="art__glyph" aria-hidden="true">' + W.icon(c.icon) + '</span>' +
      '<div class="art__tags">' + demo + badge(ev) + '</div>' +
      '<button class="save' + (saved ? ' is-on' : '') + '" data-action="save" data-id="' + ev.id + '" aria-pressed="' + saved + '" aria-label="' + (saved ? 'Remove from watchlist' : 'Save to watchlist') + '">' + W.icon('bookmark') + '</button>' +
      '</div>';
  }

  function distLabel(dist) {
    if (dist == null) return '';
    return dist < 1 ? 'under 1 mi' : dist + ' mi';
  }

  function metaLine(ev) {
    var d = W.parseLocal(ev.startLocal);
    var bits = [W.fmtDay(d) + ' at ' + W.fmtTime(d)];
    if (ev.presence === 'online') {
      bits.push(ev.channelName || (W.channelById(ev.channel) || {}).name || ev.venue || 'Online');
    } else {
      var city = W.eventCity(ev);
      var dist = W.distanceMi(ev);
      bits.push(ev.venue + (city && city.id !== S.city ? ' \u00b7 ' + city.label : ''));
      if (dist != null) bits.push(distLabel(dist));
    }
    return bits.map(function (b) { return '<span>' + W.esc(b) + '</span>'; }).join('<span class="sep">\u00b7</span>');
  }

  /* An event is only watchable online when there is actually something to
     open: presence online, or a real stream link / channel. In-person events
     that merely allow a future broadcast do not count. */
  function watchable(ev) {
    return ev.presence === 'online' || !!ev.streamUrl || !!ev.channel;
  }

  /* Live snow readout mount point. weather.js fills this in after render and
     replaces it with a single quiet line if Open-Meteo cannot be reached. */
  function weatherBlock(ev) {
    if (ev.presence === 'online' || ev.lat == null || ev.lng == null) return '';
    if (ev.category !== 'outdoor' && !ev.resort) return '';
    return '<div class="wx" data-wx="' + ev.lat + ',' + ev.lng + '"><p class="wx__msg">Checking snow conditions\u2026</p></div>';
  }

  function card(ev, opts) {
    opts = opts || {};
    var why = opts.why === true ? (W.score(ev).reasons[0] || '') : (opts.why || '');
    var c = W.catOf(ev.category);
    return '<article class="card' + (S.highlight === ev.id ? ' is-hl' : '') + '" data-id="' + ev.id + '" data-action="open">' +
      art(ev) +
      '<div class="card__body">' +
      '<p class="card__kicker"><span class="dotcat" style="--h:' + c.hue + '"></span>' + W.esc(c.short) + '</p>' +
      '<h3 class="card__title">' + W.esc(ev.title) + '</h3>' +
      '<p class="card__meta">' + metaLine(ev) + '</p>' +
      weatherBlock(ev) +
      '<p class="card__foot"><span class="price">' + W.esc(W.priceLabel(ev)) + '</span>' + (why ? '<span class="why" title="Why this is here">' + W.esc(why) + '</span>' : '') + '</p>' +
      '</div></article>';
  }

  function hero(ev) {
    var c = W.catOf(ev.category);
    var d = W.parseLocal(ev.startLocal);
    var dist = W.distanceMi(ev);
    var saved = S.saved.indexOf(ev.id) >= 0;
    var where = ev.presence === 'online'
      ? 'Streaming on ' + (ev.channelName || (W.channelById(ev.channel) || {}).name || 'YouTube')
      : ev.venue + (dist != null ? ' \u00b7 ' + distLabel(dist) : '');
    return '<section class="hero" style="--h:' + c.hue + '">' +
      '<div class="hero__art" aria-hidden="true"><span class="art__glyph">' + W.icon(c.icon) + '</span></div>' +
      '<div class="hero__body">' +
      '<p class="hero__kicker"><span class="dotcat" style="--h:' + c.hue + '"></span>Featured \u00b7 ' + W.esc(c.label) + (ev.source === 'demo' ? ' <span class="tag-mini">Demo</span>' : '') + '</p>' +
      '<h2 class="hero__title">' + W.esc(ev.title) + '</h2>' +
      '<p class="hero__when">' + W.icon('clock') + W.esc(W.relDay(d) + ' \u00b7 ' + W.fmtTime(d)) + ' <span class="sep">\u00b7</span> ' + W.icon('pin') + W.esc(where) + '</p>' +
      '<p class="hero__desc">' + W.esc(ev.description) + '</p>' +
      '<div class="hero__actions">' +
      '<button class="btn btn--primary" data-action="open" data-id="' + ev.id + '">View event' + W.icon('arrow') + '</button>' +
      '<button class="btn btn--ghost' + (saved ? ' is-on' : '') + '" data-action="save" data-id="' + ev.id + '" aria-pressed="' + saved + '">' + W.icon('bookmark') + (saved ? 'Saved' : 'Save event') + '</button>' +
      '</div></div></section>';
  }

  function sectionHead(title, sub, more) {
    return '<div class="shead"><div><h2>' + W.esc(title) + '</h2>' + (sub ? '<p>' + W.esc(sub) + '</p>' : '') + '</div>' +
      (more ? '<a class="shead__link" href="' + more.href + '">' + W.esc(more.label) + W.icon('right') + '</a>' : '') + '</div>';
  }

  function row(events, opts) {
    if (!events.length) return '<div class="empty"><p>Nothing matches yet. Try widening the radius or clearing a filter.</p></div>';
    return '<div class="row">' + events.map(function (ev) { return card(ev, opts); }).join('') + '</div>';
  }

  function chip(group, val, label, active) {
    return '<button class="chip' + (active ? ' is-on' : '') + '" data-action="filter" data-group="' + group + '" data-val="' + val + '">' + W.esc(label) + '</button>';
  }

  function filterBar(opts) {
    opts = opts || {};
    var f = S.filters;
    var cats = W.CATS.map(function (c) { return chip('cats', c.id, c.short, f.cats.indexOf(c.id) >= 0); }).join('');
    var dates = [['any', 'Any date'], ['today', 'Today'], ['tonight', 'Tonight'], ['tomorrow', 'Tomorrow'], ['weekend', 'This weekend'], ['7', 'Next 7 days'], ['30', 'Next 30 days'], ['custom', 'Custom range']]
      .map(function (d) { return chip('date', d[0], d[1], f.date === d[0]); }).join('');
    var prices = [['any', 'Any price'], ['free', 'Free'], ['u25', 'Under $25'], ['25-50', '$25-$50'], ['50-100', '$50-$100'], ['100plus', '$100+']]
      .map(function (d) { return chip('price', d[0], d[1], f.price === d[0]); }).join('');
    var presence = [['any', 'Any format'], ['in-person', 'In person'], ['online', 'Online'], ['both', 'Both']]
      .map(function (d) { return chip('presence', d[0], d[1], f.presence === d[0]); }).join('');
    var times = [['any', 'Any time'], ['morning', 'Morning'], ['afternoon', 'Afternoon'], ['evening', 'Evening'], ['late', 'Late night']]
      .map(function (d) { return chip('time', d[0], d[1], f.time === d[0]); }).join('');
    var wheres = [['near', 'Near me'], ['anywhere', 'Anywhere'], ['online', 'Online only']]
      .map(function (d) { return chip('where', d[0], d[1], f.where === d[0]); }).join('');
    var sorts = [['recommended', 'Recommended'], ['soonest', 'Soonest'], ['closest', 'Closest'], ['popular', 'Most popular'], ['price', 'Lowest price']];
    return '<div class="filters" id="filters">' +
      '<div class="fgroup"><span class="flabel">Category</span>' + cats + '</div>' +
      '<div class="fgroup"><span class="flabel">Date</span>' + dates + '</div>' +
      (f.date === 'custom' ? '<div class="fgroup fgroup--range"><label>From <input type="date" id="f-from" value="' + (f.from || '') + '"></label><label>To <input type="date" id="f-to" value="' + (f.to || '') + '"></label></div>' : '') +
      '<div class="fgroup"><span class="flabel">Price</span>' + prices + '</div>' +
      '<div class="fgroup"><span class="flabel">Event type</span>' + presence + '</div>' +
      '<div class="fgroup"><span class="flabel">Time</span>' + times + '</div>' +
      '<div class="fgroup"><span class="flabel">Location</span>' + wheres + '</div>' +
      '<div class="fgroup fgroup--sort"><label for="sort">Sort</label><select id="sort">' + sorts.map(function (s) {
        return '<option value="' + s[0] + '"' + (S.sort === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
      }).join('') + '</select>' +
      (opts.map ? '<div class="seg"><button data-action="maptoggle" data-val="list" class="' + (!S.mapMode ? 'is-on' : '') + '">' + W.icon('list') + 'List</button><button data-action="maptoggle" data-val="map" class="' + (S.mapMode ? 'is-on' : '') + '">' + W.icon('map') + 'Map</button></div>' : '') +
      '<button class="linkbtn" data-action="resetfilters">Reset</button></div></div>';
  }

  function notice() {
    if (S.live.length) return '';
    return '<div class="notice"><span class="notice__icon">' + W.icon('spark') + '</span><div><strong>Showing demonstration data.</strong> Events marked <span class="tag-mini">Demo</span> are invented so the app is fully explorable with no keys. Add a free Ticketmaster or YouTube key in <a href="#/settings">Settings</a> to pull real listings.</div></div>';
  }

  function results(events) {
    if (!events.length) return '<div class="empty"><h3>No events match these filters</h3><p>Try a wider radius, another date, or clearing a category.</p><button class="btn btn--ghost" data-action="resetfilters">Clear filters</button></div>';
    return '<div class="grid">' + events.map(function (ev) { return card(ev); }).join('') + '</div>';
  }

  /* ---------------- views ---------------- */
  function viewDiscover() {
    var evs = W.upcoming(W.allEvents());
    var ranked = W.sortList(evs, 'recommended');
    var featured = ranked[0];
    var near = W.sortList(evs.filter(function (e) { var d = W.distanceMi(e); return d != null && d <= S.radius; }), 'soonest').slice(0, 6);
    var today = new Date();
    var week = [];
    for (var i = 0; i < 7; i++) {
      var day = W.addDays(today, i);
      var items = W.sortList(evs.filter(function (e) { return W.sameDay(W.parseLocal(e.startLocal), day); }), 'popular').slice(0, 3);
      week.push({ day: day, items: items });
    }
    var onlineTonight = W.sortList(evs.filter(function (e) {
      return watchable(e) && W.sameDay(W.parseLocal(e.startLocal), today);
    }), 'soonest');
    var recs = ranked.filter(function (e) { return W.score(e).reasons.length; }).slice(1, 7);
    var trending = W.sortList(evs, 'popular').slice(0, 5);
    var monthEnd = W.addDays(today, 30);
    var month = W.sortList(evs.filter(function (e) { return W.parseLocal(e.startLocal) < monthEnd; }), 'soonest').slice(0, 8);

    return notice() +
      (featured ? hero(featured) : '') +
      sectionHead('What\u2019s happening near you', 'Within ' + S.radius + ' miles of ' + W.city().label, { href: '#/near', label: 'Open map' }) +
      '<div class="radiusrow">' + [10, 25, 50, 100, 250].map(function (r) {
        return '<button class="chip' + (S.radius === r ? ' is-on' : '') + '" data-action="radius" data-val="' + r + '">' + r + ' mi</button>';
      }).join('') + '</div>' +
      row(near) +
      sectionHead('This week', 'Seven days, most-watched first', { href: '#/browse', label: 'See all' }) +
      '<div class="timeline">' + week.map(function (d) {
        return '<div class="tday"><p class="tday__label">' + W.esc(W.relDay(d.day)) + '<span>' + W.esc(W.MONTHS[d.day.getMonth()].slice(0, 3) + ' ' + d.day.getDate()) + '</span></p>' +
          (d.items.length ? d.items.map(function (e) {
            var c = W.catOf(e.category);
            return '<button class="titem" data-action="open" data-id="' + e.id + '" style="--h:' + c.hue + '"><span class="titem__dot"></span><span class="titem__t">' + W.esc(e.title) + '</span><span class="titem__h">' + W.esc(W.fmtTime(W.parseLocal(e.startLocal))) + '</span></button>';
          }).join('') : '<p class="tday__empty">Nothing scheduled</p>') + '</div>';
      }).join('') + '</div>' +
      sectionHead('Online tonight', 'Streams and premieres you can watch from here', { href: '#/online', label: 'All streams' }) +
      row(onlineTonight) +
      sectionHead('Recommended for you', 'Based on your interests and follows', { href: '#/settings', label: 'Edit interests' }) +
      row(recs, { why: true }) +
      sectionHead('Trending', 'What people are looking at right now') +
      '<ol class="trend">' + trending.map(function (e, i) {
        var c = W.catOf(e.category);
        return '<li><button data-action="open" data-id="' + e.id + '"><span class="trend__n">' + W.pad(i + 1) + '</span><span class="trend__body"><span class="trend__t">' + W.esc(e.title) + '</span><span class="trend__m">' + W.esc(c.short + ' \u00b7 ' + W.relDay(W.parseLocal(e.startLocal))) + '</span></span><span class="trend__bar"><span style="width:' + (e.popularity || 0) + '%"></span></span></button></li>';
      }).join('') + '</ol>' +
      sectionHead('Coming up', 'The next 30 days', { href: '#/calendar', label: 'Open calendar' }) +
      '<div class="grid">' + month.map(function (e) { return card(e); }).join('') + '</div>';
  }

  function collectionView(title, sub, opts) {
    opts = opts || {};
    var list = W.query(S.filters, S.q);
    if (opts.watchable) list = list.filter(watchable);
    var hidden = S.hiddenNoPrice;
    var note = '';
    if (S.filters.price !== 'any' && hidden > 0) {
      note = '<p class="fnote">' + hidden + ' event' + (hidden === 1 ? '' : 's') + ' hidden because the price is not published. We do not guess prices.</p>';
    }
    return notice() +
      '<div class="pagehead"><div><h1>' + W.esc(title) + '</h1><p>' + W.esc(sub) + '</p></div>' +
      '<p class="pagehead__count">' + list.length + ' event' + (list.length === 1 ? '' : 's') + '</p></div>' +
      filterBar({ map: true }) +
      (S.mapMode ? '<div class="mapwrap"><div id="map" class="map"></div><p class="maphint">Markers are grouped when they sit close together. Selecting one highlights it below.</p></div>' : '') +
      note + results(list);
  }

  function viewNear() {
    return collectionView('Near me', 'Everything within ' + S.radius + ' miles of ' + W.city().label + '. Adjust the radius in Settings or with the chips below.');
  }
  function viewCategory(id) {
    var c = W.catOf(id);
    return collectionView(c.label, 'Live and upcoming ' + c.short.toLowerCase() + ' built from every source available to you.');
  }
  function viewOnline() {
    return collectionView('Online & livestreams', 'Scheduled streams and premieres that you can actually open. Everything here has a watch link or a channel.', { watchable: true });
  }
  function viewBrowse() {
    return collectionView(S.browseTitle || 'All events', 'Search everything, then narrow it down.');
  }

  return {
    badge: badge, art: art, card: card, hero: hero, sectionHead: sectionHead, row: row, filterBar: filterBar,
    notice: notice, results: results, viewDiscover: viewDiscover, collectionView: collectionView, watchable: watchable,
    viewNear: viewNear, viewCategory: viewCategory, viewOnline: viewOnline, viewBrowse: viewBrowse
  };
})();
