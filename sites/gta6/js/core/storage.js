'use strict';
var G6 = window.G6 || {};

G6.storage = (function () {

  var PREFIX = 'gta6:';

  function save(key, data) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(data));
    } catch (e) {}
  }

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(PREFIX + key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch (e) {}
  }

  function loadProgress() {
    var def = { found: {}, notes: {}, custom: [], position: null, prefs: {} };
    return Object.assign(def, load('progress:1', {}));
  }

  function saveProgress(progress) {
    save('progress:1', progress);
  }

  function hasMigrated() {
    return !!load('migrated:v3', false);
  }

  function migrateFromV3(locations) {
    // Try both the v3 key and the old key
    var oldFound = null;
    try {
      var raw = localStorage.getItem('gta6.found.v3') || localStorage.getItem('gta6.found');
      if (raw) oldFound = JSON.parse(raw);
    } catch (e) {}
    if (!oldFound) { save('migrated:v3', true); return {}; }
    var ids = locations.map(function (l) { return l.id; });
    var migrated = {};
    Object.keys(oldFound).forEach(function (id) {
      if (ids.indexOf(id) !== -1) migrated[id] = oldFound[id];
    });
    save('migrated:v3', true);
    return migrated;
  }

  function exportProgress(progress) {
    var json = JSON.stringify(progress, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gta6-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function importProgress(json, locationIds) {
    try {
      var data = JSON.parse(json);
      if (!data || typeof data !== 'object') return null;

      var found = {};
      if (data.found && typeof data.found === 'object') {
        Object.keys(data.found).forEach(function (id) {
          if (locationIds.indexOf(id) !== -1) found[id] = data.found[id];
        });
      }

      var notes = {};
      if (data.notes && typeof data.notes === 'object') {
        Object.keys(data.notes).forEach(function (id) {
          if (typeof data.notes[id] === 'string')
            notes[id] = data.notes[id].slice(0, 500);
        });
      }

      var custom = [];
      if (Array.isArray(data.custom)) {
        data.custom.forEach(function (pin) {
          if (pin && typeof pin.x === 'number' && typeof pin.y === 'number' &&
              pin.x >= -11000 && pin.x <= 4000 && pin.y >= -9000 && pin.y <= 11000) {
            custom.push({
              id: 'c-' + Math.random().toString(36).slice(2, 8),
              name: String(pin.name || 'Custom pin').slice(0, 60),
              x: pin.x, y: pin.y,
              note: pin.note ? String(pin.note).slice(0, 500) : null
            });
          }
        });
      }

      return { found: found, notes: notes, custom: custom };
    } catch (e) {
      return null;
    }
  }

  window.G6 = G6;
  return {
    save: save, load: load, remove: remove,
    loadProgress: loadProgress, saveProgress: saveProgress,
    hasMigrated: hasMigrated, migrateFromV3: migrateFromV3,
    exportProgress: exportProgress, importProgress: importProgress
  };

})();

window.G6 = G6;
