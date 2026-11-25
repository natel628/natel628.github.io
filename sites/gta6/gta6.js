/* ════════════════════════════════════════════════════════════════
   GTA 6 Loot Map — clustering, deep links, coords, import/export
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────── categories ─────────────── */
  var CATS = {
    weapons:    { label: 'Hidden Weapons',      color: '#e8536b', icon: 'M12 2L9 9l-6 1 4.5 4.5L6 21l6-3 6 3-1.5-6.5L21 10l-6-1z' },
    cash:       { label: 'Cash Stashes',         color: '#f0a35e', icon: 'M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm-1-13h2v2h-2zm0 4h2v6h-2z' },
    code:       { label: 'Safes & Codes',        color: '#45cfc0', icon: 'M12 2C8.1 2 5 5.1 5 9v2H3v11h18V11h-2V9c0-3.9-3.1-7-7-7zm0 2c2.8 0 5 2.2 5 5v2H7V9c0-2.8 2.2-5 5-5zm0 10c1.1 0 2 .9 2 2 0 .7-.4 1.4-1 1.7V20h-2v-2.3c-.6-.3-1-1-1-1.7 0-1.1.9-2 2-2z' },
    collect:    { label: 'Collectibles',         color: '#b18cf0', icon: 'M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z' },
    easter:     { label: 'Easter Eggs',          color: '#ff2d78', icon: 'M12 2C8 2 5 6 5 11c0 5 3 9 7 9s7-4 7-9c0-5-3-9-7-9zm0 16c-2.8 0-5-3.1-5-7s2.2-7 5-7 5 3.1 5 7-2.2 7-5 7z' },
    strangers:  { label: 'Strangers & Freaks',   color: '#00e5ff', icon: 'M12 2a4 4 0 100 8 4 4 0 000-8zm0 10c-4.4 0-8 2.2-8 5v3h16v-3c0-2.8-3.6-5-8-5z' },
    stunts:     { label: 'Stunt Jumps',          color: '#ff6b35', icon: 'M3 20h18v-2H3v2zm2-4h14v-2H5v2zm2-4h10v-2H7v2zm3-4h4V2h-4v6z' },
    shipwreck:  { label: 'Shipwrecks',           color: '#78a9e8', icon: 'M12 2L4 10v10h16V10l-8-8zm0 2.8L18.2 10H5.8L12 4.8zM6 12h12v6H6v-6z' }
  };

  var COLS = 9;
  var ROWS = 13;
  var FOUND_KEY = 'gta6.found.v3';
  var MINE_KEY = 'gta6.mine.v3';
  var CLUSTER_ZOOM_THRESHOLD = 1.6;

  var state = {
    items: [],
    mine: [],
    found: [],
    cats: Object.keys(CATS),
    q: '',
    region: 'all',
    hideCleared: false,
    selected: null,
    zoom: 1,
    pan: { x: 0, y: 0 },
    addMode: false,
    coordMode: false,
    pending: null
  };

  var el = {};

  /* ─────────────── storage ─────────────── */
  function readStore(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) { return []; }
  }

  function writeStore(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) {}
  }

  /* ─────────────── grid maths ─────────────── */
  function parseSquare(square) {
    var match = /^([A-Ma-m])\s*([1-9])$/.exec(String(square || '').trim());
    if (!match) return { row: 0, col: 1 };
    return {
      row: match[1].toUpperCase().charCodeAt(0) - 65,
      col: parseInt(match[2], 10)
    };
  }

  function squareOfPoint(xPct, yPct) {
    var col = Math.min(COLS, Math.max(1, Math.floor(xPct * COLS) + 1));
    var row = Math.min(ROWS - 1, Math.max(0, Math.floor(yPct * ROWS)));
    return {
      square: String.fromCharCode(65 + row) + col,
      dx: Math.min(0.97, Math.max(0.03, xPct * COLS - (col - 1))),
      dy: Math.min(0.97, Math.max(0.03, yPct * ROWS - row))
    };
  }

  function pos(item) {
    var cell = parseSquare(item.square);
    var dx = typeof item.dx === 'number' ? item.dx : 0.5;
    var dy = typeof item.dy === 'number' ? item.dy : 0.5;
    return {
      x: ((cell.col - 1 + dx) / COLS) * 100,
      y: ((cell.row + dy) / ROWS) * 100
    };
  }

  /* ─────────────── data helpers ─────────────── */
  function allItems() { return state.items.concat(state.mine); }
  function catInfo(cat) { return CATS[cat] || { label: 'Other', color: '#8b9ab2', icon: '' }; }
  function isFound(id) { return state.found.indexOf(id) !== -1; }

  function sourcesOf(item) {
    if (Array.isArray(item.sources) && item.sources.length) return item.sources;
    if (item.source) return [{ label: 'source', url: item.source }];
    return [];
  }

  function visible() {
    var q = state.q.trim().toLowerCase();
    return allItems().filter(function (item) {
      if (state.cats.indexOf(item.cat) === -1) return false;
      if (state.region !== 'all' && item.region !== state.region) return false;
      if (state.hideCleared && isFound(item.id)) return false;
      if (!q) return true;
      var hay = [
        item.name, item.region, item.county, item.square, item.how, item.hint, item.code, item.risk,
        (item.loot || []).join(' '), item.reward || ''
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.indexOf(q) !== -1;
    }).sort(function (a, b) {
      if (a.region !== b.region) return a.region < b.region ? -1 : 1;
      var ca = parseSquare(a.square);
      var cb = parseSquare(b.square);
      if (ca.row !== cb.row) return ca.row - cb.row;
      if (ca.col !== cb.col) return ca.col - cb.col;
      return a.name < b.name ? -1 : 1;
    });
  }

  function loadData() {
    return fetch('./data/locations.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('locations.json returned ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('locations.json is not an array');
        return data.filter(function (item) {
          return item && item.id && item.name && item.square;
        });
      });
  }

  /* ─────────────── clustering ─────────────── */
  function clusterItems(items) {
    if (state.zoom >= CLUSTER_ZOOM_THRESHOLD) {
      return items.map(function (item) { return { type: 'single', item: item }; });
    }
    var groups = {};
    var order = [];
    items.forEach(function (item) {
      if (!groups[item.square]) { groups[item.square] = []; order.push(item.square); }
      groups[item.square].push(item);
    });
    var result = [];
    order.forEach(function (sq) {
      var group = groups[sq];
      if (group.length === 1) {
        result.push({ type: 'single', item: group[0] });
      } else {
        result.push({ type: 'cluster', square: sq, items: group });
      }
    });
    return result;
  }

  /* ─────────────── rendering ─────────────── */
  function render() {
    renderPins();
    renderList();
    renderProgress();
  }

  function renderPins() {
    var frag = document.createDocumentFragment();
    var shown = visible();
    var shownIds = {};
    var clustered = clusterItems(shown);

    clustered.forEach(function (entry) {
      if (entry.type === 'cluster') {
        var group = entry.items;
        var p = pos(group[0]);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cluster-pin';
        btn.style.left = p.x + '%';
        btn.style.top = p.y + '%';
        var primaryCat = group[0].cat;
        btn.style.setProperty('--c', catInfo(primaryCat).color);
        btn.setAttribute('aria-label', group.length + ' spots in grid ' + entry.square);

        var bg = document.createElement('span');
        bg.className = 'cluster-bg';
        bg.textContent = group.length;
        btn.appendChild(bg);

        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          var sq = parseSquare(entry.square);
          var targetZoom = Math.min(4, state.zoom * 2.5);
          setZoom(targetZoom);
        });

        frag.appendChild(btn);
      } else {
        var item = entry.item;
        shownIds[item.id] = true;
        var p2 = pos(item);
        var pin = document.createElement('button');
        pin.type = 'button';
        pin.className = 'pin';
        pin.dataset.id = item.id;
        pin.style.left = p2.x + '%';
        pin.style.top = p2.y + '%';
        pin.style.setProperty('--c', catInfo(item.cat).color);
        pin.setAttribute('aria-label', item.name + ' — grid ' + item.square);

        if (isFound(item.id)) pin.classList.add('is-found');
        if (item.custom) pin.classList.add('is-mine');
        if (state.selected === item.id) pin.classList.add('is-active');

        var dot = document.createElement('i');
        pin.appendChild(dot);

        var label = document.createElement('span');
        label.className = 'pin-label';
        label.textContent = item.name;
        pin.appendChild(label);

        (function (id) {
          pin.addEventListener('click', function (ev) {
            ev.stopPropagation();
            select(id);
          });
        })(item.id);

        frag.appendChild(pin);
      }
    });

    el.pins.innerHTML = '';
    el.pins.appendChild(frag);

    if (state.selected && !shownIds[state.selected]) {
      state.selected = null;
      renderDetail();
    }
  }

  function renderList() {
    var items = visible();
    el.list.innerHTML = '';
    var frag = document.createDocumentFragment();
    var lastRegion = null;

    items.forEach(function (item) {
      if (item.region !== lastRegion) {
        lastRegion = item.region;
        var head = document.createElement('li');
        head.className = 'regionhead';
        head.textContent = item.region + (item.county ? ' · ' + item.county.replace(/ County$/, ' County') : '');
        frag.appendChild(head);
      }

      var li = document.createElement('li');
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'row';
      row.style.setProperty('--c', catInfo(item.cat).color);
      if (isFound(item.id)) row.classList.add('is-found');
      if (state.selected === item.id) row.classList.add('is-active');

      var dot = document.createElement('span');
      dot.className = 'row-dot';
      row.appendChild(dot);

      var body = document.createElement('span');
      body.className = 'row-body';
      var name = document.createElement('span');
      name.className = 'row-name';
      name.textContent = item.name;
      body.appendChild(name);

      var meta = document.createElement('span');
      meta.className = 'row-meta';
      meta.appendChild(document.createTextNode('Grid ' + item.square + ' · '));
      if (item.code) {
        var code = document.createElement('span');
        code.className = 'row-code';
        code.textContent = item.code;
        meta.appendChild(code);
      } else {
        meta.appendChild(document.createTextNode(catInfo(item.cat).label.toLowerCase()));
      }
      body.appendChild(meta);
      row.appendChild(body);

      (function (id) {
        row.addEventListener('click', function () { select(id); });
      })(item.id);

      li.appendChild(row);
      frag.appendChild(li);
    });

    el.list.appendChild(frag);
    el.empty.hidden = items.length > 0;
    el.listCount.textContent = items.length + ' shown';
    el.listTitle.textContent = state.region === 'all'
      ? (state.cats.length === 1 ? catInfo(state.cats[0]).label : 'All Spots')
      : state.region;
  }

  function renderProgress() {
    var total = allItems().length;
    var done = state.found.length;
    var pct = total ? Math.round((done / total) * 100) : 0;
    el.statTotal.textContent = total;
    el.statFound.textContent = done;
    el.statPct.textContent = pct + '%';
    el.progressFill.style.width = pct + '%';

    /* Per-category progress */
    el.catProgress.innerHTML = '';
    Object.keys(CATS).forEach(function (cat) {
      var catItems = allItems().filter(function (i) { return i.cat === cat; });
      if (!catItems.length) return;
      var catDone = catItems.filter(function (i) { return isFound(i.id); }).length;
      var catPct = Math.round((catDone / catItems.length) * 100);

      var row = document.createElement('div');
      row.className = 'cat-progress-row';
      row.style.setProperty('--c', CATS[cat].color);

      var dot = document.createElement('span');
      dot.className = 'cat-progress-dot';
      row.appendChild(dot);

      var track = document.createElement('div');
      track.className = 'cat-progress-track';
      var fill = document.createElement('div');
      fill.className = 'cat-progress-fill';
      fill.style.width = catPct + '%';
      track.appendChild(fill);
      row.appendChild(track);

      var label = document.createElement('span');
      label.className = 'cat-progress-label';
      label.textContent = catDone + '/' + catItems.length;
      row.appendChild(label);

      el.catProgress.appendChild(row);
    });
  }

  function renderCats() {
    el.catList.innerHTML = '';
    var items = allItems();

    Object.keys(CATS).forEach(function (cat) {
      var count = items.filter(function (i) { return i.cat === cat; }).length;
      if (!count) return;

      var li = document.createElement('li');
      var label = document.createElement('label');
      label.className = 'cat';
      label.style.setProperty('--c', CATS[cat].color);

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = state.cats.indexOf(cat) !== -1;
      box.addEventListener('change', function () {
        var idx = state.cats.indexOf(cat);
        if (box.checked && idx === -1) state.cats.push(cat);
        if (!box.checked && idx !== -1) state.cats.splice(idx, 1);
        render();
      });

      var icon = document.createElement('span');
      icon.className = 'cat-icon';
      icon.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="' + CATS[cat].icon + '"/></svg>';

      var name = document.createElement('span');
      name.className = 'cat-name';
      name.textContent = CATS[cat].label;

      var num = document.createElement('span');
      num.className = 'cat-count';
      num.textContent = count;

      label.appendChild(box);
      label.appendChild(icon);
      label.appendChild(name);
      label.appendChild(num);
      li.appendChild(label);
      el.catList.appendChild(li);
    });
  }

  function buildRegionOptions() {
    var regions = [];
    allItems().forEach(function (item) {
      if (regions.indexOf(item.region) === -1) regions.push(item.region);
    });
    regions.sort();

    [el.regionSelect, el.addRegion].forEach(function (select) {
      var current = select.value;
      select.innerHTML = '';
      if (select === el.regionSelect) {
        var all = document.createElement('option');
        all.value = 'all';
        all.textContent = 'All regions';
        select.appendChild(all);
      }
      regions.forEach(function (region) {
        var opt = document.createElement('option');
        opt.value = region;
        opt.textContent = region;
        select.appendChild(opt);
      });
      if (current) select.value = current;
      if (select === el.regionSelect && select.value !== 'all' && regions.indexOf(select.value) === -1) {
        select.value = 'all';
      }
    });
  }

  function buildCatOptions() {
    el.addCat.innerHTML = '';
    Object.keys(CATS).forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = CATS[cat].label;
      el.addCat.appendChild(opt);
    });
  }

  /* ─────────────── detail ─────────────── */
  function select(id) {
    state.selected = id;
    renderPins();
    renderList();
    renderDetail();
    updateHash(id);
    if (window.innerWidth <= 900) {
      el.panel.classList.remove('is-collapsed');
      el.panelToggle.setAttribute('aria-expanded', 'true');
    }
    if (el.detail && !el.detail.hidden) el.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderDetail() {
    var item = null;
    allItems().forEach(function (c) { if (c.id === state.selected) item = c; });

    if (!item) {
      el.detail.hidden = true;
      el.detail.innerHTML = '';
      return;
    }

    var info = catInfo(item.cat);
    el.detail.hidden = false;
    el.detail.innerHTML = '';

    var top = document.createElement('div');
    top.className = 'detail-top';
    var h3 = document.createElement('h3');
    h3.textContent = item.name;
    top.appendChild(h3);

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'close';
    close.setAttribute('aria-label', 'Close details');
    close.textContent = '×';
    close.addEventListener('click', clearSelection);
    top.appendChild(close);
    el.detail.appendChild(top);

    /* Badges */
    var badges = document.createElement('div');
    badges.className = 'badges';
    badges.appendChild(badge(info.label, 'badge-cat', info.color));
    badges.appendChild(badge('grid ' + item.square, 'badge-square'));
    badges.appendChild(badge(item.region + (item.county ? ' · ' + item.county : '')));
    badges.appendChild(badge(item.confidence || 'community-reported', 'badge-warn'));
    if (item.custom) badges.appendChild(badge('your pin'));
    el.detail.appendChild(badges);

    /* Reference image or placeholder */
    if (item.image) {
      var img = document.createElement('img');
      img.className = 'detail-image';
      img.src = item.image;
      img.alt = item.name + ' reference';
      img.loading = 'lazy';
      el.detail.appendChild(img);
    } else {
      var ph = document.createElement('div');
      ph.className = 'detail-image-placeholder';
      ph.textContent = 'No reference screenshot yet';
      el.detail.appendChild(ph);
    }

    /* Loot / reward lines */
    (item.loot || []).forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'lootline';
      p.textContent = line;
      el.detail.appendChild(p);
    });

    /* Reward summary */
    if (item.reward) {
      var rw = document.createElement('p');
      rw.className = 'reward-line';
      rw.textContent = 'Reward: ' + item.reward;
      el.detail.appendChild(rw);
    }

    /* Safe code */
    if (item.code) {
      var box = document.createElement('div');
      box.className = 'codebox';
      var lb = document.createElement('b');
      lb.textContent = 'code';
      box.appendChild(lb);
      box.appendChild(document.createTextNode(item.code));
      el.detail.appendChild(box);
    }

    /* Location hint */
    if (item.hint || item.how) {
      var hintP = document.createElement('p');
      hintP.className = 'hint-line';
      hintP.textContent = item.hint || item.how;
      el.detail.appendChild(hintP);
    }

    /* Risk */
    if (item.risk) {
      var risk = document.createElement('p');
      risk.className = 'risk';
      risk.textContent = item.risk;
      el.detail.appendChild(risk);
    }

    /* Sources */
    var srcs = sourcesOf(item);
    if (srcs.length) {
      var wrap = document.createElement('div');
      wrap.className = 'srcs';
      srcs.forEach(function (src) {
        var a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.textContent = src.label + ' ↗';
        wrap.appendChild(a);
      });
      el.detail.appendChild(wrap);
    }

    /* Mark as found */
    var foot = document.createElement('div');
    foot.className = 'detail-foot';
    var lab = document.createElement('label');
    lab.className = 'found-btn' + (isFound(item.id) ? ' is-checked' : '');
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = isFound(item.id);
    check.addEventListener('change', function () {
      toggleFound(item.id, check.checked);
      lab.classList.toggle('is-checked', check.checked);
    });
    lab.appendChild(check);
    lab.appendChild(document.createTextNode('Mark as Found'));
    foot.appendChild(lab);
    el.detail.appendChild(foot);
  }

  function badge(text, extra, color) {
    var span = document.createElement('span');
    span.className = 'badge' + (extra ? ' ' + extra : '');
    if (color) span.style.setProperty('--c', color);
    span.textContent = text;
    return span;
  }

  function clearSelection() {
    state.selected = null;
    updateHash(null);
    renderPins();
    renderList();
    renderDetail();
  }

  function toggleFound(id, on) {
    var idx = state.found.indexOf(id);
    if (on && idx === -1) state.found.push(id);
    if (!on && idx !== -1) state.found.splice(idx, 1);
    writeStore(FOUND_KEY, state.found);
    render();
    renderDetail();
  }

  /* ─────────────── URL hash deep linking ─────────────── */
  function updateHash(id) {
    if (id) {
      history.replaceState(null, '', '#loc=' + encodeURIComponent(id));
    } else {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }

  function readHash() {
    var m = /#loc=([^&]+)/.exec(window.location.hash);
    if (m) {
      var id = decodeURIComponent(m[1]);
      setTimeout(function () { select(id); }, 100);
    }
  }

  window.addEventListener('hashchange', function () {
    var m = /#loc=([^&]+)/.exec(window.location.hash);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (state.selected !== id) select(id);
    } else if (state.selected) {
      state.selected = null;
      renderPins();
      renderList();
      renderDetail();
    }
  });

  /* ─────────────── coordinate overlay ─────────────── */
  function updateCoordReadout(clientX, clientY) {
    var rect = el.stage.getBoundingClientRect();
    var xPct = (clientX - rect.left) / rect.width;
    var yPct = (clientY - rect.top) / rect.height;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) {
      el.coordReadout.textContent = '—';
      return;
    }
    var cell = squareOfPoint(xPct, yPct);
    el.coordReadout.textContent = '[' + cell.square + ']';
  }

  /* ─────────────── view / transform ─────────────── */
  var MAP_RATIO = 900 / 1300;

  function fitStage() {
    var w = el.frame.clientWidth;
    var h = el.frame.clientHeight;
    if (!w || !h) return;
    var sw = w;
    var sh = w / MAP_RATIO;
    if (sh > h) { sh = h; sw = h * MAP_RATIO; }
    el.stage.style.width = sw + 'px';
    el.stage.style.height = sh + 'px';
    el.stage.style.left = Math.round((w - sw) / 2) + 'px';
    el.stage.style.top = Math.round((h - sh) / 2) + 'px';
  }

  var ZMIN = 1;
  var ZMAX = 8;

  function applyView() {
    el.stage.style.transform = 'translate(' + state.pan.x + 'px, ' + state.pan.y + 'px) scale(' + state.zoom + ')';
    el.pins.style.setProperty('--inv', String(1 / Math.sqrt(state.zoom)));
    var svg = document.getElementById('mapSvg');
    if (svg) {
      svg.classList.toggle('z1', state.zoom >= 1.6);
      svg.classList.toggle('z2', state.zoom >= 2.4);
      svg.classList.toggle('z3', state.zoom >= 4);
    }
    if (el.zoomLevel) el.zoomLevel.textContent = Math.round(state.zoom * 100) + '%';
    /* Re-cluster when zoom crosses threshold */
    renderPins();
    scheduleLabels();
  }

  var labelQueued = false;
  function scheduleLabels() {
    if (labelQueued) return;
    labelQueued = true;
    var run = function () { labelQueued = false; layoutLabels(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function layoutLabels() {
    var svg = el.mapSvg || document.getElementById('mapSvg');
    if (!svg || !el.frame) return;
    if (svg.classList.contains('hide-labels')) return;
    var inv = 1 / state.zoom;
    var labels = Array.prototype.slice.call(
      svg.querySelectorAll('.townlabels text, .streetlabels text, .roadlabels text')
    );
    if (!labels.length) return;
    labels.forEach(function (lbl) {
      lbl.classList.remove('is-collided');
      lbl.style.display = '';
      lbl.style.transform = 'scale(' + inv + ')';
    });
    var candidates = labels.filter(function (lbl) {
      return lbl.getBoundingClientRect().width > 0;
    });
    candidates.sort(function (a, b) {
      var pa = parseInt(a.getAttribute('data-p') || '5', 10);
      var pb = parseInt(b.getAttribute('data-p') || '5', 10);
      return pa - pb;
    });
    var frameRect = el.frame.getBoundingClientRect();
    var placed = [];
    var PAD = 3;
    candidates.forEach(function (lbl) {
      var r = lbl.getBoundingClientRect();
      if (!r.width || !r.height) return;
      var MARGIN = 8;
      if (r.right < frameRect.left + MARGIN || r.left > frameRect.right - MARGIN ||
          r.bottom < frameRect.top + MARGIN || r.top > frameRect.bottom - MARGIN) {
        lbl.classList.add('is-collided');
        lbl.style.display = 'none';
        return;
      }
      for (var i = 0; i < placed.length; i++) {
        var o = placed[i];
        if (r.left < o.right + PAD && r.right > o.left - PAD &&
            r.top < o.bottom + PAD && r.bottom > o.top - PAD) {
          lbl.classList.add('is-collided');
          lbl.style.display = 'none';
          return;
        }
      }
      placed.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    });
  }

  function clampPan() {
    var rect = el.frame.getBoundingClientRect();
    var stageRect = el.stage.getBoundingClientRect();
    var overX = Math.max(0, (stageRect.width - rect.width) / 2 + 80);
    var overY = Math.max(0, (stageRect.height - rect.height) / 2 + 80);
    state.pan.x = Math.max(-overX, Math.min(overX, state.pan.x));
    state.pan.y = Math.max(-overY, Math.min(overY, state.pan.y));
  }

  function setZoom(next, cx, cy) {
    var clamped = Math.min(ZMAX, Math.max(ZMIN, Math.round(next * 100) / 100));
    if (typeof cx === 'number' && typeof cy === 'number') {
      var rect = el.frame.getBoundingClientRect();
      var fx = cx - rect.left - rect.width / 2;
      var fy = cy - rect.top - rect.height / 2;
      var s = clamped / state.zoom;
      state.pan.x = fx - (fx - state.pan.x) * s;
      state.pan.y = fy - (fy - state.pan.y) * s;
    }
    state.zoom = clamped;
    if (state.zoom === 1) state.pan = { x: 0, y: 0 };
    clampPan();
    applyView();
  }

  function zoomStep(mult, cx, cy) { setZoom(state.zoom * mult, cx, cy); }

  /* ─────────────── interaction ─────────────── */
  function wireDrag() {
    var dragging = false;
    var moved = false;
    var start = null;
    var pointers = {};
    var pinchStart = null;

    el.frame.addEventListener('pointerdown', function (ev) {
      if (ev.pointerId !== undefined && el.frame.setPointerCapture) {
        try { el.frame.setPointerCapture(ev.pointerId); } catch (e) {}
      }
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
        dragging = false;
        return;
      }
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      if (ev.target.closest('.pin') || ev.target.closest('.cluster-pin')) return;
      dragging = true;
      moved = false;
      start = { x: ev.clientX, y: ev.clientY, panX: state.pan.x, panY: state.pan.y };
      el.frame.classList.add('is-dragging');
    });

    el.frame.addEventListener('pointermove', function (ev) {
      if (pointers[ev.pointerId]) pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      updateCoordReadout(ev.clientX, ev.clientY);
      if (state.coordMode && !dragging && ev.shiftKey) {
        /* dev mode: click to copy coords */
      }
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinchStart) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0) setZoom(pinchStart.zoom * (dist / pinchStart.dist), pinchStart.cx, pinchStart.cy);
        moved = true;
        return;
      }
      if (!dragging) return;
      var dx = ev.clientX - start.x;
      var dy = ev.clientY - start.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      state.pan.x = start.panX + dx;
      state.pan.y = start.panY + dy;
      clampPan();
      applyView();
    });

    function endPointer(ev) {
      delete pointers[ev.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      if (!dragging) return;
      dragging = false;
      el.frame.classList.remove('is-dragging');
      if (!moved && state.addMode) startAddPin(ev.clientX, ev.clientY);
      if (!moved && state.coordMode && ev.shiftKey) copyCoords(ev.clientX, ev.clientY);
    }
    el.frame.addEventListener('pointerup', endPointer);
    el.frame.addEventListener('pointercancel', endPointer);

    el.frame.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var factor = ev.deltaY < 0 ? 1.18 : 1 / 1.18;
      if (ev.ctrlKey) factor = ev.deltaY < 0 ? 1.08 : 1 / 1.08;
      zoomStep(factor, ev.clientX, ev.clientY);
    }, { passive: false });

    el.frame.addEventListener('dblclick', function (ev) {
      ev.preventDefault();
      if (ev.target.closest('.pin') || ev.target.closest('.cluster-pin')) return;
      zoomStep(ev.shiftKey ? 1 / 1.7 : 1.7, ev.clientX, ev.clientY);
    });
  }

  function copyCoords(clientX, clientY) {
    var rect = el.stage.getBoundingClientRect();
    var xPct = (clientX - rect.left) / rect.width;
    var yPct = (clientY - rect.top) / rect.height;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    var cell = squareOfPoint(xPct, yPct);
    var text = cell.square + ' dx:' + cell.dx.toFixed(2) + ' dy:' + cell.dy.toFixed(2);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        el.coordReadout.textContent = 'copied!';
        setTimeout(function () { el.coordReadout.textContent = '[' + cell.square + ']'; }, 1200);
      });
    }
  }

  /* ─────────────── add pin ─────────────── */
  function startAddPin(clientX, clientY) {
    var rect = el.stage.getBoundingClientRect();
    var xPct = (clientX - rect.left) / rect.width;
    var yPct = (clientY - rect.top) / rect.height;
    if (xPct < 0 || xPct > 1 || yPct < 0 || yPct > 1) return;
    var cell = squareOfPoint(xPct, yPct);
    state.pending = cell;
    el.addSquare.textContent = cell.square;
    el.addForm.hidden = false;
    el.addName.focus();
  }

  function toggleAddMode(on) {
    state.addMode = on;
    el.addToggle.setAttribute('aria-pressed', String(on));
    el.frame.classList.toggle('is-adding', on);
    el.hint.textContent = on ? 'Click the map to place your pin' : 'Drag to pan · scroll to zoom · double-click to zoom in';
    if (on) el.addForm.hidden = true;
  }

  function submitAddPin(ev) {
    ev.preventDefault();
    if (!state.pending) return;
    var name = el.addName.value.trim();
    if (!name) return;
    state.mine.push({
      id: 'mine-' + Date.now().toString(36),
      name: name,
      cat: el.addCat.value,
      region: el.addRegion.value || 'Custom',
      county: '',
      square: state.pending.square,
      dx: state.pending.dx,
      dy: state.pending.dy,
      loot: el.addLoot.value.trim() ? [el.addLoot.value.trim()] : [],
      how: el.addHow.value.trim(),
      confidence: 'your own pin',
      custom: true
    });
    writeStore(MINE_KEY, state.mine);
    var newId = state.mine[state.mine.length - 1].id;
    el.addForm.reset();
    el.addForm.hidden = true;
    state.pending = null;
    toggleAddMode(false);
    buildRegionOptions();
    renderCats();
    render();
    select(newId);
  }

  /* ─────────────── import / export ─────────────── */
  function exportProgress() {
    var data = {
      version: 3,
      exported: new Date().toISOString(),
      found: state.found,
      mine: state.mine
    };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gta6-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importProgress(file) {
    var reader = new FileReader();
    reader.onload = function (e) {
      try {
        var data = JSON.parse(e.target.result);
        var imported = 0;
        if (Array.isArray(data.found)) {
          data.found.forEach(function (id) {
            if (state.found.indexOf(id) === -1) { state.found.push(id); imported++; }
          });
          writeStore(FOUND_KEY, state.found);
        }
        if (Array.isArray(data.mine)) {
          data.mine.forEach(function (item) {
            if (item && item.id && state.mine.indexOf(item) === -1) {
              var exists = state.mine.some(function (m) { return m.id === item.id; });
              if (!exists) { item.custom = true; state.mine.push(item); imported++; }
            }
          });
          writeStore(MINE_KEY, state.mine);
        }
        el.importStatus.textContent = 'Imported ' + imported + ' entries.';
        el.importStatus.style.color = 'var(--neon-green)';
        buildRegionOptions();
        renderCats();
        render();
      } catch (err) {
        el.importStatus.textContent = 'Error: ' + err.message;
        el.importStatus.style.color = 'var(--neon-pink)';
      }
    };
    reader.readAsText(file);
  }

  /* ─────────────── settings modal ─────────────── */
  function openSettings() {
    el.settingsModal.hidden = false;
    el.importStatus.textContent = '';
  }
  function closeSettings() {
    el.settingsModal.hidden = true;
  }

  /* ─────────────── boot ─────────────── */
  function cacheEls() {
    el.panel = document.getElementById('panel');
    el.panelToggle = document.getElementById('panelToggle');
    el.frame = document.getElementById('mapFrame');
    el.stage = document.getElementById('stage');
    el.pins = document.getElementById('pins');
    el.catList = document.getElementById('catList');
    el.catProgress = document.getElementById('catProgress');
    el.regionSelect = document.getElementById('regionSelect');
    el.search = document.getElementById('search');
    el.detail = document.getElementById('detail');
    el.list = document.getElementById('list');
    el.listTitle = document.getElementById('listTitle');
    el.listCount = document.getElementById('listCount');
    el.empty = document.getElementById('empty');
    el.statTotal = document.getElementById('statTotal');
    el.statFound = document.getElementById('statFound');
    el.statPct = document.getElementById('statPct');
    el.progressFill = document.getElementById('progressFill');
    el.addToggle = document.getElementById('addToggle');
    el.addForm = document.getElementById('addForm');
    el.addName = document.getElementById('addName');
    el.addCat = document.getElementById('addCat');
    el.addRegion = document.getElementById('addRegion');
    el.addLoot = document.getElementById('addLoot');
    el.addHow = document.getElementById('addHow');
    el.addSquare = document.getElementById('addSquare');
    el.hint = document.getElementById('hint');
    el.gridlines = document.getElementById('gridlines');
    el.zoomLevel = document.getElementById('zoomLevel');
    el.mapSvg = document.getElementById('mapSvg');
    el.coordReadout = document.getElementById('coordReadout');
    el.settingsBtn = document.getElementById('settingsBtn');
    el.settingsModal = document.getElementById('settingsModal');
    el.settingsClose = document.getElementById('settingsClose');
    el.exportProgress = document.getElementById('exportProgress');
    el.importFile = document.getElementById('importFile');
    el.importStatus = document.getElementById('importStatus');
  }

  function wireControls() {
    document.getElementById('zoomIn').addEventListener('click', function () { zoomStep(1.4); });
    document.getElementById('zoomOut').addEventListener('click', function () { zoomStep(1 / 1.4); });
    document.getElementById('zoomReset').addEventListener('click', function () { setZoom(1); });
    document.getElementById('fullBtn').addEventListener('click', function () {
      var wrap = document.querySelector('.mapwrap');
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else if (wrap && wrap.requestFullscreen) { wrap.requestFullscreen(); }
    });

    document.getElementById('allOn').addEventListener('click', function () {
      state.cats = Object.keys(CATS);
      renderCats();
      render();
    });
    document.getElementById('allOff').addEventListener('click', function () {
      state.cats = [];
      renderCats();
      render();
    });

    document.getElementById('gridToggle').addEventListener('change', function (ev) {
      el.gridlines.classList.toggle('is-hidden', !ev.target.checked);
    });
    document.getElementById('streetToggle').addEventListener('change', function (ev) {
      el.mapSvg.classList.toggle('hide-streets', !ev.target.checked);
    });
    document.getElementById('labelToggle').addEventListener('change', function (ev) {
      el.mapSvg.classList.toggle('hide-labels', !ev.target.checked);
    });
    document.getElementById('coordToggle').addEventListener('change', function (ev) {
      state.coordMode = ev.target.checked;
      el.hint.textContent = state.coordMode
        ? 'Dev mode: shift+click to copy coordinates'
        : (state.addMode ? 'Click the map to place your pin' : 'Drag to pan · scroll to zoom · double-click to zoom in');
    });

    document.getElementById('hideCleared').addEventListener('change', function (ev) {
      state.hideCleared = ev.target.checked;
      render();
    });

    el.search.addEventListener('input', function () {
      state.q = el.search.value;
      render();
    });

    el.regionSelect.addEventListener('change', function () {
      state.region = el.regionSelect.value;
      render();
    });

    el.addToggle.addEventListener('click', function () { toggleAddMode(!state.addMode); });
    el.addForm.addEventListener('submit', submitAddPin);
    document.getElementById('addCancel').addEventListener('click', function () {
      el.addForm.reset();
      el.addForm.hidden = true;
      state.pending = null;
      toggleAddMode(false);
    });

    el.panelToggle.addEventListener('click', function () {
      var collapsed = el.panel.classList.toggle('is-collapsed');
      el.panelToggle.setAttribute('aria-expanded', String(!collapsed));
    });

    /* Settings modal */
    el.settingsBtn.addEventListener('click', openSettings);
    el.settingsClose.addEventListener('click', closeSettings);
    el.settingsModal.addEventListener('click', function (ev) {
      if (ev.target === el.settingsModal) closeSettings();
    });
    el.exportProgress.addEventListener('click', exportProgress);
    el.importFile.addEventListener('change', function (ev) {
      if (ev.target.files && ev.target.files[0]) importProgress(ev.target.files[0]);
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
        if (!el.settingsModal.hidden) { closeSettings(); return; }
        if (!el.addForm.hidden) {
          el.addForm.reset();
          el.addForm.hidden = true;
          state.pending = null;
          toggleAddMode(false);
        } else if (state.selected) {
          clearSelection();
        }
        return;
      }
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT' || ev.target.tagName === 'TEXTAREA') return;
      if (ev.key === '+' || ev.key === '=') zoomStep(1.25);
      if (ev.key === '-') zoomStep(1 / 1.25);
      if (ev.key === '0') setZoom(1);
    });

    window.addEventListener('resize', function () {
      fitStage();
      clampPan();
      applyView();
    });
  }

  function boot() {
    cacheEls();
    buildCatOptions();
    wireDrag();
    wireControls();
    fitStage();
    applyView();

    state.found = readStore(FOUND_KEY);
    state.mine = readStore(MINE_KEY).map(function (item) { item.custom = true; return item; });

    loadData().then(function (items) {
      state.items = items;
      buildRegionOptions();
      renderCats();
      render();
      fitStage();
      document.body.classList.remove('is-booting');
      if (window.innerWidth <= 900) {
        el.panel.classList.add('is-collapsed');
        el.panelToggle.setAttribute('aria-expanded', 'false');
      }
      readHash();
    }).catch(function (err) {
      document.body.classList.remove('is-booting');
      el.empty.hidden = false;
      el.empty.textContent = 'Could not load data/locations.json (' + err.message + ').';
      el.statTotal.textContent = '—';
      renderCats();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();