/* What's Happening? - helpful empty states for the listing views.

   Coverage is derived from loaded live data (venueCity), never hardcoded, so
   it cannot drift from the sync script's city list.

   The first version wrapped the exported WHV.row / WHV.results. views.js calls
   its own local row() and results() closures, so the exports are not on the
   render path and none of this copy ever appeared. views.js now asks
   window.WHEMPTY for the block itself.
*/
window.WHEMPTY = (function () {
  'use strict';

  function W() { return window.WH; }
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
    return 'Live data has not loaded yet - try Anywhere or Online.';
  }

  function near() {
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

  function generic() {
    return '<div class="empty">' +
      '<h3>No events match these filters</h3>' +
      '<p>' + W().esc(coverageLine()) + '</p>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="anywhere">Show Anywhere</button>' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="online">Online only</button>' +
      '<button class="btn btn--ghost" data-action="resetfilters">Clear filters</button>' +
      '</div></div>';
  }

  return { near: near, generic: generic, coverage: coverageLine };
})();
