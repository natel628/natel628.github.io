'use strict';
var G6 = window.G6 || {};

G6.map = (function () {

  var _map    = null;
  var BOUNDS  = [[-9000, -11000], [11000, 4000]];

  // ── Base map tiles ───────────────────────────────────────
  // YANIS V18 artwork (CC BY 4.0) mirrored from the gtadb.org repository.
  // The pyramid spans -16384…16384 m on both axes with 256 px tiles; at level
  // z there are 2^(z+2) tiles per side and z5 is exactly 1 px per metre, so a
  // world point (x, y) sits at pixel ((x+16384)·2^(z-5), (16384-y)·2^(z-5)).
  // Files are named <z>/<z>,<y>,<x>.jpg — not the standard XYZ order.
  var TILE_BASE = 'https://cdn.jsdelivr.net/gh/rolux/gtadb.org@main/maps/tiles/6/';
  var GRID_HALF = 16384;
  var GRID_TILE = 256;

  // Two published pyramids share the same grid and naming. maxLevel differs:
  // the in-game map is published up to z6 (2 px/m), the community map to z5.
  var TILE_SETS = {
    community: { path: 'yanis,18', maxLevel: 5 },
    ingame:    { path: 'day',      maxLevel: 6 }
  };

  var _baseSet   = 'community';
  var _baseLayer = null;

  var BaseTiles = L.GridLayer.extend({

    createTile: function (coords) {
      var tile = document.createElement('div');
      tile.className = 'g6-tile';

      var set = TILE_SETS[_baseSet] || TILE_SETS.community;

      // Metres covered by this Leaflet tile, and the pyramid level that best fits.
      var span = GRID_TILE / Math.pow(2, coords.z);
      var level = Math.min(Math.max(coords.z + 5, 0), set.maxLevel);
      var ppm  = Math.pow(2, level - 5);          // gtadb pixels per metre

      // This tile's corner, converted into pyramid pixels.
      var gx = (coords.x * span + GRID_HALF) * ppm;
      var gy = (GRID_HALF + coords.y * span) * ppm;
      var side = span * ppm;                      // pyramid pixels this tile needs

      var n  = Math.pow(2, level + 2);
      var tx = Math.floor((gx + side / 2) / GRID_TILE);
      var ty = Math.floor((gy + side / 2) / GRID_TILE);
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) return tile;

      // Crop the covering tile to this slot, so any zoom level (including the
      // upscaled top of the pyramid) still lands in the right place.
      var scale = GRID_TILE / side;
      tile.style.backgroundImage    = 'url(' + TILE_BASE + set.path + '/' + level + '/' + level +
                                      ',' + ty + ',' + tx + '.jpg)';
      tile.style.backgroundSize     = (GRID_TILE * scale) + 'px ' + (GRID_TILE * scale) + 'px';
      tile.style.backgroundPosition = (-(tx * GRID_TILE - gx) * scale) + 'px ' +
                                      (-(ty * GRID_TILE - gy) * scale) + 'px';
      return tile;
    }
  });

  function init() {
    _map = L.map('map', {
      crs:               L.CRS.Simple,
      minZoom:           -5,   // lowest level the published tile pyramid covers (32 m/px)
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
    _baseLayer = createBaseLayer();

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

  function createBaseLayer() {
    return new BaseTiles({
      tileSize: GRID_TILE,
      minZoom:  -5,
      maxZoom:   1,
      noWrap:   true,
      bounds:   BOUNDS
    }).addTo(_map);
  }

  // Switch between the community artwork and the in-game map. Both pyramids use
  // the same grid, so only the path segment changes.
  function setBaseMap(id) {
    if (!TILE_SETS[id] || id === _baseSet) return;
    _baseSet = id;
    if (_map && _baseLayer) _map.removeLayer(_baseLayer);
    if (_map) _baseLayer = createBaseLayer();
  }

  function getBaseMap() { return _baseSet; }

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
  return { init: init, getMap: getMap, fitAll: fitAll, flyTo: flyTo, invalidate: invalidate,
           setBaseMap: setBaseMap, getBaseMap: getBaseMap };

})();

window.G6 = G6;
