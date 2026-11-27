'use strict';
var G6 = window.G6 || {};

G6.filters = (function () {

  function computeVisible(locations, prefs, found) {
    var search    = (prefs.search || '').toLowerCase().trim();
    var activeCats  = prefs.categories;   // null = all
    var activeVerif = prefs.verification  || ['official', 'community', 'estimate'];
    var hideFound   = !!prefs.hideFound;

    var ids = [];
    locations.forEach(function (loc) {
      if (activeCats && activeCats.indexOf(loc.category) === -1)   return;
      var v = loc.verification || 'community';
      if (activeVerif.indexOf(v) === -1)                           return;
      if (hideFound && found[loc.id])                               return;
      if (search) {
        var haystack = [loc.name, loc.summary, loc.hint, loc.region, loc.category,
                        (loc.rewards || []).join(' ')].join(' ').toLowerCase();
        if (haystack.indexOf(search) === -1)                       return;
      }
      ids.push(loc.id);
    });
    return new Set(ids);
  }

  function update(locations) {
    var s       = G6.state.get();
    var visible = computeVisible(locations, s.prefs, s.found);
    G6.state.set({ visibleIds: visible });
    _updateCount(visible.size, locations.length);
  }

  function _updateCount(visible, total) {
    var el = document.getElementById('markerCount');
    if (el) {
      el.textContent = visible + ' of ' + total;
      el.setAttribute('aria-label', visible + ' of ' + total + ' locations visible');
    }
    // also update mobile count chip
    var mob = document.getElementById('mobileCount');
    if (mob) mob.textContent = visible + ' / ' + total;
  }

  window.G6 = G6;
  return { computeVisible: computeVisible, update: update };

})();

window.G6 = G6;
