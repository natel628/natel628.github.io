'use strict';
var G6 = window.G6 || {};

G6.map = (function () {

  var _map    = null;
  var BOUNDS  = [[-9000, -11000], [11000, 4000]];

  function init() {
    _map = L.map('map', {
      crs:               L.CRS.Simple,
      minZoom:           -6,   // low enough for fitBounds to show all of Leonida on a phone
      maxZoom:            1,
      zoomSnap:           0.25,
      zoomDelta:          0.5,
      wheelPxPerZoomLevel: 90,
      maxBoundsViscosity:  0.9,
      zoomControl:         false,
      attributionControl:  false
    });

    _map.setMaxBounds(BOUNDS);

    // ── Base map ───────────────────────────────────────────
    // No remote tile layer. The GTADB endpoint referenced by HANDOFF.md
    // (map.gtadb.org/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png) returns 404
    // for every tile, and the live service (maps.gtadb.org/tiles/<v>/<path>/
    // <z>/<z>,<y>,<x>.jpg) uses a proprietary per-zoom tile pyramid that can
    // not be re-pointed at CRS.Simple without data we do not have. Markers
    // therefore plot on the dark grid background (see css/map.css).

    _map.fitBounds(BOUNDS, { padding: [8, 8] });

    // ── Zoom tier class ────────────────────────────────────
    function updateZoomClass() {
      var z  = _map.getZoom();
      var el = document.getElementById('map');
      el.classList.remove('g6-zoom-far', 'g6-zoom-mid', 'g6-zoom-near');
      if      (z <= -3)  el.classList.add('g6-zoom-far');
      else if (z <= -1)  el.classList.add('g6-zoom-mid');
      else               el.classList.add('g6-zoom-near');
    }

    _map.on('zoomend', updateZoomClass);
    updateZoomClass();

    // ── Scale control ──────────────────────────────────────
    L.control.scale({
      position:     'bottomright',
      metric:       true,
      imperial:     false,
      maxWidth:     100
    }).addTo(_map);

    return _map;
  }

  function getMap() { return _map; }

  function fitAll() {
    if (_map) _map.fitBounds(BOUNDS, { padding: [8, 8] });
  }

  function flyTo(x, y, zoom) {
    if (_map) _map.flyTo(G6.geo.toLatLng(x, y), zoom != null ? zoom : -1, { duration: 0.8 });
  }

  function invalidate() {
    if (_map) {
      setTimeout(function () { _map.invalidateSize({ animate: false }); }, 50);
    }
  }

  window.G6 = G6;
  return { init: init, getMap: getMap, fitAll: fitAll, flyTo: flyTo, invalidate: invalidate };

})();

window.G6 = G6;
