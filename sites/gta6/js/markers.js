'use strict';
var G6 = window.G6 || {};

G6.markers = (function () {

  var _locLayer    = null;
  var _custLayer   = null;
  var _posMarker   = null;
  var _destLine    = null;
  var _markerMap   = {};   // id → L.marker
  var _clusterMap  = {};   // "kx:ky" → L.marker
  var _mapRef      = null;
  var _lastLocs    = null;  // kept so zoom changes can re-bucket without a state change
  var _lastState   = null;
  var _locIndex    = null;  // id → location, rebuilt once per render
  var _view        = null;  // current viewport, padded; pins outside it are not built

  // 531 pins at once is a wall of ink, so above this zoom they are bucketed into
  // world-pixel cells (not screen cells: panning must not reshuffle them).
  var CLUSTER_MAX_ZOOM = -1;
  var CLUSTER_CELL     = 46;   // px per bucket at the current zoom level
  var CLUSTER_NEUTRAL  = '#8f99a8';

  // 5,000 pins over a phone-sized map is a pile of circles that hides the
  // island, so small viewports bucket harder and draw smaller discs. Returns
  // the bucket size in px and the icon scale.
  function _clusterShape() {
    var w = _mapRef ? _mapRef.getSize().x : 1200;
    if (w < 640)  return { cell: 92, scale: 0.74 };
    if (w < 1000) return { cell: 66, scale: 0.86 };
    return { cell: CLUSTER_CELL, scale: 1 };
  }

  // CSS custom property colour lookup (cached after first read)
  var _colCache    = {};

  function _catColor(cat) {
    if (_colCache[cat]) return _colCache[cat];
    var tmp = document.createElement('span');
    tmp.style.cssText = 'position:absolute;width:0;height:0';
    tmp.setAttribute('style', 'color:var(--cat-' + cat + ',#7fd1ff)');
    document.body.appendChild(tmp);
    _colCache[cat] = getComputedStyle(tmp).color || '#7fd1ff';
    document.body.removeChild(tmp);
    return _colCache[cat];
  }

  function _makeIcon(loc, isFound, isSelected) {
    var cat   = loc.category;
    var tier  = loc.verification || 'community';
    var color = 'var(--cat-' + cat + ', #7fd1ff)';

    var cls = ['g6-pin'];
    if (isFound)    cls.push('found');
    if (isSelected) cls.push('selected');

    // The SVG use-href works from a served file (not file://)
    var html =
      '<div class="' + cls.join(' ') + '" data-tier="' + tier + '" data-cat="' + cat +
      '" style="--pin-color:' + color + ';--pin-border:rgba(0,0,0,.35)">' +
      '<svg class="g6-pin-icon" viewBox="0 0 30 38" aria-hidden="true" focusable="false">' +
      '<use href="assets/icons/sprite.svg#pin-' + cat + '"/>' +
      '</svg></div>';

    return L.divIcon({
      html:        html,
      className:   '',
      iconSize:    [30, 38],
      iconAnchor:  [15, 36],
      popupAnchor: [0, -38]
    });
  }

  function _makeCustomIcon(pin) {
    var html =
      '<div class="g6-pin g6-pin--custom" data-tier="community" style="--pin-color:var(--g6-accent)">' +
      '<svg class="g6-pin-icon" viewBox="0 0 30 38" aria-hidden="true" focusable="false">' +
      '<use href="assets/icons/sprite.svg#pin-custom"/>' +
      '</svg></div>';
    return L.divIcon({ html: html, className: '', iconSize: [30, 38], iconAnchor: [15, 36] });
  }

  function _makePosIcon() {
    var html =
      '<div class="g6-pin g6-pin--position" style="--pin-color:var(--g6-accent-2)">' +
      '<svg class="g6-pin-icon" viewBox="0 0 30 30" aria-hidden="true" focusable="false">' +
      '<use href="assets/icons/sprite.svg#pin-position"/>' +
      '</svg></div>';
    return L.divIcon({ html: html, className: '', iconSize: [30, 30], iconAnchor: [15, 15] });
  }

  // ── Clustering ────────────────────────────────────────────
  // A bucket of one renders as the normal pin; anything larger renders as a
  // count disc. Coloured discs mean every pin under them shares one category;
  // grey means a mixture, so the colour never claims something untrue.
  function _makeClusterIcon(n, cats, allFound, scale) {
    var names = Object.keys(cats);
    var color = names.length === 1 ? _catColor(names[0]) : CLUSTER_NEUTRAL;
    var base  = n >= 100 ? 58 : n >= 25 ? 50 : n >= 10 ? 44 : 38;
    var size  = Math.round(base * (scale || 1));
    var cls   = ['g6-cluster'];
    if (names.length > 1) cls.push('is-mixed');
    if (allFound)         cls.push('is-found');

    var html =
      '<div class="' + cls.join(' ') + '" style="--pin-color:' + color +
      ';width:' + size + 'px;height:' + size + 'px">' +
      (n > 99 ? '99+' : n) + '</div>';

    return L.divIcon({
      html:       html,
      className:  '',
      iconSize:   [size, size],
      iconAnchor: [size / 2, size / 2]
    });
  }

  function _indexById(locations) {
    var idx = {};
    for (var i = 0; i < locations.length; i++) idx[locations[i].id] = locations[i];
    return idx;
  }

  // With 3,000 pins, the whole dataset is never in the DOM: only what the
  // padded viewport covers. Panning re-runs render(), which adds the ones that
  // came into view and drops the ones that left.
  function _inView(latlng) {
    return !_view || _view.contains(latlng);
  }

  function _clearClusters() {
    Object.keys(_clusterMap).forEach(function (k) {
      _locLayer.removeLayer(_clusterMap[k]);
      delete _clusterMap[k];
    });
  }

  function _renderClustered(locations, state, zoom) {
    var found      = state.found      || {};
    var selectedId = state.selectedId;
    var visibleIds = state.visibleIds || new Set();
    var idx        = _indexById(locations);
    var singles    = {};
    var buckets    = {};
    var shape      = _clusterShape();
    var cell       = shape.cell;

    visibleIds.forEach(function (id) {
      var loc = idx[id];
      if (!loc || !G6.geo.inCrop(loc.position.x, loc.position.y)) return;
      // The selected record always keeps its own pin, even inside a dense cell,
      // so picking a row in the rail still shows where that pin is.
      if (id === selectedId) { singles[id] = loc; return; }
      if (!_inView(G6.geo.toLatLng(loc.position.x, loc.position.y))) return;

      var p   = _mapRef.project(G6.geo.toLatLng(loc.position.x, loc.position.y), zoom);
      var key = Math.floor(p.x / cell) + ':' + Math.floor(p.y / cell);
      var b   = buckets[key];
      if (!b) {
        b = buckets[key] = { n: 0, x: 0, y: 0, ids: [], cats: {}, allFound: true };
      }
      b.n++;
      b.x += loc.position.x;
      b.y += loc.position.y;
      b.ids.push(id);
      b.cats[loc.category] = (b.cats[loc.category] || 0) + 1;
      if (!found[id]) b.allFound = false;
    });

    // Buckets of one become ordinary pins; keep them out of the cluster pass.
    // Buckets outside the viewport are dropped before any marker is built.
    Object.keys(buckets).forEach(function (key) {
      var b = buckets[key];
      if (b.n === 1) {
        singles[b.ids[0]] = idx[b.ids[0]];
        delete buckets[key];
      } else if (!_inView(G6.geo.toLatLng(b.x / b.n, b.y / b.n))) {
        delete buckets[key];
      }
    });

    // Pins
    Object.keys(_markerMap).forEach(function (id) {
      if (!singles[id]) {
        _locLayer.removeLayer(_markerMap[id]);
        delete _markerMap[id];
      }
    });
    Object.keys(singles).forEach(function (id) {
      var loc    = singles[id];
      var isSel  = id === selectedId;
      var icon   = _makeIcon(loc, !!found[id], isSel);
      var latlng = G6.geo.toLatLng(loc.position.x, loc.position.y);
      if (_markerMap[id]) {
        _markerMap[id].setIcon(icon);
        _markerMap[id].setZIndexOffset(isSel ? 1000 : 0);
      } else {
        var marker = L.marker(latlng, { icon: icon, title: loc.name, keyboard: true,
                                        zIndexOffset: isSel ? 1000 : 0 });
        (function (locId) {
          marker.on('click', function () { G6.state.set({ selectedId: locId }); });
        }(id));
        marker.addTo(_locLayer);
        _markerMap[id] = marker;
      }
    });

    // Cluster discs
    Object.keys(_clusterMap).forEach(function (key) {
      if (!buckets[key]) {
        _locLayer.removeLayer(_clusterMap[key]);
        delete _clusterMap[key];
      }
    });
    Object.keys(buckets).forEach(function (key) {
      var b   = buckets[key];
      var cx  = b.x / b.n;
      var cy  = b.y / b.n;
      var lat = G6.geo.toLatLng(cx, cy);
      var icon = _makeClusterIcon(b.n, b.cats, b.allFound, shape.scale);
      var label = b.n + ' locations \u00b7 ' +
                  (Object.keys(b.cats).length === 1 ? Object.keys(b.cats)[0].replace(/-/g, ' ')
                                                    : Object.keys(b.cats).length + ' categories') +
                  ' \u00b7 click to zoom in';

      if (_clusterMap[key]) {
        _clusterMap[key].setLatLng(lat);
        _clusterMap[key].setIcon(icon);
      } else {
        var cm = L.marker(lat, { icon: icon, title: label, keyboard: true });
        cm.on('click', function () {
          // Read the zoom and position at click time: a marker that survived a
          // zoom level keeps its handler, so a captured zoom would be stale.
          var from = _mapRef.getZoom();
          // Stop at whichever basemap is showing: the community art ends at 0,
          // the in-game one at 1 (see TILE_SETS in map.js).
          _mapRef.flyTo(cm.getLatLng(), Math.min(from + 2, _mapRef.getMaxZoom()), { duration: 0.5 });
        });
        cm.addTo(_locLayer);
        _clusterMap[key] = cm;
      }
    });
  }

  function render(locations, state) {
    if (!_locLayer) return;

    _lastLocs  = locations;
    _lastState = state;
    _locIndex  = _indexById(locations);
    _view      = _mapRef ? _mapRef.getBounds().pad(0.25) : null;

    var zoom = _mapRef ? _mapRef.getZoom() : 0;
    if (_mapRef && zoom <= CLUSTER_MAX_ZOOM) {
      _renderClustered(locations, state, zoom);
      return;
    }

    _clearClusters();
    _renderPins(locations, state);
  }

  function _renderPins(locations, state) {
    var found      = state.found      || {};
    var selectedId = state.selectedId;
    var visibleIds = state.visibleIds || new Set();

    // Remove markers that are filtered out or have left the viewport
    Object.keys(_markerMap).forEach(function (id) {
      if (!visibleIds.has(id) || !_inView(_markerMap[id].getLatLng())) {
        _locLayer.removeLayer(_markerMap[id]);
        delete _markerMap[id];
      }
    });

    // Add / update visible markers
    visibleIds.forEach(function (id) {
      var loc = _locIndex ? _locIndex[id] : null;
      if (!loc) return;
      if (!G6.geo.inCrop(loc.position.x, loc.position.y)) return;

      var isFound    = !!found[id];
      var isSelected = id === selectedId;
      var latlng     = G6.geo.toLatLng(loc.position.x, loc.position.y);
      if (!_inView(latlng)) return;

      if (_markerMap[id]) {
        _markerMap[id].setIcon(_makeIcon(loc, isFound, isSelected));
        _markerMap[id].setZIndexOffset(isSelected ? 1000 : 0);
      } else {
        var marker = L.marker(latlng, {
          icon:         _makeIcon(loc, isFound, isSelected),
          title:        loc.name,
          keyboard:     true,
          zIndexOffset: isSelected ? 1000 : 0
        });
        (function (locId) {
          marker.on('click', function () {
            G6.state.set({ selectedId: locId });
          });
        }(id));
        marker.addTo(_locLayer);
        _markerMap[id] = marker;
      }
    });
  }

  function renderCustom(pins) {
    if (!_custLayer) return;
    _custLayer.clearLayers();
    (pins || []).forEach(function (pin) {
      if (!G6.geo.inCrop(pin.x, pin.y)) return;
      var marker = L.marker(G6.geo.toLatLng(pin.x, pin.y), {
        icon:  _makeCustomIcon(pin),
        title: pin.name || 'Custom pin'
      });
      (function (pinId) {
        marker.on('click', function () {
          G6.state.set({ selectedId: 'custom:' + pinId });
        });
      }(pin.id));
      marker.addTo(_custLayer);
    });
  }

  function setPosition(x, y) {
    var map = G6.map.getMap();
    if (!map) return;
    if (_posMarker) { map.removeLayer(_posMarker); _posMarker = null; }
    if (x === null || x === undefined) return;
    _posMarker = L.marker(G6.geo.toLatLng(x, y), {
      icon:         _makePosIcon(),
      title:        'My Position',
      zIndexOffset: 2000
    }).addTo(map);
  }

  function drawRoute(fromX, fromY, toX, toY) {
    var map = G6.map.getMap();
    if (!map) return;
    if (_destLine) { map.removeLayer(_destLine); _destLine = null; }
    if (fromX === null || fromX === undefined || toX === null || toX === undefined) return;

    var dist  = G6.geo.distance(fromX, fromY, toX, toY);
    var midX  = (fromX + toX) / 2;
    var midY  = (fromY + toY) / 2;
    var label = G6.geo.formatDistance(dist) + '<br><small>Straight-line \u00b7 not a road route</small>';

    _destLine = L.polyline([
      G6.geo.toLatLng(fromX, fromY),
      G6.geo.toLatLng(toX,   toY)
    ], {
      color:     '#ff3d7f',
      weight:     2,
      dashArray: '8 6',
      opacity:    0.85
    }).addTo(map);

    _destLine.bindTooltip(label, {
      permanent:  true,
      className:  'g6-dist-tooltip',
      direction:  'top'
    });
    _destLine.openTooltip(G6.geo.toLatLng(midX, midY));
  }

  function init(map) {
    _mapRef    = map;
    _locLayer  = L.layerGroup().addTo(map);
    _custLayer = L.layerGroup().addTo(map);

    // Buckets are computed per zoom level and pins are culled to the viewport,
    // so re-run the last render when the zoom or the viewport changes.
    map.on('zoomend', function () {
      if (_lastLocs) render(_lastLocs, _lastState);
    });
    map.on('moveend', function () {
      if (_lastLocs) render(_lastLocs, _lastState);
    });
  }

  window.G6 = G6;
  return {
    init:         init,
    render:       render,
    renderCustom: renderCustom,
    setPosition:  setPosition,
    drawRoute:    drawRoute
  };

})();

window.G6 = G6;
