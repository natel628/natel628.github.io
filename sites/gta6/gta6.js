/* GTA 6 loot map — grid-referenced pins, filters, progress and pin dropping. */
(function () {
  'use strict';

  var CATS = {
    weapons: { label: 'Hidden weapons', color: '#e8536b' },
    cash: { label: 'Cash stashes', color: '#f0a35e' },
    code: { label: 'Safes & codes', color: '#45cfc0' },
    collect: { label: 'Collectibles', color: '#b18cf0' }
  };

  var COLS = 9;
  var ROWS = 13;
  var FOUND_KEY = 'gta6.found.v2';
  var MINE_KEY = 'gta6.mine.v2';

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
    pending: null
  };

  var el = {};

  /* ---------- storage ---------- */

  function readStore(key) {
    try {
      var raw = window.localStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* private mode — progress just will not persist */
    }
  }

  /* ---------- grid maths ---------- */

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

  /* ---------- data ---------- */

  function allItems() {
    return state.items.concat(state.mine);
  }

  function catInfo(cat) {
    return CATS[cat] || { label: 'Other', color: '#8b9ab2' };
  }

  function isFound(id) {
    return state.found.indexOf(id) !== -1;
  }

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
        item.name, item.region, item.county, item.square, item.how, item.code, item.risk,
        (item.loot || []).join(' ')
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

  /* ---------- rendering ---------- */

  function render() {
    renderPins();
    renderList();
    renderProgress();
  }

  function renderPins() {
    var frag = document.createDocumentFragment();
    var shown = visible();
    var shownIds = {};

    shown.forEach(function (item) {
      shownIds[item.id] = true;
      var p = pos(item);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin';
      btn.dataset.id = item.id;
      btn.style.left = p.x + '%';
      btn.style.top = p.y + '%';
      btn.style.setProperty('--c', catInfo(item.cat).color);
      btn.setAttribute('aria-label', item.name + ' — grid ' + item.square);

      if (isFound(item.id)) btn.classList.add('is-found');
      if (item.custom) btn.classList.add('is-mine');
      if (state.selected === item.id) btn.classList.add('is-active');

      var dot = document.createElement('i');
      btn.appendChild(dot);

      var label = document.createElement('span');
      label.className = 'pin-label';
      label.textContent = item.name;
      btn.appendChild(label);

      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        select(item.id);
      });

      frag.appendChild(btn);
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

      row.addEventListener('click', function () { select(item.id); });
      li.appendChild(row);
      frag.appendChild(li);
    });

    el.list.appendChild(frag);

    el.empty.hidden = items.length > 0;
    el.listCount.textContent = items.length + ' shown';
    el.listTitle.textContent = state.region === 'all'
      ? (state.cats.length === 1 ? catInfo(state.cats[0]).label : 'All spots')
      : state.region;
  }

  function renderProgress() {
    var total = allItems().length;
    var done = state.found.length;
    var codes = allItems().filter(function (i) { return !!i.code; }).length;
    el.statTotal.textContent = total;
    el.statFound.textContent = done;
    el.statCodes.textContent = codes;
    el.progressFill.style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    el.exportBtn.hidden = state.mine.length === 0;
  }

  function renderCats() {
    el.catList.innerHTML = '';
    var items = allItems();

    Object.keys(CATS).forEach(function (cat) {
      var count = items.filter(function (i) { return i.cat === cat; }).length;
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

      var dot = document.createElement('span');
      dot.className = 'cat-dot';

      var name = document.createElement('span');
      name.className = 'cat-name';
      name.textContent = CATS[cat].label;

      var num = document.createElement('span');
      num.className = 'cat-count';
      num.textContent = count;

      label.appendChild(box);
      label.appendChild(dot);
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

  /* ---------- detail ---------- */

  function select(id) {
    state.selected = id;
    renderPins();
    renderList();
    renderDetail();
    if (window.innerWidth <= 900) {
      el.panel.classList.remove('is-collapsed');
      el.panelToggle.setAttribute('aria-expanded', 'true');
    }
    if (el.detail && !el.detail.hidden) el.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function renderDetail() {
    var item = null;
    allItems().forEach(function (c) {
      if (c.id === state.selected) item = c;
    });

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

    var badges = document.createElement('div');
    badges.className = 'badges';
    badges.appendChild(badge(info.label, 'badge-cat', info.color));
    badges.appendChild(badge('grid ' + item.square, 'badge-square'));
    badges.appendChild(badge(item.region + (item.county ? ' · ' + item.county : '')));
    badges.appendChild(badge(item.confidence || 'community-reported', 'badge-warn'));
    if (item.custom) badges.appendChild(badge('your pin'));
    el.detail.appendChild(badges);

    (item.loot || []).forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'lootline';
      p.textContent = line;
      el.detail.appendChild(p);
    });

    if (item.code) {
      var box = document.createElement('div');
      box.className = 'codebox';
      var lb = document.createElement('b');
      lb.textContent = 'code';
      box.appendChild(lb);
      box.appendChild(document.createTextNode(item.code));
      el.detail.appendChild(box);
    }

    if (item.how) {
      var how = document.createElement('p');
      how.className = 'how';
      how.textContent = item.how;
      el.detail.appendChild(how);
    }

    if (item.risk) {
      var risk = document.createElement('p');
      risk.className = 'risk';
      risk.textContent = item.risk;
      el.detail.appendChild(risk);
    }

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

    var foot = document.createElement('div');
    foot.className = 'detail-foot';

    var lab = document.createElement('label');
    lab.className = 'found';
    var check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = isFound(item.id);
    check.addEventListener('change', function () { toggleFound(item.id, check.checked); });
    lab.appendChild(check);
    lab.appendChild(document.createTextNode('Cleared it'));
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

  /* ---------- view ---------- */

  var MAP_RATIO = 900 / 1300;

  // Keep the transformed stage exactly on the map's rendered box, so pins and
  // the coastline share one coordinate space at any window size.
  function fitStage() {
    var w = el.frame.clientWidth;
    var h = el.frame.clientHeight;
    if (!w || !h) return;
    var sw = w;
    var sh = w / MAP_RATIO;
    if (sh > h) {
      sh = h;
      sw = h * MAP_RATIO;
    }
    el.stage.style.width = sw + 'px';
    el.stage.style.height = sh + 'px';
    el.stage.style.left = Math.round((w - sw) / 2) + 'px';
    el.stage.style.top = Math.round((h - sh) / 2) + 'px';
  }

  function applyView() {
    el.stage.style.transform = 'translate(' + state.pan.x + 'px, ' + state.pan.y + 'px) scale(' + state.zoom + ')';
    el.pins.style.setProperty('--inv', String(1 / state.zoom));
  }

  function clampPan() {
    var rect = el.frame.getBoundingClientRect();
    var maxX = (rect.width * (state.zoom - 1)) / 2;
    var maxY = (rect.height * (state.zoom - 1)) / 2;
    state.pan.x = Math.max(-maxX, Math.min(maxX, state.pan.x));
    state.pan.y = Math.max(-maxY, Math.min(maxY, state.pan.y));
  }

  function setZoom(next) {
    state.zoom = Math.min(3, Math.max(1, Math.round(next * 100) / 100));
    if (state.zoom === 1) state.pan = { x: 0, y: 0 };
    clampPan();
    applyView();
  }

  /* ---------- interaction ---------- */

  function wireDrag() {
    var dragging = false;
    var moved = false;
    var start = null;

    el.frame.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0) return;
      if (ev.target.closest('.pin')) return;
      dragging = true;
      moved = false;
      start = { x: ev.clientX, y: ev.clientY, panX: state.pan.x, panY: state.pan.y };
      el.frame.classList.add('is-dragging');
    });

    window.addEventListener('pointermove', function (ev) {
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

    window.addEventListener('pointerup', function (ev) {
      if (!dragging) return;
      dragging = false;
      el.frame.classList.remove('is-dragging');
      if (!moved && state.addMode) startAddPin(ev.clientX, ev.clientY);
    });

    window.addEventListener('pointercancel', function () {
      dragging = false;
      el.frame.classList.remove('is-dragging');
    });

    el.frame.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      setZoom(state.zoom + (ev.deltaY < 0 ? 0.3 : -0.3));
    }, { passive: false });
  }

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
    el.hint.textContent = on ? 'Click the map to place your pin' : 'Drag to pan · scroll to zoom';
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

  function exportPins() {
    var blob = new Blob([JSON.stringify(state.mine, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'gta6-custom-pins.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------- boot ---------- */

  function cacheEls() {
    el.panel = document.getElementById('panel');
    el.panelToggle = document.getElementById('panelToggle');
    el.frame = document.getElementById('mapFrame');
    el.stage = document.getElementById('stage');
    el.pins = document.getElementById('pins');
    el.catList = document.getElementById('catList');
    el.regionSelect = document.getElementById('regionSelect');
    el.search = document.getElementById('search');
    el.detail = document.getElementById('detail');
    el.list = document.getElementById('list');
    el.listTitle = document.getElementById('listTitle');
    el.listCount = document.getElementById('listCount');
    el.empty = document.getElementById('empty');
    el.statTotal = document.getElementById('statTotal');
    el.statFound = document.getElementById('statFound');
    el.statCodes = document.getElementById('statCodes');
    el.progressFill = document.getElementById('progressFill');
    el.addToggle = document.getElementById('addToggle');
    el.addForm = document.getElementById('addForm');
    el.addName = document.getElementById('addName');
    el.addCat = document.getElementById('addCat');
    el.addRegion = document.getElementById('addRegion');
    el.addLoot = document.getElementById('addLoot');
    el.addHow = document.getElementById('addHow');
    el.addSquare = document.getElementById('addSquare');
    el.exportBtn = document.getElementById('exportBtn');
    el.hint = document.getElementById('hint');
    el.gridlines = document.getElementById('gridlines');
  }

  function wireControls() {
    document.getElementById('zoomIn').addEventListener('click', function () { setZoom(state.zoom + 0.4); });
    document.getElementById('zoomOut').addEventListener('click', function () { setZoom(state.zoom - 0.4); });
    document.getElementById('zoomReset').addEventListener('click', function () { setZoom(1); });

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
    el.exportBtn.addEventListener('click', exportPins);

    el.panelToggle.addEventListener('click', function () {
      var collapsed = el.panel.classList.toggle('is-collapsed');
      el.panelToggle.setAttribute('aria-expanded', String(!collapsed));
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') {
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
      if (ev.target.tagName === 'INPUT' || ev.target.tagName === 'SELECT') return;
      if (ev.key === '+' || ev.key === '=') setZoom(state.zoom + 0.3);
      if (ev.key === '-') setZoom(state.zoom - 0.3);
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
    state.mine = readStore(MINE_KEY).map(function (item) {
      item.custom = true;
      return item;
    });

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
