'use strict';
var G6 = window.G6 || {};

G6.state = (function () {

  var _state = {
    locations:   [],
    categories:  [],
    regions:     [],
    visibleIds:  new Set(),
    selectedId:  null,
    found:       {},
    notes:       {},
    custom:      [],
    position:    null,
    destination: null,
    prefs: {
      categories:   null,     // null = all enabled
      verification: ['official', 'community', 'estimate'],
      hideFound:    false,
      search:       '',
      baseMap:      'community'   // 'community' (YANIS) | 'ingame'
    }
  };

  var _subs = {};

  function get() {
    return _state;
  }

  function set(partial) {
    Object.assign(_state, partial);
    _notify('change', _state);
  }

  function subscribe(event, fn) {
    if (!_subs[event]) _subs[event] = [];
    _subs[event].push(fn);
    return function () {
      _subs[event] = _subs[event].filter(function (f) { return f !== fn; });
    };
  }

  function _notify(event, data) {
    var handlers = _subs[event] || [];
    handlers.forEach(function (fn) { fn(data); });
  }

  window.G6 = G6;
  return { get: get, set: set, subscribe: subscribe };

})();

window.G6 = G6;
