'use strict';
var G6 = window.G6 || {};

G6.data = (function () {

  var CAT_MAP = { cash: 'stash', collect: 'collectible', code: 'stash', weapons: 'weapon' };

  function fetchJSON(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status + ' — ' + url);
      return r.json();
    });
  }

  // `sourceSet` says where the records came from. The hand-written file is one
  // group of its own; each bulk record belongs to the GTABase feature layer it
  // was imported from (hidden-package, safe, yellow-loot-box, …), which is what
  // the importer names in `_gb.category`. Categories stay the map legend and are
  // not used as groups: one category holds six different collectible sets.
  function normalise(raw, catIds, sourceSet) {
    var locs = Array.isArray(raw) ? raw : (raw.locations || raw.collections || []);
    return locs.map(function (loc) {
      var cat = loc.category || CAT_MAP[loc.cat] || loc.cat || 'landmark';
      var setId = sourceSet === 'curated'
        ? 'curated'
        : ((loc._gb && loc._gb.category) || sourceSet || 'other');
      if (catIds.indexOf(cat) === -1) cat = 'landmark';

      var pos = loc.position || { x: 0, y: 0, method: 'estimated', accuracy: 999 };

      var verif = loc.verification || loc.confidence || 'community';
      if (verif === 'community-reported') verif = 'community';

      return {
        id:           loc.id,
        name:         loc.name || '',
        setId:        setId,
        setLabel:     '',
        category:     cat,
        region:       loc.region || '',
        county:       loc.county || '',
        position:     pos,
        verification: verif,
        summary:      loc.summary || loc.how || '',
        hint:         loc.hint   || loc.how || '',
        tips:         loc.tips   || [],
        rewards:      loc.rewards || loc.loot || [],
        code:         loc.code   || null,
        risk:         loc.risk   || null,
        sources:      loc.sources || []
      };
    });
  }

  function buildIndex(locations) {
    return locations.map(function (loc) {
      return {
        id:   loc.id,
        text: [loc.name, loc.summary, loc.hint, loc.region, loc.category,
               (loc.rewards || []).join(' ')].join(' ').toLowerCase()
      };
    });
  }

  function search(query, index) {
    if (!query || !query.trim()) return null; // null = all
    var q = query.trim().toLowerCase();
    var results = [];
    index.forEach(function (item) {
      if (item.text.indexOf(q) !== -1) results.push(item.id);
    });
    return results;
  }

  // Bump DATA_V whenever the JSON in data/ changes. GitHub Pages caches files for
  // ten minutes, so without this returning visitors keep seeing the old dataset
  // long after a deploy. Every file in data/ rides on it.
  var DATA_V = '19';

  function load(basePath) {
    var base = (basePath || '.').replace(/\/$/, '');
    var v    = '?v=' + DATA_V;
    return Promise.all([
      fetchJSON(base + '/data/locations.json' + v),
      fetchJSON(base + '/data/categories.json' + v),
      fetchJSON(base + '/data/regions.json' + v),
      fetchJSON(base + '/data/credits.json' + v),
      fetchJSON(base + '/data/collections.json' + v),
      fetchJSON(base + '/data/sets.json' + v)
    ]).then(function (results) {
      var rawLocs   = results[0];
      var catsData  = results[1];
      var regData   = results[2];
      var creds     = results[3];
      var rawColls  = results[4];
      var setsData  = results[5];

      var categories = catsData.categories || catsData;
      var catIds     = categories.map(function (c) { return c.id; });
      var regions    = regData.regions || [];
      var counties   = regData.counties || [];
      var credits    = creds.entries || [];

      // Curated records first, then the bulk collectible/challenge pins, so the
      // hand-written entries keep their order in the list and search results.
      var setDefs  = setsData.sets || [];
      var setNames = {};
      setDefs.forEach(function (s) {
        if (s && s.id) setNames[s.id] = s.label || s.id;
      });

      var locations = normalise(rawLocs, catIds, 'curated')
        .concat(normalise(rawColls, catIds, 'bulk'));
      locations.forEach(function (l) {
        l.setLabel = setNames[l.setId] || l.setId;
      });
      var index     = buildIndex(locations);

      return {
        locations:  locations,
        categories: categories,
        regions:    regions,
        counties:   counties,
        credits:    credits,
        sets:       setDefs,
        index:      index
      };
    });
  }

  window.G6 = G6;
  return { load: load, search: search };

})();

window.G6 = G6;
