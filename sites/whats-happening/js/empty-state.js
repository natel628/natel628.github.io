/* What's Happening? - helpful empty states for Near me.
   When radius finds nothing, show covered area + links to Anywhere / Online
   instead of just "Nothing matches yet". No new API. */
(function () {
'use strict';
  function W() { return window.WH; }
  function V() { return window.WHV; }
  var COVERAGE = 'Providence / Boston / Hartford + NYC, Chicago, Austin, Denver, Seattle, Atlanta + Carolinas';
  function cityLabel() {
    try { return W().city().label; } catch (e) { return 'your area'; }
  }
  function radius() { return W().state.radius; }
  function nearEmpty() {
    var city = cityLabel(), r = radius();
    return '<div class="empty">' +
      '<h3>No events within ' + r + ' miles of ' + W().esc(city) + '</h3>' +
      '<p>Live coverage today: ' + W().esc(COVERAGE) + '. Your filters may also be hiding results.</p>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="anywhere">Show Anywhere</button>' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="online">Online only</button>' +
      '<button class="btn btn--ghost" data-action="resetfilters">Clear filters</button>' +
      '</div></div>';
  }
  function genericEmpty() {
    return '<div class="empty">' +
      '<h3>No events match these filters</h3>' +
      '<p>Try a wider radius, another date, or browse everything live.</p>' +
      '<div class="btnrow">' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="anywhere">Show Anywhere</button>' +
      '<button class="btn btn--ghost" data-action="filter" data-group="where" data-val="online">Online only</button>' +
      '<button class="btn btn--ghost" data-action="resetfilters">Clear filters</button>' +
      '</div></div>';
  }
  function patch() {
    var v = V();
    if (!v || !W()) return false;
    if (!v.__emptyPatched) {
      var origRow = v.row;
      v.row = function (events, opts) {
        if (events && events.length) return origRow(events, opts);
        if (W().state.filters.where === 'near' || W().state.view === 'near' || W().state.view === 'discover') return nearEmpty();
        return genericEmpty();
      };
      var origResults = v.results;
      v.results = function (events, opts) {
        if (events && events.length) return origResults(events, opts);
        var f = W().state.filters;
        if (f.where === 'near') return nearEmpty();
        return genericEmpty();
      };
      v.__emptyPatched = true;
    }
    return true;
  }
  if (!patch()) {
    var t = setInterval(function () { if (patch()) clearInterval(t); }, 50);
    setTimeout(function () { clearInterval(t); }, 3000);
  }
})();
