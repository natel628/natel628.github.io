'use strict';
var G6 = window.G6 || {};

G6.map = (function () {

  var _map    = null;
  var BOUNDS  = [[-9000, -11000], [11000, 4000]];

  function init() {
    _map = L.map('map', {
      crs:               L.CRS.Simple,
      minZoom:           -4,
      maxZoom:            1,
      zoomSnap:           0.25,
      zoomDelta:          0.5,
      wheelPxPerZoomLevel: 90,
      maxBoundsViscosity:  0.9,
      zoomControl:         false,
      attributionControl:  false
    });

    _map.setMaxBounds(BOUNDS);

    // ── Tile layer ─────────────────────────────────────────
    // GTADB public tile endpoint (CC BY 4.0, YANIS V17 nocams/dark).
    // zoomOffset maps Leaflet zoom -4…1 onto GTADB zoom 0…5.
    // TMS is false here because GTADB uses XYZ (top-down) ordering.
    var tileUrl = 'https://map.gtadb.org/tiles/YANIS/v17/nocams/dark/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      tileSize:     256,
      noWrap:       true,
      minZoom:      -4,
      maxZoom:       1,
      zoomOffset:    4,          // Leaflet z -4 → tile z 0, Leaflet z 0 → tile z 4
      bounds:        BOUNDS,
      keepBuffer:    2,
      crossOrigin:   'anonymous',
      errorTileUrl:  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    }).addTo(_map);

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
