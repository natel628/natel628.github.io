'use strict';
var G6 = window.G6 || {};

G6.geo = (function () {

  var FRAME = {
    xMin: -17000, yMin: -9000,
    xMax: 4000,   yMax: 11000,
    metersPerUnit: 1.0
  };

  var CROP = {
    xMin: -11000, yMin: -9000,
    xMax: 4000,   yMax: 11000
  };

  // CRS.Simple: lat = y, lng = x
  function toLatLng(x, y) {
    return L.latLng(y, x);
  }

  function fromLatLng(latlng) {
    return { x: latlng.lng, y: latlng.lat };
  }

  function distance(x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function formatDistance(metres) {
    if (metres < 1000) return Math.round(metres) + '\u202fm';
    return (metres / 1000).toFixed(1) + '\u202fkm';
  }

  function inCrop(x, y) {
    return x >= CROP.xMin && x <= CROP.xMax && y >= CROP.yMin && y <= CROP.yMax;
  }

  window.G6 = G6;
  return { FRAME: FRAME, CROP: CROP, toLatLng: toLatLng, fromLatLng: fromLatLng,
           distance: distance, formatDistance: formatDistance, inCrop: inCrop };

})();

window.G6 = G6;
