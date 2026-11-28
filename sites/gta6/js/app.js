'use strict';

(function () {

  // ── Hash routing ───────────────────────────────────────────
  function parseHash() {
    var h = location.hash.slice(1);
    var params = {};
    h.split('&').forEach(function (p) {
      var kv = p.split('=');
      if (kv[0]) params[kv[0]] = decodeURIComponent(kv[1] || '');
    });
    return params;
  }

  // ── Progress helpers ───────────────────────────────────────
  function saveProgress() {
    var s = G6.state.get();
    G6.storage.saveProgress({
      found:    s.found,
      notes:    s.notes,
      custom:   s.custom,
      position: s.position,
      prefs:    s.prefs
    });
  }

  // ── Progress ring update ───────────────────────────────────
  function updateProgressRing(found, locations) {
    var total = locations.length;

    // Walk the data and probe `found`, which is a plain id->mark object, so the
    // count is one pass: a pin counts only while it is still in the map, which
    // keeps stray ids in saved progress out. Truthiness is how the sets, marks
    // and filters already read the same object.
    var done = locations.filter(function (l) { return found[l.id]; }).length;

    var pct     = total > 0 ? Math.round((done / total) * 100) : 0;
    var circ    = 2 * Math.PI * 18;  // r=18

    var ringFill = document.getElementById('progressRingFill');
    var pctEl    = document.getElementById('progressPct');
    var subEl    = document.getElementById('progressSub');

    if (ringFill) {
      var offset = circ - (pct / 100) * circ;
      ringFill.style.strokeDashoffset = offset;
    }
    if (pctEl)  pctEl.textContent = pct + '%';
    if (subEl)  subEl.textContent = done + ' / ' + total + ' found';
  }

  // ── Build rail ─────────────────────────────────────────────
  function buildRail(data) {
    var state = G6.state.get();

    // Search
    var searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', G6.dom.debounce(function () {
        var val = searchInput.value;
        var clearBtn = document.getElementById('searchClear');
        if (clearBtn) clearBtn.classList.toggle('visible', !!val);
        var prefs = Object.assign({}, G6.state.get().prefs, { search: val });
        G6.state.set({ prefs: prefs });
        G6.filters.update(data.locations);
        saveProgress();
      }, 150));

      var clearBtn = document.getElementById('searchClear');
      if (clearBtn) {
        clearBtn.addEventListener('click', function () {
          searchInput.value = '';
          clearBtn.classList.remove('visible');
          var prefs = Object.assign({}, G6.state.get().prefs, { search: '' });
          G6.state.set({ prefs: prefs });
          G6.filters.update(data.locations);
          searchInput.focus();
        });
      }
    }

    // Set filters, then category filters: a set narrows to one named group,
    // categories stay the cross-cutting legend filter.
    _buildSetFilters(data);
    _buildCategoryFilters(data);

    // Verification toggle
    _buildVerifyToggle(data);

    // Base map artwork toggle
    _buildBaseMapToggle();
    _updateCredit();

    // Hide-found filter
    var hideFoundBtn = document.getElementById('hideFoundBtn');
    if (hideFoundBtn) {
      _syncHideFound(hideFoundBtn, state.prefs.hideFound);
      hideFoundBtn.addEventListener('click', function () {
        var s = G6.state.get();
        var newVal = !s.prefs.hideFound;
        var prefs = Object.assign({}, s.prefs, { hideFound: newVal });
        G6.state.set({ prefs: prefs });
        _syncHideFound(hideFoundBtn, newVal);
        G6.filters.update(data.locations);
        saveProgress();
      });
    }

    // Clear filters
    var clearFiltersBtn = document.getElementById('clearFiltersBtn');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', function () {
        _clearAllFilters(data);
      });
    }

    // Collapse toggle
    var collapseBtn = document.getElementById('railCollapseBtn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', function () {
        var app = document.querySelector('.app');
        var collapsed = app.classList.toggle('rail-collapsed');
        collapseBtn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        collapseBtn.textContent = collapsed ? '\u25B6' : '\u25C4';
        G6.map.invalidate();
      });
    }

    // Reset progress
    var resetBtn = document.getElementById('resetProgressBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        var s     = G6.state.get();
        var count = Object.keys(s.found).length;
        if (count === 0) { G6.dom.toast('No progress to reset', 'info'); return; }
        if (!confirm('Reset ' + count + ' discovered location(s) and all notes? This cannot be undone.')) return;
        G6.state.set({ found: {}, notes: {}, destination: null });
        G6.markers.drawRoute(null, null, null, null);
        saveProgress();
        G6.filters.update(data.locations);
        updateProgressRing({}, data.locations);
        G6.dom.toast('Progress reset', 'success');
      });
    }

    // Export
    var exportBtn = document.getElementById('exportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function () {
        var s = G6.state.get();
        G6.storage.exportProgress({ found: s.found, notes: s.notes, custom: s.custom, position: s.position });
        G6.dom.toast('Progress exported', 'success');
      });
    }

    // Import
    var importBtn   = document.getElementById('importBtn');
    var importInput = document.getElementById('importInput');
    if (importBtn && importInput) {
      importBtn.addEventListener('click', function () { importInput.click(); });
      importInput.addEventListener('change', function () {
        var file = importInput.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024) { G6.dom.toast('File too large (max 1 MB)', 'error'); return; }
        var reader = new FileReader();
        reader.onload = function (e) {
          var s       = G6.state.get();
          var locIds  = s.locations.map(function (l) { return l.id; });
          var result  = G6.storage.importProgress(e.target.result, locIds);
          if (!result) { G6.dom.toast('Invalid progress file', 'error'); return; }
          var merged = {
            found:    Object.assign({}, s.found, result.found),
            notes:    Object.assign({}, s.notes, result.notes),
            custom:   s.custom.concat(result.custom)
          };
          G6.state.set(merged);
          saveProgress();
          G6.filters.update(data.locations);
          updateProgressRing(merged.found, data.locations);
          G6.dom.toast('Progress imported', 'success');
        };
        reader.readAsText(file);
        importInput.value = '';
      });
    }

    // Navigation: set position
    var setPosBtn = document.getElementById('setPosBtn');
    if (setPosBtn) {
      setPosBtn.addEventListener('click', function () {
        G6.navigation.startPlacePosition();
        // Get the drawer out of the way of the map click that follows
        _setRailOpen(false);
      });
    }

    var clearPosBtn = document.getElementById('clearPosBtn');
    if (clearPosBtn) {
      clearPosBtn.addEventListener('click', G6.navigation.clearPosition);
    }

    var clearDestBtn = document.getElementById('clearDestBtn');
    if (clearDestBtn) {
      clearDestBtn.addEventListener('click', G6.navigation.clearDestination);
    }

    // Drop custom pin
    var dropPinBtn = document.getElementById('dropPinBtn');
    if (dropPinBtn) {
      dropPinBtn.addEventListener('click', function () {
        _startDropPin(data);
      });
    }

    G6.navigation.refreshUI();
  }

  function _syncHideFound(btn, active) {
    if (!btn) return;
    btn.classList.toggle('active', !!active);
    btn.setAttribute('aria-pressed', String(!!active));
    btn.textContent = active ? '✓ Hiding Found' : 'Hide Found';
  }

  function _buildCategoryFilters(data) {
    var container = document.getElementById('catFilters');
    if (!container) return;
    container.innerHTML = '';
    var state    = G6.state.get();
    var activeCats = state.prefs.categories;

    data.categories.forEach(function (cat) {
      var row = document.createElement('div');
      row.className = 'cat-row' + (activeCats && activeCats.indexOf(cat.id) === -1 ? ' disabled' : '');
      row.setAttribute('data-cat-id', cat.id);
      row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', String(!activeCats || activeCats.indexOf(cat.id) !== -1));
      row.setAttribute('tabindex', '0');

      var dot = document.createElement('span');
      dot.className = 'cat-row-dot';
      dot.style.background = cat.color;

      var label = document.createElement('span');
      label.className = 'cat-row-label';
      label.textContent = cat.label;

      var count = document.createElement('span');
      count.className = 'cat-row-count';
      count.id = 'catCount-' + cat.id;
      count.textContent = _countCat(data.locations, cat.id);

      var toggle = document.createElement('span');
      toggle.className = 'cat-toggle';
      toggle.style.setProperty('--cat-color', cat.color);

      row.appendChild(dot);
      row.appendChild(label);
      row.appendChild(count);
      row.appendChild(toggle);

      function handleToggle() {
        var s    = G6.state.get();
        var curr = s.prefs.categories ? s.prefs.categories.slice() : data.categories.map(function (c) { return c.id; });
        var idx  = curr.indexOf(cat.id);
        if (idx === -1) curr.push(cat.id);
        else            curr.splice(idx, 1);
        // If all selected, treat as null (all)
        var newCats = curr.length === data.categories.length ? null : (curr.length ? curr : null);
        var prefs   = Object.assign({}, s.prefs, { categories: newCats });
        G6.state.set({ prefs: prefs });
        G6.filters.update(data.locations);
        saveProgress();
        _syncCategoryUI(data.categories, newCats);
      }

      row.addEventListener('click', handleToggle);
      row.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); handleToggle(); }
      });

      container.appendChild(row);
    });
  }

  // Below 1100px the rail is a drawer and the ☰ button is the only way into the
  // category, set and verification filters, so one helper owns the drawer's
  // class, its overlay and the button's state; three callers (☰, the overlay,
  // picking a location) would otherwise leave them disagreeing.
  function _setRailOpen(open) {
    var rail = document.querySelector('.rail');
    if (!rail) return;
    rail.classList.toggle('open', open);
    var overlay = document.querySelector('.rail-overlay');
    if (overlay) overlay.classList.toggle('visible', open);
    var menuBtn = document.getElementById('menuBtn');
    if (menuBtn) menuBtn.setAttribute('aria-expanded', String(open));
  }

  // One reset behind every clear-all control: the rail pill and the mobile
  // sheet chip, so phones can clear filters too.
  function _clearAllFilters(data) {
    var prefs = Object.assign({}, G6.state.get().prefs, {
      categories:   null,
      set:          null,
      verification: ['official', 'community', 'estimate'],
      hideFound:    false,
      search:       ''
    });
    G6.state.set({ prefs: prefs });
    var searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    var searchClearBtn = document.getElementById('searchClear');
    if (searchClearBtn) searchClearBtn.classList.remove('visible');
    _syncHideFound(document.getElementById('hideFoundBtn'), false);
    _syncCategoryUI(data.categories, null);
    _syncVerifyUI(['official', 'community', 'estimate']);
    G6.filters.update(data.locations);
    saveProgress();
  }

  function _syncCategoryUI(categories, activeCats) {
    categories.forEach(function (cat) {
      var active = !activeCats || activeCats.indexOf(cat.id) !== -1;
      var row = document.querySelector('[data-cat-id="' + cat.id + '"]');
      if (row) {
        row.classList.toggle('disabled', !active);
        row.setAttribute('aria-checked', String(active));
      }
      // The mobile sheet chips are a second view of the same filter, so they
      // follow every change no matter which control made it.
      var chip = document.querySelector('[data-chip-cat-id="' + cat.id + '"]');
      if (chip) {
        chip.setAttribute('aria-pressed', String(active));
        chip.classList.toggle('active', active);
      }
    });
  }

  function _countCat(locations, catId) {
    return locations.filter(function (l) { return l.category === catId; }).length;
  }

  // ── Set filters ────────────────────────────────────────────
  // The bulk pins were imported one GTABase feature layer at a time, and that
  // layer is a named set (Hidden packages, Safes, Loot boxes, …); the 80
  // hand-written records are one group of their own. Each row shows how much of
  // its set is found, filters the map when clicked, and jumps to the next
  // unfound pin in that set — a collectible run no longer means hunting 5,089
  // pins by hand.
  var _setRows = [];

  function _buildSetFilters(data) {
    var container = document.getElementById('setFilters');
    if (!container) return;
    container.innerHTML = '';
    _setRows = [];

    var summary = G6.sets.summary();

    var catColor = {};
    data.categories.forEach(function (c) { catColor[c.id] = c.color; });

    container.appendChild(_setRow({
      id: null, label: 'All pins', color: 'var(--g6-muted)', total: summary.all.total
    }));

    (data.sets || []).slice().sort(function (a, b) {
      return (a.order || 0) - (b.order || 0);
    }).forEach(function (def) {
      var color = def.id === 'curated'
        ? 'var(--g6-accent)'
        : (catColor[def.category] || 'var(--g6-accent)');
      container.appendChild(_setRow({
        id: def.id,
        label: def.label || def.id,
        color: color,
        total: (summary.bySet[def.id] || { total: 0 }).total
      }));
    });

    [['setBulkMark', G6.sets.markAllFound], ['setBulkClear', G6.sets.clearFound]]
      .forEach(function (pair) {
        var btn = document.getElementById(pair[0]);
        if (!btn) return;
        btn.addEventListener('click', function () {
          var setId = G6.state.get().prefs.set;
          if (setId) pair[1](setId);
        });
      });

    // Paint the saved progress without waiting for the first state change.
    _syncSetProgress();
    _syncSetUI(G6.state.get().prefs.set);
  }

  function _setRow(def) {
    var row = document.createElement('div');
    row.className = 'set-row';
    row.setAttribute('data-set-id', def.id || 'all');
    row.style.setProperty('--set-color', def.color);

    var main = document.createElement('button');
    main.type = 'button';
    main.className = 'set-row-main';
    main.setAttribute('aria-pressed', 'false');
    main.setAttribute('aria-label', def.label + ' \u2014 ' + def.total + ' pins');

    var top = document.createElement('span');
    top.className = 'set-row-top';

    var dot = document.createElement('span');
    dot.className = 'set-dot';
    dot.style.background = def.color;

    var name = document.createElement('span');
    name.className = 'set-name';
    name.textContent = def.label;

    var count = document.createElement('span');
    count.className = 'set-count';
    count.textContent = '0 / ' + def.total;

    top.appendChild(dot);
    top.appendChild(name);
    top.appendChild(count);

    var bar = document.createElement('span');
    bar.className = 'set-bar';
    var fill = document.createElement('span');
    fill.className = 'set-bar-fill';
    bar.appendChild(fill);

    main.appendChild(top);
    main.appendChild(bar);
    main.addEventListener('click', function () { _applySet(def.id); });

    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'set-next';
    nextBtn.textContent = '\u25B8';
    nextBtn.setAttribute('aria-label', 'Next unfound in ' + def.label);
    nextBtn.title = 'Go to the next unfound pin in ' + def.label;

    if (def.id) {
      nextBtn.addEventListener('click', function () { G6.sets.next(def.id); });
    } else {
      // "All pins" has no one set to tour; the per-set buttons do that.
      nextBtn.hidden = true;
    }

    row.appendChild(main);
    row.appendChild(nextBtn);

    _setRows.push({
      id: def.id || null, label: def.label, row: row, main: main,
      count: count, fill: fill, next: nextBtn
    });
    return row;
  }

  function _applySet(setId) {
    var s = G6.state.get();
    // Clicking the active set clears it, so the row is its own off switch.
    var next  = (s.prefs.set === setId) ? null : setId;
    var prefs = Object.assign({}, s.prefs, { set: next });
    G6.state.set({ prefs: prefs });
    G6.filters.update(s.locations);
    saveProgress();
  }

  function _syncSetProgress() {
    if (!_setRows.length) return;

    var summary = G6.sets.summary();
    _setRows.forEach(function (r) {
      var t = r.id ? (summary.bySet[r.id] || { found: 0, total: 0 }) : summary.all;
      r.count.textContent = t.found + ' / ' + t.total;
      r.fill.style.width  = (t.total ? Math.round((t.found / t.total) * 100) : 0) + '%';
      if (r.next && !r.next.hidden) r.next.disabled = t.found >= t.total;
    });

    _syncSetBulk(summary);
  }

  // The bulk bar belongs to the active set, so it is only shown once one is
  // selected — and it names that set, because the actions affect all of it.
  function _syncSetBulk(summary) {
    var bar = document.getElementById('setBulk');
    if (!bar) return;

    var setId = G6.state.get().prefs.set;
    var row   = null;
    for (var i = 0; i < _setRows.length; i++) {
      if (_setRows[i].id === setId) { row = _setRows[i]; break; }
    }

    if (!setId || !row) { bar.hidden = true; return; }

    var t = summary.bySet[setId] || { found: 0, total: 0 };
    bar.hidden = false;

    var name = document.getElementById('setBulkName');
    if (name) name.textContent = row.label + ' \u00b7 ' + t.found + ' / ' + t.total;

    var mark = document.getElementById('setBulkMark');
    if (mark) mark.disabled = t.found >= t.total;

    var clear = document.getElementById('setBulkClear');
    if (clear) clear.disabled = t.found === 0;
  }

  function _syncSetUI(activeSet) {
    var active = activeSet || null;
    _setRows.forEach(function (r) {
      var on = r.id === active;
      r.row.classList.toggle('is-active', on);
      r.main.setAttribute('aria-pressed', String(on));
    });
  }

  function _buildVerifyToggle(data) {
    var group = document.getElementById('verifyToggleGroup');
    if (!group) return;
    group.innerHTML = '';

    var tiers = [
      { id: 'official',  label: '✦ Official',   color: 'var(--tier-official)' },
      { id: 'community', label: '○ Community',   color: 'rgba(255,255,255,.5)' },
      { id: 'estimate',  label: '◌ Unverified',  color: 'var(--tier-estimate)' }
    ];

    tiers.forEach(function (tier) {
      var btn = document.createElement('button');
      btn.className = 'verify-toggle-btn';
      btn.setAttribute('role', 'checkbox');
      btn.setAttribute('data-tier', tier.id);
      btn.setAttribute('aria-checked', 'true');
      btn.style.setProperty('--tier-color', tier.color);
      btn.textContent = tier.label;

      var s     = G6.state.get();
      var active = s.prefs.verification.indexOf(tier.id) !== -1;
      btn.setAttribute('aria-checked', String(active));

      btn.addEventListener('click', function () {
        var s2   = G6.state.get();
        var curr = s2.prefs.verification.slice();
        var idx  = curr.indexOf(tier.id);
        if (idx === -1) curr.push(tier.id);
        else            curr.splice(idx, 1);
        if (!curr.length) curr = [tier.id]; // keep at least one
        var prefs = Object.assign({}, s2.prefs, { verification: curr });
        G6.state.set({ prefs: prefs });
        btn.setAttribute('aria-checked', String(curr.indexOf(tier.id) !== -1));
        G6.filters.update(data.locations);
        saveProgress();
      });

      group.appendChild(btn);
    });
  }

  function _buildBaseMapToggle() {
    var group = document.getElementById('baseMapGroup');
    if (!group) return;
    group.innerHTML = '';

    var options = [
      { id: 'community', label: '\u25C8 Community', color: 'rgba(255,255,255,.5)' },
      { id: 'ingame',    label: '\u25A3 In-game',   color: 'var(--g6-accent-2)' }
    ];

    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.className = 'verify-toggle-btn';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', String(G6.map.getBaseMap() === opt.id));
      btn.style.setProperty('--tier-color', opt.color);
      btn.textContent = opt.label;

      btn.addEventListener('click', function () {
        G6.map.setBaseMap(opt.id);
        var s = G6.state.get();
        G6.state.set({ prefs: Object.assign({}, s.prefs, { baseMap: opt.id }) });
        saveProgress();
        _syncBaseMapUI();
        _updateCredit();
      });

      group.appendChild(btn);
    });
  }

  function _syncBaseMapUI() {
    var btns = document.querySelectorAll('#baseMapGroup .verify-toggle-btn');
    var ids  = ['community', 'ingame'];
    var cur  = G6.map.getBaseMap();
    ids.forEach(function (id, i) {
      if (btns[i]) btns[i].setAttribute('aria-checked', String(cur === id));
    });
  }

  // The credits strip has to state which artwork is actually on screen.
  var CREDITS = {
    community: 'Map: <a href="https://gtadb.org" target="_blank" rel="noopener noreferrer">YANIS V18 \u00b7 gtadb.org</a> CC&nbsp;BY&nbsp;4.0 \u00b7 Markers: <a href="https://www.gtabase.com/gta-6/map/" target="_blank" rel="noopener noreferrer">GTABase community map</a> \u00b7 Unofficial fan project',
    ingame:    'Map: GTA VI in-game map \u00a9&nbsp;Rockstar Games \u00b7 tiles via <a href="https://gtadb.org" target="_blank" rel="noopener noreferrer">gtadb.org</a> \u00b7 Markers: <a href="https://www.gtabase.com/gta-6/map/" target="_blank" rel="noopener noreferrer">GTABase community map</a> \u00b7 Unofficial fan project'
  };

  function _updateCredit() {
    var el = document.getElementById('mapCredit');
    if (!el) return;
    el.innerHTML = CREDITS[G6.map.getBaseMap()] || CREDITS.community;
  }

  // Scoped to the verification group: the base-map switch reuses the button
  // class, and matching by index over every such button would flip it too.
  function _syncVerifyUI(active) {
    var btns = document.querySelectorAll('#verifyToggleGroup .verify-toggle-btn');
    btns.forEach(function (btn) {
      var id = btn.getAttribute('data-tier');
      if (id) btn.setAttribute('aria-checked', String(active.indexOf(id) !== -1));
    });
  }

  // ── Build location list ────────────────────────────────────
  // The rail list and the mobile bottom-sheet list share one row builder.
  function buildLocationList(data) {
    _buildRows(document.getElementById('locList'), data);
    _buildRows(document.getElementById('mobileLocList'), data);
  }

  function _buildRows(container, data) {
    if (!container) return;

    var s          = G6.state.get();
    var visibleIds = s.visibleIds;
    var selectedId = s.selectedId;
    var found      = s.found;

    container.innerHTML = '';

    if (!visibleIds || visibleIds.size === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'padding:1.5rem 1rem;text-align:center;color:var(--g6-muted);font-size:.8rem';
      empty.textContent = 'No locations match your filters.';
      container.appendChild(empty);
      return;
    }

    var catMap = {};
    data.categories.forEach(function (c) { catMap[c.id] = c; });

    // 3,175 pins is not a list. One row per pin meant an O(n²) lookup and two
    // containers full of thousands of rows on every filter change, so the list
    // shows the first 300 and says so; search and the category filters reach
    // the rest. A selected pin is always listed, even past the cap.
    var ROW_CAP = 300;
    var byId = {};
    data.locations.forEach(function (l) { byId[l.id] = l; });

    var idsToShow = [];
    visibleIds.forEach(function (id) {
      if (idsToShow.length < ROW_CAP && byId[id]) idsToShow.push(id);
    });
    if (selectedId && visibleIds.has(selectedId) && byId[selectedId] &&
        idsToShow.indexOf(selectedId) === -1) {
      idsToShow.unshift(selectedId);
    }
    var shown = idsToShow.length;

    idsToShow.forEach(function (id) {
      var loc = byId[id];
      if (!loc) return;

      var cat    = catMap[loc.category] || { color: '#7fd1ff', label: loc.category };
      var isFound = !!found[id];
      var isSel   = id === selectedId;

      var row = document.createElement('li');
      row.className = 'loc-row' + (isSel ? ' selected' : '') + (isFound ? ' found-row' : '');
      row.setAttribute('tabindex', '0');
      row.setAttribute('role', 'button');
      row.setAttribute('aria-label', loc.name);

      // Icon (small SVG)
      var iconWrap = document.createElement('div');
      iconWrap.className = 'loc-row-icon';
      iconWrap.innerHTML =
        '<svg viewBox="0 0 30 38" style="width:100%;height:100%;--pin-color:' + cat.color + ';--pin-border:rgba(0,0,0,.3)" aria-hidden="true">' +
        '<use href="assets/icons/sprite.svg#pin-' + loc.category + '"/>' +
        '</svg>';

      var body = document.createElement('div');
      body.className = 'loc-row-body';

      var nameRow = document.createElement('div');
      nameRow.className = 'loc-row-name';

      // Tier icon in name row
      var tier = loc.verification || 'community';
      if (tier === 'official') {
        var ti = document.createElement('span');
        ti.className = 'tier-mini-icon official';
        ti.textContent = '✦';
        nameRow.appendChild(ti);
      } else if (tier === 'estimate') {
        var ti2 = document.createElement('span');
        ti2.className = 'tier-mini-icon estimate';
        ti2.textContent = '◌';
        nameRow.appendChild(ti2);
      }

      var nameText = document.createElement('span');
      nameText.textContent = loc.name;
      nameRow.appendChild(nameText);

      var sub = document.createElement('div');
      sub.className = 'loc-row-sub';
      sub.textContent = (loc.setLabel || cat.label) + (loc.region ? ' · ' + loc.region : '');

      body.appendChild(nameRow);
      body.appendChild(sub);

      row.appendChild(iconWrap);
      row.appendChild(body);

      function handleRowClick() {
        G6.state.set({ selectedId: id });
        // A phone or tablet picks a pin by seeing it, so the drawer gets out of
        // the way; on desktop it is a column and nothing moves.
        if (window.innerWidth <= 1099) _setRailOpen(false);
      }

      row.addEventListener('click', handleRowClick);
      row.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(); }
      });

      container.appendChild(row);
    });

    if (visibleIds.size > shown) {
      var more = document.createElement('div');
      more.style.cssText = 'padding:.85rem 1rem;text-align:center;color:var(--g6-muted);font-size:.72rem';
      more.textContent = 'Showing ' + shown + ' of ' + visibleIds.size +
                         ' — search or pick a category to narrow the list.';
      container.appendChild(more);
    }
  }

  // ── Toolbar ────────────────────────────────────────────────
  function buildToolbar() {
    var zoomIn  = document.getElementById('zoomInBtn');
    var zoomOut = document.getElementById('zoomOutBtn');
    var fitBtn  = document.getElementById('fitBtn');
    var fsBtn   = document.getElementById('fullscreenBtn');
    var fsBtnMob = document.getElementById('fullscreenBtnMob');
    var menuBtn = document.getElementById('menuBtn');

    if (zoomIn)  zoomIn.addEventListener('click',  function () { G6.map.getMap().zoomIn(); });
    if (zoomOut) zoomOut.addEventListener('click', function () { G6.map.getMap().zoomOut(); });
    if (fitBtn)  fitBtn.addEventListener('click',  function () { G6.map.fitAll(); });

    function toggleFullscreen() {
      var el = document.documentElement;
      if (!document.fullscreenElement) {
        (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
      } else {
        (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document);
      }
    }

    if (fsBtn) {
      fsBtn.addEventListener('click', toggleFullscreen);
      document.addEventListener('fullscreenchange', function () { G6.map.invalidate(); });
      document.addEventListener('webkitfullscreenchange', function () { G6.map.invalidate(); });
    }

    if (fsBtnMob) fsBtnMob.addEventListener('click', toggleFullscreen);

    // Hamburger menu: below 1100px this opens the rail as a drawer
    if (menuBtn) {
      menuBtn.addEventListener('click', function () {
        var rail = document.querySelector('.rail');
        if (!rail) return;
        _setRailOpen(!rail.classList.contains('open'));
      });
    }

    // Rail overlay click to close
    var overlay = document.querySelector('.rail-overlay');
    if (overlay) {
      overlay.addEventListener('click', function () { _setRailOpen(false); });
    }

    // Credits button
    var creditsBtn = document.getElementById('creditsBtn');
    if (creditsBtn) {
      creditsBtn.addEventListener('click', function () {
        var modal = document.getElementById('creditsModal');
        if (modal) {
          modal.classList.add('open');
          modal.querySelector('.modal-close').focus();
        }
      });
    }

    // Modal close
    var modalClose = document.querySelectorAll('.modal-close, .modal-backdrop');
    modalClose.forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target === el) {
          document.querySelectorAll('.modal-backdrop').forEach(function (m) { m.classList.remove('open'); });
        }
      });
    });

    // Esc to close modal
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop').forEach(function (m) { m.classList.remove('open'); });
        // The drawer is a panel over the map, so Esc dismisses it before it
        // starts clearing the selection behind it.
        var rail = document.querySelector('.rail');
        if (rail && rail.classList.contains('open')) {
          _setRailOpen(false);
          return;
        }
        // Also clear selection on Esc
        if (G6.state.get().selectedId) {
          G6.state.set({ selectedId: null });
        }
      }
    });
  }

  // ── Bottom sheet (mobile) ──────────────────────────────────
  function buildBottomSheet(data) {
    var sheet   = document.querySelector('.bottom-sheet');
    var handle  = sheet && sheet.querySelector('.sheet-handle');
    var dismiss = sheet && sheet.querySelector('.sheet-dismiss');
    if (!sheet) return;

    // Set initial snap
    sheet.dataset.snap = 'peek';
    document.body.dataset.sheetSnap = 'peek';

    // Build category chips
    var chips = document.getElementById('sheetChips');
    if (chips) {
      var clearChip = document.createElement('button');
      clearChip.type = 'button';
      clearChip.className = 'cat-chip cat-chip-clear';
      clearChip.textContent = 'Clear all';
      clearChip.setAttribute('aria-label', 'Clear all filters');
      clearChip.addEventListener('click', function () { _clearAllFilters(data); });
      chips.appendChild(clearChip);

      var activeCats = G6.state.get().prefs.categories;

      data.categories.forEach(function (cat) {
        var chip = document.createElement('button');
        chip.className = 'cat-chip';
        chip.style.setProperty('--cat-color', cat.color);

        var dot = document.createElement('span');
        dot.className = 'cat-chip-dot';
        dot.style.background = cat.color;
        chip.appendChild(dot);
        chip.appendChild(document.createTextNode(cat.short || cat.label));
        chip.setAttribute('data-chip-cat-id', cat.id);
        var chipActive = !activeCats || activeCats.indexOf(cat.id) !== -1;
        chip.setAttribute('aria-pressed', String(chipActive));
        chip.classList.toggle('active', chipActive);

        chip.addEventListener('click', function () {
          var s       = G6.state.get();
          var curr    = s.prefs.categories ? s.prefs.categories.slice() : data.categories.map(function (c) { return c.id; });
          var idx     = curr.indexOf(cat.id);
          if (idx === -1) curr.push(cat.id);
          else            curr.splice(idx, 1);
          var newCats = curr.length === data.categories.length ? null : (curr.length ? curr : null);
          var prefs   = Object.assign({}, s.prefs, { categories: newCats });
          G6.state.set({ prefs: prefs });
          G6.filters.update(data.locations);
          saveProgress();
          _syncCategoryUI(data.categories, newCats);
        });

        chips.appendChild(chip);
      });
    }

    // Sheet drag / snap
    var startY = 0;
    var startTranslate = 0;
    var snaps = { peek: 0, half: 1, full: 2, hidden: -1 };
    var snapOrder = ['peek', 'half', 'full'];

    if (handle) {
      handle.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        startY = e.clientY;
        handle.setPointerCapture(e.pointerId);

        handle.addEventListener('pointermove', onMove);
        handle.addEventListener('pointerup',   onUp,   { once: true });
        handle.addEventListener('pointercancel', onUp, { once: true });
      });
    }

    function onMove(e) {
      var dy    = e.clientY - startY;
      var curr  = sheet.dataset.snap;
      sheet.style.transition = 'none';
      // Visual feedback (clamp)
      var base = curr === 'peek'   ? 'calc(100% - var(--sheet-peek) - env(safe-area-inset-bottom,0px))' :
                 curr === 'half'   ? 'calc(100% - 45dvh)' :
                                     'calc(100% - 85dvh)';
      // Apply raw drag (simplified: just move the element directly)
      sheet.style.transform = 'translateY(calc(' + base + ' + ' + dy + 'px))';
    }

    function onUp(e) {
      handle.removeEventListener('pointermove', onMove);
      var dy = e.clientY - startY;
      sheet.style.transition = '';
      sheet.style.transform  = '';

      var curr = sheet.dataset.snap;
      var newSnap;
      if (dy < -60) {
        // Swipe up
        newSnap = curr === 'peek' ? 'half' : 'full';
      } else if (dy > 60) {
        // Swipe down
        newSnap = curr === 'full' ? 'half' : 'peek';
      } else {
        newSnap = curr;
      }
      _setSnap(sheet, newSnap);
    }

    if (dismiss) {
      dismiss.addEventListener('click', function () {
        _setSnap(sheet, 'hidden');
      });
    }

    // Tapping map restores sheet from hidden
    document.getElementById('map').addEventListener('click', function () {
      var s = G6.state.get();
      if (!s.selectedId) {
        var sh = document.querySelector('.bottom-sheet');
        if (sh && sh.dataset.snap === 'hidden') _setSnap(sh, 'peek');
      }
    });

    // Mobile search (in sheet header when full)
    var sheetSearch = document.getElementById('sheetSearchInput');
    if (sheetSearch) {
      sheetSearch.addEventListener('input', G6.dom.debounce(function () {
        // Mirror to main search
        var mainSearch = document.getElementById('searchInput');
        if (mainSearch) mainSearch.value = sheetSearch.value;
        var prefs = Object.assign({}, G6.state.get().prefs, { search: sheetSearch.value });
        G6.state.set({ prefs: prefs });
        G6.filters.update(data.locations);
        saveProgress();
      }, 150));
    }
  }

  function _setSnap(sheet, snap) {
    sheet.dataset.snap = snap;
    document.body.dataset.sheetSnap = snap;
  }

  // ── Custom pin drop ────────────────────────────────────────
  function _startDropPin(data) {
    var mapEl = document.getElementById('map');
    mapEl.style.cursor = 'crosshair';
    G6.dom.toast('Click on the map to place a custom pin', 'info', 4000);

    G6.map.getMap().once('click', function (e) {
      mapEl.style.cursor = '';
      var pt = G6.geo.fromLatLng(e.latlng);
      if (!G6.geo.inCrop(pt.x, pt.y)) return;

      var name = prompt('Name for this pin:');
      if (name === null) return; // cancelled
      name = name.trim().slice(0, 60) || 'Custom pin';

      var pin = {
        id:   'c-' + Date.now().toString(36),
        name: name,
        x:    pt.x,
        y:    pt.y,
        note: null
      };

      var s      = G6.state.get();
      var custom = s.custom.concat([pin]);
      G6.state.set({ custom: custom });
      G6.markers.renderCustom(custom);
      saveProgress();
      G6.dom.toast('Custom pin placed: ' + name, 'success');
    });
  }

  // ── Build credits dialog ───────────────────────────────────
  function buildCreditsDialog(credits) {
    var list = document.getElementById('creditsList');
    if (!list) return;
    list.innerHTML = '';
    credits.forEach(function (entry) {
      var div = document.createElement('div');
      div.className = 'credit-entry';

      var assetEl = document.createElement('div');
      assetEl.className = 'credit-asset';
      assetEl.textContent = entry.asset;

      var workEl = document.createElement('div');
      workEl.className = 'credit-work';
      workEl.textContent = entry.work;

      var attrEl = document.createElement('div');
      attrEl.className = 'credit-attr';

      var parts = [];
      if (entry.author) parts.push(entry.author);
      if (entry.license) {
        if (entry.licenseUrl) {
          var la = document.createElement('a');
          la.href = entry.licenseUrl;
          la.textContent = entry.license;
          la.target = '_blank';
          la.rel = 'noopener noreferrer';
          attrEl.appendChild(document.createTextNode(parts.join(' · ') + (parts.length ? ' · ' : '')));
          attrEl.appendChild(la);
          if (entry.sourceUrl) {
            var sa = document.createElement('a');
            sa.href = entry.sourceUrl;
            sa.textContent = ' · Source';
            sa.target = '_blank';
            sa.rel = 'noopener noreferrer';
            attrEl.appendChild(sa);
          }
          if (entry.changes) {
            var chg = document.createElement('div');
            chg.style.cssText = 'font-size:.68rem;color:var(--g6-dim);margin-top:2px';
            chg.textContent = 'Changes: ' + entry.changes;
            div.appendChild(assetEl);
            div.appendChild(workEl);
            div.appendChild(attrEl);
            div.appendChild(chg);
            list.appendChild(div);
            return;
          }
        } else {
          parts.push(entry.license);
        }
      }
      if (!attrEl.childNodes.length) {
        attrEl.textContent = parts.join(' · ');
        if (entry.sourceUrl) {
          var slink = document.createElement('a');
          slink.href = entry.sourceUrl;
          slink.textContent = ' · Source';
          slink.target = '_blank';
          slink.rel = 'noopener noreferrer';
          attrEl.appendChild(slink);
        }
      }
      if (entry.notes) {
        var notes = document.createElement('div');
        notes.style.cssText = 'font-size:.68rem;color:var(--g6-dim);margin-top:4px';
        notes.textContent = entry.notes;
        div.appendChild(assetEl);
        div.appendChild(workEl);
        div.appendChild(attrEl);
        div.appendChild(notes);
        list.appendChild(div);
        return;
      }
      div.appendChild(assetEl);
      div.appendChild(workEl);
      div.appendChild(attrEl);
      list.appendChild(div);
    });
  }

  // Codes like "789987 (door) / 031462 (safe)" keep their pairings, but the
  // parenthetical part is demoted so the numbers still scan at a glance.
  function _appendCodeText(el, raw) {
    var text = String(raw || '');
    var re   = /\(([^)]*)\)/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m.index > last) el.appendChild(document.createTextNode(text.slice(last, m.index)));
      var note = document.createElement('span');
      note.className = 'code-note';
      note.textContent = '(' + m[1] + ')';
      el.appendChild(note);
      last = m.index + m[0].length;
    }
    if (last < text.length) el.appendChild(document.createTextNode(text.slice(last)));
  }

  // ── Codes & keys ───────────────────────────────────────────
  // "What is the code for this door" should not require knowing which pin owns
  // the code, so the list is ordered by the code itself and filters on its own.
  function buildCodesDialog(appData) {
    var modal = document.getElementById('codesModal');
    var list  = document.getElementById('codesList');
    var input = document.getElementById('codesSearch');
    var empty = document.getElementById('codesEmpty');
    var btn   = document.getElementById('codesBtn');
    if (!modal || !list || !btn) return;

    var regionLabel = {};
    var catLabel    = {};
    (appData.regions || []).forEach(function (r) { regionLabel[r.id] = r.label || r.name || r.id; });
    (appData.categories || []).forEach(function (c) { catLabel[c.id] = c.label || c.id; });

    var rows = (appData.locations || []).filter(function (l) { return l.code; })
      .sort(function (a, b) {
        var na = String(a.code).match(/\d+/);
        var nb = String(b.code).match(/\d+/);
        var va = na ? parseInt(na[0], 10) : Infinity;
        var vb = nb ? parseInt(nb[0], 10) : Infinity;
        if (va !== vb) return va - vb;
        return a.name.localeCompare(b.name);
      });

    btn.textContent = 'Codes & keys \u00b7 ' + rows.length;

    var entries = [];
    list.textContent = '';

    rows.forEach(function (loc) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'code-row';

      var code = document.createElement('span');
      code.className = 'code-value';
      _appendCodeText(code, loc.code);

      var name = document.createElement('span');
      name.className = 'code-name';
      name.textContent = loc.name;

      var where = document.createElement('span');
      where.className = 'code-where';
      var whereText = (regionLabel[loc.region] || loc.region || '') + ' \u00b7 ' +
                      (catLabel[loc.category] || loc.category || '');
      where.textContent = whereText;

      // The visible text is three stacked lines with no separators, so give the
      // button one readable label for screen readers.
      row.setAttribute('aria-label', loc.code + ' \u2014 ' + loc.name + ', ' + whereText);

      row.appendChild(code);
      row.appendChild(name);
      row.appendChild(where);

      row.addEventListener('click', function () {
        G6.state.set({ selectedId: loc.id });
        G6.map.flyTo(loc.position.x, loc.position.y, 1);
        modal.classList.remove('open');
      });

      list.appendChild(row);

      entries.push({
        el:  row,
        hay: [loc.code, loc.name, loc.hint, loc.region, regionLabel[loc.region] || '',
              loc.category, catLabel[loc.category] || '', (loc.tips || []).join(' ')]
               .join(' ').toLowerCase()
      });
    });

    function applyFilter() {
      var q     = (input && input.value ? input.value : '').trim().toLowerCase();
      var shown = 0;
      entries.forEach(function (e) {
        var hit = !q || e.hay.indexOf(q) !== -1;
        e.el.hidden = !hit;
        if (hit) shown++;
      });
      if (empty) empty.hidden = shown > 0;
    }

    if (input) input.addEventListener('input', G6.dom.debounce(applyFilter, 80));

    btn.addEventListener('click', function () {
      modal.classList.add('open');
      if (input) {
        input.value = '';
        applyFilter();
        input.focus();
      } else {
        var close = modal.querySelector('.modal-close');
        if (close) close.focus();
      }
    });
  }

  // ── State change handler ───────────────────────────────────
  function onStateChange(s) {
    // Re-render markers
    G6.markers.render(s.locations, s);
    G6.markers.renderCustom(s.custom);

    // Re-render list
    buildLocationList({ locations: s.locations, categories: s.categories });

    // Update progress ring
    updateProgressRing(s.found, s.locations);

    // Filter controls follow prefs no matter who changed them: the next-unfound
    // action opens a category or a tier so its pin is really on the map.
    _syncSetProgress();
    _syncSetUI(s.prefs.set);
    _syncCategoryUI(s.categories, s.prefs.categories);
    _syncVerifyUI(s.prefs.verification);

    // Show / hide detail
    if (s.selectedId && !s.selectedId.startsWith('custom:')) {
      G6.detail.showById(s.selectedId);
    } else if (!s.selectedId) {
      G6.detail.hide();
    }
  }

  // ── Boot ───────────────────────────────────────────────────
  G6.data.load('.').then(function (appData) {

    // Merge data into state
    G6.state.set({
      locations:  appData.locations,
      categories: appData.categories,
      regions:    appData.regions
    });

    // Load persisted progress
    var progress = G6.storage.loadProgress();

    // Migrate from v3 format
    var migrated = {};
    if (!G6.storage.hasMigrated()) {
      migrated = G6.storage.migrateFromV3(appData.locations);
      if (Object.keys(migrated).length > 0) {
        G6.dom.toast('Migrated ' + Object.keys(migrated).length + ' discoveries', 'info');
      }
    }

    var found = Object.assign({}, migrated, progress.found || {});

    G6.state.set({
      found:    found,
      notes:    progress.notes    || {},
      custom:   progress.custom   || [],
      position: progress.position || null,
      prefs: Object.assign(
        { categories: null, verification: ['official','community','estimate'], hideFound: false, search: '' },
        progress.prefs || {}
      )
    });

    // Init map, then apply the saved artwork choice
    var map = G6.map.init();
    var bootBaseMap = G6.state.get().prefs.baseMap;
    if (bootBaseMap) G6.map.setBaseMap(bootBaseMap);
    G6.markers.init(map);

    // Initial filter pass
    G6.filters.update(appData.locations);

    // Render markers
    var state = G6.state.get();
    G6.markers.render(appData.locations, state);
    G6.markers.renderCustom(state.custom);
    if (state.position) G6.markers.setPosition(state.position.x, state.position.y);

    // Build UI
    buildRail(appData);
    buildToolbar();
    buildBottomSheet(appData);
    buildCreditsDialog(appData.credits);
    buildCodesDialog(appData);
    buildLocationList(appData);
    updateProgressRing(found, appData.locations);

    // Subscribe to state changes
    G6.state.subscribe('change', onStateChange);

    // Resize observer on map column
    var mapEl = document.getElementById('map');
    if (mapEl && window.ResizeObserver) {
      new ResizeObserver(G6.dom.debounce(function () { G6.map.invalidate(); }, 100))
        .observe(mapEl);
    }

    // Handle deep link
    var hash = parseHash();
    if (hash.l) {
      var loc = null;
      for (var i = 0; i < appData.locations.length; i++) {
        if (appData.locations[i].id === hash.l) { loc = appData.locations[i]; break; }
      }
      if (loc) {
        G6.state.set({ selectedId: hash.l });
        G6.map.flyTo(loc.position.x, loc.position.y, -1);
      }
    }

    // Hide loading
    var loading = document.getElementById('loading');
    if (loading) loading.hidden = true;

    G6.dom.toast('Map loaded \u2014 ' + appData.locations.length + ' locations', 'success');

  }).catch(function (err) {
    var loading = document.getElementById('loading');
    if (loading) loading.hidden = true;
    var errorEl = document.getElementById('bootError');
    if (errorEl) {
      errorEl.hidden = false;
      var msg = errorEl.querySelector('.error-msg');
      if (msg) msg.textContent = err.message || String(err);
    }
    console.error('[G6] Boot error:', err);
  });

  // Retry button
  var retryBtn = document.querySelector('.error-retry');
  if (retryBtn) retryBtn.addEventListener('click', function () { location.reload(); });

})();
