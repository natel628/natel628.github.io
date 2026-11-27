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
  var TILE_PATH = 'rolux/gtadb.org@main/maps/tiles/6/';
  var TILE_BASE = 'https://cdn.jsdelivr.net/gh/' + TILE_PATH;
  // Same repository through GitHub itself, used when jsDelivr refuses a burst.
  var TILE_FALLBACK = 'https://raw.githubusercontent.com/' +
                      TILE_PATH.replace('@main', '/main');
  var GRID_HALF = 16384;
  var GRID_TILE = 256;

  // Two published pyramids share the same grid and naming. maxLevel differs:
  // the in-game map is published up to z6 (2 px/m), the community map to z5
  // (1 px/m). maxZoom is the deepest Leaflet zoom that still shows the artwork
  // at 1:1 — z = maxLevel - 5 — because zooming past it does not reveal more
  // detail, it just blows the pixels up. The community art at zoom 1 was being
  // drawn at 2x for nothing, which is what made the labels look huge and soft.
  var TILE_SETS = {
    community: { path: 'yanis,18', maxLevel: 5, maxZoom: 0 },
    ingame:    { path: 'day',      maxLevel: 6, maxZoom: 1 }
  };

  var _baseSet   = 'community';
  var _baseLayer = null;

  // One artwork tile per slot, loaded as an <img> so a failure is visible to the
  // code and can be retried. The old version used a CSS background, which fails
  // silently: a throttled request left that cell permanently black with nothing
  // in the console, which is what "the map has holes when you zoom" was.
  //
  // Two extra attempts are made before giving up: the same file with a cache
  // busting query, then the same repository served by GitHub.
  var BaseTiles = L.GridLayer.extend({

    createTile: function (coords, done) {
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
      if (tx < 0 || ty < 0 || tx >= n || ty >= n) {
        // Outside the artwork entirely (the legend sheet, the map edge): say so
        // with a neutral edge tile rather than an empty one.
        tile.className = 'g6-tile is-edge';
        done(null, tile);
        return tile;
      }

      // Crop the covering tile to this slot, so any zoom level (including the
      // upscaled top of the pyramid) still lands in the right place.
      var scale = GRID_TILE / side;
      var rel   = set.path + '/' + level + '/' + level + ',' + ty + ',' + tx + '.jpg';

      var img = document.createElement('img');
      img.className  = 'g6-tile-img';
      img.alt        = '';
      img.draggable  = false;
      img.decoding   = 'async';
      // Crop offset. The slot starts `gx - tx*GRID_TILE` source pixels into the
      // tile, so the image has to be pulled LEFT by that much (times the zoom
      // scale). The sign here was inverted for as long as this layer existed: at
      // zooms where a slot aligns with a tile boundary the offset is 0 and it
      // looked correct, but at zoom 1 (community, 2x upscale) every second slot
      // got +128*2 px and pushed its image out of the box — the black bands
      // down the map.
      img.style.width  = (GRID_TILE * scale) + 'px';
      img.style.height = (GRID_TILE * scale) + 'px';
      img.style.left   = ((tx * GRID_TILE - gx) * scale) + 'px';
      img.style.top    = ((ty * GRID_TILE - gy) * scale) + 'px';
      tile.appendChild(img);

      var attempt = 0;
      function load(src) {
        img.onerror = function () {
          attempt++;
          if (attempt === 1) {
            // Usually a throttled burst: ask again, bypassing the cached miss.
            load(TILE_BASE + rel + (rel.indexOf('?') === -1 ? '?' : '&') + 'retry=1');
          } else if (attempt === 2) {
            // Second failure: the same repository from a different host.
            load(TILE_FALLBACK + rel);
          } else {
            // Detach first: a request still in flight can finish after we have
            // given up, and its onload would clear the hatch we just set.
            img.onload = img.onerror = null;
            img.remove();
            tile.className = 'g6-tile is-missing';
            done(null, tile);
          }
        };
        img.onload = function () {
          tile.classList.remove('is-missing');
          done(null, tile);
        };
        img.src = src;
      }
      load(TILE_BASE + rel);

      return tile;
    }
  });

  function init() {
    _map = L.map('map', {
      crs:               L.CRS.Simple,
      minZoom:           -5,   // lowest level the published tile pyramid covers (32 m/px)
      maxZoom:           TILE_SETS[_baseSet].maxZoom,   // 1:1 with the artwork, per basemap
      // Whole zoom levels only: fractional zooms make Leaflet scale the tile
      // layer, which opens hairline seams between the raster tiles.
      zoomSnap:           1,
      zoomDelta:          1,
      wheelPxPerZoomLevel: 90,
      maxBoundsViscosity:  0.9,
      zoomControl:         false,
      attributionControl:  false
    });

    _map.setMaxBounds(BOUNDS);

    // ── Base map ───────────────────────────────────────────
    _baseLayer = createBaseLayer();

    // The YANIS artwork carries its own legend sheet (follows/regions/credits/…)
    // east of the island, outside every coordinate we use. Mask it rather than
    // showing a poster inside the map.
    var maskPane = _map.createPane('g6mask');
    maskPane.style.zIndex = 250;            // above the tile pane, below markers
    maskPane.style.pointerEvents = 'none';
    L.rectangle([[-16384, 4050], [16384, 16384]], {
      pane:        'g6mask',
      interactive: false,
      stroke:      false,
      fillColor:   '#080a0f',
      fillOpacity: 1
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

  function createBaseLayer() {
    var set = TILE_SETS[_baseSet] || TILE_SETS.community;
    return new BaseTiles({
      tileSize: GRID_TILE,
      minZoom:  -5,
      maxZoom:   set.maxZoom,
      noWrap:   true,
      bounds:   BOUNDS,
      // Load after the zoom settles and keep a ring of spare tiles: a zoom no
      // longer fires 40 requests at once, which is what provoked the failures.
      updateWhenZooming: false,
      keepBuffer:  4,
      updateWhenIdle: false
    }).addTo(_map);
  }

  // Switch between the community artwork and the in-game map. Both pyramids use
  // the same grid, so only the path segment changes.
  function setBaseMap(id) {
    if (!TILE_SETS[id] || id === _baseSet) return;
    _baseSet = id;
    if (_map) {
      // The two artworks end at different depths: the community pyramid is
      // 1 px/m, the in-game one 2 px/m. Lowering maxZoom zooms out by one step
      // when needed, which is better than upscaling a map that has no more to
      // show.
      _map.setMaxZoom(TILE_SETS[id].maxZoom);
    }
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
