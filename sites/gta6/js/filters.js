'use strict';
var G6 = window.G6 || {};

G6.filters = (function () {

  function computeVisible(locations, prefs, found) {
    var search    = (prefs.search || '').toLowerCase().trim();
    var activeCats  = prefs.categories;   // null = all
    var activeSet   = prefs.set || null;  // null = every set
    var activeVerif = prefs.verification  || ['official', 'community', 'estimate'];
    var hideFound   = !!prefs.hideFound;

    var ids = [];
    locations.forEach(function (loc) {
      if (activeCats && activeCats.indexOf(loc.category) === -1)   return;
      if (activeSet && loc.setId !== activeSet)                     return;
      var v = loc.verification || 'community';
      if (activeVerif.indexOf(v) === -1)                           return;
      if (hideFound && found[loc.id])                               return;
      if (search) {
        // Codes and tips are searchable too: the question is usually "what is
        // 80085" or "is there a code here", not "what is this pin called".
        var haystack = [loc.name, loc.summary, loc.hint, loc.region, loc.category,
                        loc.setLabel || '', loc.code || '', (loc.tips || []).join(' '),
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
    // also update mobile count chips (toolbar + bottom-sheet peek row)
    var mob = document.getElementById('mobileCount');
    if (mob) mob.textContent = visible + ' / ' + total;
    var mob2 = document.getElementById('mobileCount2');
    if (mob2) mob2.textContent = visible + ' / ' + total;
  }

  window.G6 = G6;
  return { computeVisible: computeVisible, update: update };

})();

window.G6 = G6;
