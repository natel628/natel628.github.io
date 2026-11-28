'use strict';
var G6 = window.G6 || {};

// ── Pin sets ───────────────────────────────────────────────
// Every bulk pin came from one GTABase feature layer (hidden packages, safes,
// loot boxes, …), and that layer is its set: data.js stamps the set on each
// record from `_gb.category`, and data/sets.json supplies the label. The 80
// hand-written records are one group of their own. Nothing here groups by map
// category — that stays the pin legend — and nothing touches coordinates.
G6.sets = (function () {

  // One pass over the pins, so the rail, the detail panel and the jump all agree
  // on what "found" means for a set.
  function summary() {
    var s     = G6.state.get();
    var found = s.found || {};
    var bySet = {};
    var all   = { found: 0, total: 0 };

    s.locations.forEach(function (l) {
      var b = bySet[l.setId] || (bySet[l.setId] = { found: 0, total: 0 });
      b.total++;
      all.total++;
      if (found[l.id]) { b.found++; all.found++; }
    });

    return { bySet: bySet, all: all };
  }

  function progress(setId) {
    return summary().bySet[setId] || { found: 0, total: 0 };
  }

  function _name(setId) {
    var locs = G6.state.get().locations;
    for (var i = 0; i < locs.length; i++) {
      if (locs[i].setId === setId && locs[i].setLabel) return locs[i].setLabel;
    }
    return setId;
  }

  function _save(s) {
    G6.storage.saveProgress({
      found: s.found, notes: s.notes, custom: s.custom,
      position: s.position, prefs: s.prefs
    });
  }

  // The pin is about to be shown, so the search box must not keep claiming a
  // filter that no longer applies.
  function _clearSearchUI() {
    ['searchInput', 'sheetSearchInput'].forEach(function (id) {
      var input = document.getElementById(id);
      if (input) input.value = '';
    });
    var clear = document.getElementById('searchClear');
    if (clear) clear.classList.remove('visible');
  }

  // "Next unfound" means the closest unfound pin in the set to the middle of the
  // map, not the next one in file order: after each jump the centre is where you
  // were just sent, so repeated presses sweep outward from you instead of
  // teleporting across Leonida. Filters that would hide the chosen pin are
  // opened first — the button promises to take you to a pin, so it does.
  function next(setId) {
    if (!setId) return false;

    var s     = G6.state.get();
    var name  = _name(setId);
    var inSet = 0;
    var candidates = [];

    s.locations.forEach(function (l) {
      if (l.setId !== setId) return;
      inSet++;
      if (s.found[l.id]) return;
      if (!G6.geo.inCrop(l.position.x, l.position.y)) return;
      candidates.push(l);
    });

    if (!candidates.length) {
      if (!inSet) G6.dom.toast('No pins in ' + name, 'info');
      else        G6.dom.toast('All ' + inSet + ' ' + name + ' are marked found', 'success');
      return false;
    }

    // The pin you are standing on is zero metres from the centre, so it would
    // win every time and the button would go nowhere. Skip it while the set has
    // another unfound pin to offer.
    var pool = candidates.filter(function (l) { return l.id !== s.selectedId; });
    if (!pool.length) pool = candidates;

    var map    = G6.map.getMap();
    var centre = map ? map.getCenter() : null;
    var cx     = centre ? centre.lng : 0;
    var cy     = centre ? centre.lat : 0;
    var best   = pool[0];
    var bestD  = Infinity;

    pool.forEach(function (l) {
      var dx = l.position.x - cx;
      var dy = l.position.y - cy;
      var d  = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = l; }
    });

    var prefs = Object.assign({}, s.prefs, { set: setId, search: '' });
    if (prefs.categories && prefs.categories.indexOf(best.category) === -1) {
      prefs.categories = prefs.categories.concat([best.category]);
    }
    var tier = best.verification || 'community';
    if (prefs.verification.indexOf(tier) === -1) {
      prefs.verification = prefs.verification.concat([tier]);
    }

    _clearSearchUI();
    G6.state.set({ prefs: prefs });
    G6.filters.update(s.locations);
    G6.state.set({ selectedId: best.id });
    _save(G6.state.get());

    // Tablet and phone show the rail as a drawer, which would cover the pin; the
    // detail panel opens behind it.
    var rail = document.querySelector('.rail');
    if (rail && rail.classList.contains('open')) {
      rail.classList.remove('open');
      var overlay = document.querySelector('.rail-overlay');
      if (overlay) overlay.classList.remove('visible');
    }

    // The detail panel flies to the pin at the overview zoom; this arrives at the
    // deepest zoom the artwork has, where the pin is a pin and not a disc. It has
    // to wait for the detail panel's relayout: invalidateSize() runs on the next
    // tick and cancels an animation started in this one, which left the map at
    // the overview with the right centre and the wrong zoom.
    if (map) {
      setTimeout(function () {
        map.flyTo(G6.geo.toLatLng(best.position.x, best.position.y),
                  map.getMaxZoom(), { duration: 0.8 });
      }, 200);
    }
    return true;
  }

  // ── Bulk progress ──────────────────────────────────────────
  // A set can be hundreds of pins, and a returning player has collected many
  // before finding this map. These two actions are the only way to enter that
  // progress without clicking every pin. They always state the count, never
  // touch another set, and can be undone for as long as the toast is up.
  function _bulk(setId, mode) {
    if (!setId) return false;

    var s      = G6.state.get();
    var name   = _name(setId);
    var found  = s.found || {};
    var totals = progress(setId);
    var ids    = [];
    var before = {};                 // the previous value, where there was one

    s.locations.forEach(function (l) {
      if (l.setId !== setId) return;
      var had = found[l.id];
      if (mode === 'mark' ? !had : !!had) {
        ids.push(l.id);
        if (had) before[l.id] = had;
      }
    });

    if (!ids.length) return false;   // the buttons disable an empty action

    var count = ids.length + ' pin' + (ids.length === 1 ? '' : 's');
    var question = mode === 'mark'
      ? 'Mark all ' + count + ' in "' + name + '" as found?' +
        (totals.found ? '\n\n' + totals.found + ' of ' + totals.total + ' are already found.' : '')
      : 'Clear ' + count + ' in "' + name + '"?' +
        '\n\nNo other set is affected.';

    if (!window.confirm(question + '\n\nYou can undo this.')) return false;

    var now      = new Date().toISOString();
    var newFound = Object.assign({}, found);
    ids.forEach(function (id) {
      if (mode === 'mark') newFound[id] = now;
      else                  delete newFound[id];
    });

    G6.state.set({ found: newFound });
    G6.filters.update(s.locations);
    _save(G6.state.get());

    G6.dom.toast(
      mode === 'mark'
        ? 'Marked ' + count + ' in "' + name + '" as found'
        : 'Cleared ' + count + ' in "' + name + '"',
      'success', 9000,
      function () {
        // Undo only what this action still owns: a pin the user changed since
        // keeps its newer state instead of being reverted under them.
        var current  = G6.state.get();
        var restored = Object.assign({}, current.found);
        ids.forEach(function (id) {
          if (mode === 'mark') {
            if (current.found[id] === now) delete restored[id];
          } else if (!current.found[id] && before[id]) {
            restored[id] = before[id];
          }
        });
        G6.state.set({ found: restored });
        G6.filters.update(current.locations);
        _save(G6.state.get());
        G6.dom.toast('Bulk change undone', 'info');
      }
    );

    return true;
  }

  function markAllFound(setId) { return _bulk(setId, 'mark'); }
  function clearFound(setId)   { return _bulk(setId, 'clear'); }

  window.G6 = G6;
  return {
    summary: summary, progress: progress, next: next,
    markAllFound: markAllFound, clearFound: clearFound
  };

})();

window.G6 = G6;
