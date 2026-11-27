'use strict';
var G6 = window.G6 || {};

G6.navigation = (function () {

  var _placing = false;

  function startPlacePosition() {
    if (_placing) return;
    _placing = true;
    var mapEl = document.getElementById('map');
    mapEl.style.cursor = 'crosshair';
    G6.dom.toast('Click on the map to set your position', 'info', 4000);

    var map = G6.map.getMap();
    map.once('click', function (e) {
      _placing = false;
      mapEl.style.cursor = '';
      var pt = G6.geo.fromLatLng(e.latlng);
      if (!G6.geo.inCrop(pt.x, pt.y)) {
        G6.dom.toast('Click within the map area', 'error');
        return;
      }
      G6.markers.setPosition(pt.x, pt.y);
      var s = G6.state.get();
      G6.state.set({ position: { x: pt.x, y: pt.y } });
      _save();
      _updateRoute();
      _refreshUI();
      G6.dom.toast('Position set', 'success');
    });
  }

  function clearPosition() {
    G6.markers.setPosition(null);
    G6.state.set({ position: null });
    _save();
    _updateRoute();
    _refreshUI();
    G6.dom.toast('Position cleared', 'info');
  }

  function setDestination(locId) {
    G6.state.set({ destination: locId });
    _updateRoute();
    _refreshUI();
  }

  function clearDestination() {
    G6.state.set({ destination: null });
    G6.markers.drawRoute(null, null, null, null);
    _refreshUI();
  }

  function _updateRoute() {
    var s = G6.state.get();
    if (!s.position || !s.destination) {
      G6.markers.drawRoute(null, null, null, null);
      return;
    }
    var dest = null;
    for (var i = 0; i < s.locations.length; i++) {
      if (s.locations[i].id === s.destination) { dest = s.locations[i]; break; }
    }
    if (!dest) return;
    G6.markers.drawRoute(s.position.x, s.position.y, dest.position.x, dest.position.y);
  }

  function _save() {
    var s = G6.state.get();
    G6.storage.saveProgress({ found: s.found, notes: s.notes, custom: s.custom, position: s.position, prefs: s.prefs });
  }

  function _refreshUI() {
    var s       = G6.state.get();
    var posInfo = document.getElementById('posInfo');
    if (posInfo) {
      if (s.position) {
        posInfo.textContent = 'Position: (' + Math.round(s.position.x) + ', ' + Math.round(s.position.y) + ')';
        posInfo.hidden = false;
      } else {
        posInfo.hidden = true;
      }
    }
    var clearPosBtn = document.getElementById('clearPosBtn');
    if (clearPosBtn) clearPosBtn.hidden = !s.position;
    var clearDestBtn = document.getElementById('clearDestBtn');
    if (clearDestBtn) clearDestBtn.hidden = !s.destination;
  }

  window.G6 = G6;
  return {
    startPlacePosition: startPlacePosition,
    clearPosition:      clearPosition,
    setDestination:     setDestination,
    clearDestination:   clearDestination,
    refreshUI:          _refreshUI
  };

})();

window.G6 = G6;
