'use strict';
var G6 = window.G6 || {};

G6.markers = (function () {

  var _locLayer    = null;
  var _custLayer   = null;
  var _posMarker   = null;
  var _destLine    = null;
  var _markerMap   = {};   // id → L.marker

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

  function render(locations, state) {
    if (!_locLayer) return;

    var found      = state.found      || {};
    var selectedId = state.selectedId;
    var visibleIds = state.visibleIds || new Set();

    // Remove markers no longer visible
    Object.keys(_markerMap).forEach(function (id) {
      if (!visibleIds.has(id)) {
        _locLayer.removeLayer(_markerMap[id]);
        delete _markerMap[id];
      }
    });

    // Add / update visible markers
    visibleIds.forEach(function (id) {
      var loc = null;
      for (var i = 0; i < locations.length; i++) {
        if (locations[i].id === id) { loc = locations[i]; break; }
      }
      if (!loc) return;
      if (!G6.geo.inCrop(loc.position.x, loc.position.y)) return;

      var isFound    = !!found[id];
      var isSelected = id === selectedId;
      var latlng     = G6.geo.toLatLng(loc.position.x, loc.position.y);

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
    _locLayer  = L.layerGroup().addTo(map);
    _custLayer = L.layerGroup().addTo(map);
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
