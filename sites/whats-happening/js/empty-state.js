/* What's Happening? - helpful empty states for Near me.
   Coverage is derived from loaded live data (venueCity), never hardcoded,
   so it can't drift from scripts/sync-live.mjs CITIES.
*/
(function () {
'use strict';
  function W() { return window.WH; }
  function V() { return window.WHV; }
  function cityLabel() {
    try { return W().city().label; } catch (e) { return 'your area'; }
  }
  function radius() { return W().state.radius; }
  function coverageText() {
    var live = (W() && W().state && W().state.live) || [];
    var counts = {};
    for (var i = 0; i < live.length; i++) {
      var c = live[i] && live[i].venueCity;
      if (typeof c !== 'string') continue;
      c = c.trim();
      if (!c) continue;
      counts[c] = (counts[c] || 0) + 1;
    }
    var keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (!keys.length) return '';
    var top = keys.slice(0, 6);
    var more = keys.length - top.length;
    var s = top.join(' / ');
    if (more > 0) s += ' + ' + more + ' more';
    return s + ' (' + live.length + ' live events)';
  }
  function coverageLine() {
    var cov = coverageText();
    if (cov) return 'Live coverage right now: ' + cov + '.';
    return 'Live data has not loaded yet — try Anywhere or Online.';
  }
  function nearEmpty() {
    var city = cityLabel(), r = radius();
    return '<div class="empty">' +
      '<h3>No events within ' + r + ' miles of ' + W().esc(city) + '</h3>' +
      '<p>' + W().esc(coverageLine()) + ' Your filters may also be hiding results.</p>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="anywhere">Show Anywhere</button>' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="online">Online only</button>' +
      '<button class="btn btn--ghost" data-action="resetfilters">Clear filters</button>' +
      '</div></div>';
  }
  function genericEmpty() {
    return '<div class="empty">' +
      '<h3>No events match these filters</h3>' +
      '<p>' + W().esc(coverageLine()) + '</p>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="anywhere">Show Anywhere</button>' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="online">Online only</button>' +
      '<button class="btn btn--ghost" data-action="resetfilters">Clear filters</button>' +
      '</div></div>';
  }
  function patch() {
    var v = V();
    if (!v || !W()) return false;
    if (!v.__emptyPatched2) {
      var origRow = v.row;
      v.row = function (events, opts) {
        if (events && events.length) return origRow(events, opts);
        if (W().state.filters.where === 'near' || W().state.view === 'near' || W().state.view === 'discover') return nearEmpty();
        return genericEmpty();
      };
      var origResults = v.results;
      v.results = function (events, opts) {
        if (events && events.length) return origResults(events, opts);
        if (W().state.filters.where === 'near') return nearEmpty();
        return genericEmpty();
      };
      v.__emptyPatched2 = true;
      v.__emptyPatched = true;
    }
    return true;
  }
  if (!patch()) {
    var t = setInterval(function () { if (patch()) clearInterval(t); }, 50);
    setTimeout(function () { clearInterval(t); }, 3000);
  }
})();
