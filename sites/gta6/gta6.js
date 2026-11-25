/* GTA 6 loot map — pins, filters, found-tracking and local custom pins. */
(function () {
  'use strict';

  var CATS = {
    weapons: { label: 'Hidden weapons', color: '#ff3b6b', blurb: 'free pickups and unique variants' },
    cash: { label: 'Cash stashes', color: '#ffc857', blurb: 'marked bills, wallets, vents' },
    code: { label: 'Safes & codes', color: '#35e0d0', blurb: 'keypad codes you type in' },
    collect: { label: 'Collectibles', color: '#ff9f45', blurb: 'cards, oddities, endings' }
  };

  var FOUND_KEY = 'gta6.found.v1';
  var MINE_KEY = 'gta6.mine.v1';

  var state = {
    items: [],
    found: [],
    mine: [],
    cat: 'all',
    region: 'all',
    q: '',
    selected: null,
    addMode: false,
    pending: null,
    zoom: 1,
    pan: { x: 0, y: 0 }
  };

  var el = {};
  var listOrder = [];

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
      /* private mode or quota — found-tracking just won't persist */
    }
  }

  /* ---------- data ---------- */

  function loadData() {
    return fetch('./data/locations.json', { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('locations.json returned ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error('locations.json is not an array');
        return data.filter(function (item) {
          return item && item.id && item.name && typeof item.x === 'number' && typeof item.y === 'number';
        });
      });
  }

  function allItems() {
    return state.items.concat(state.mine);
  }

  function catInfo(cat) {
    return CATS[cat] || { label: 'Other', color: '#94a2c9', blurb: '' };
  }

  function isFound(id) {
    return state.found.indexOf(id) !== -1;
  }

  function filtered() {
    var q = state.q.trim().toLowerCase();
    return allItems().filter(function (item) {
      if (state.cat !== 'all' && item.cat !== state.cat) return false;
      if (state.region !== 'all' && item.region !== state.region) return false;
      if (!q) return true;
      var hay = [item.name, item.region, item.county, item.how, item.code, (item.loot || []).join(' ')]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.indexOf(q) !== -1;
    }).sort(function (a, b) {
      if (a.region !== b.region) return a.region < b.region ? -1 : 1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
  }

  /* ---------- rendering ---------- */

  function buildChips() {
    el.catChips.innerHTML = '';

    var allChip = makeChip('all', 'Everything', null);
    el.catChips.appendChild(allChip);

    Object.keys(CATS).forEach(function (cat) {
      el.catChips.appendChild(makeChip(cat, CATS[cat].label, CATS[cat].color));
    });
  }

  function makeChip(cat, label, color) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip';
    btn.dataset.cat = cat;
    btn.setAttribute('aria-pressed', String(state.cat === cat));
    if (color) {
      var dot = document.createElement('i');
      dot.style.setProperty('--c', color);
      btn.appendChild(dot);
    }
    btn.appendChild(document.createTextNode(label));
    btn.addEventListener('click', function () {
      state.cat = cat;
      Array.prototype.forEach.call(el.catChips.children, function (chip) {
        chip.setAttribute('aria-pressed', String(chip.dataset.cat === cat));
      });
      render();
    });
    return btn;
  }

  function buildLegend() {
    el.legend.innerHTML = '';
    Object.keys(CATS).forEach(function (cat) {
      var span = document.createElement('span');
      var i = document.createElement('i');
      i.style.setProperty('--c', CATS[cat].color);
      span.appendChild(i);
      span.appendChild(document.createTextNode(CATS[cat].label));
      el.legend.appendChild(span);
    });
    var note = document.createElement('span');
    note.style.color = 'rgba(148,162,201,0.7)';
    note.textContent = 'hollow = you cleared it';
    el.legend.appendChild(note);
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
        var optAll = document.createElement('option');
        optAll.value = 'all';
        optAll.textContent = 'All Leonida';
        select.appendChild(optAll);
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

  function buildCatOptions(select) {
    select.innerHTML = '';
    Object.keys(CATS).forEach(function (cat) {
      var opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = CATS[cat].label;
      select.appendChild(opt);
    });
  }

  function render() {
    renderPins();
    renderList();
    renderStats();
  }

  function renderPins() {
    var frag = document.createDocumentFragment();
    var visible = filtered();
    var visibleIds = {};

    visible.forEach(function (item) {
      visibleIds[item.id] = true;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pin';
      btn.dataset.id = item.id;
      btn.style.left = item.x + '%';
      btn.style.top = item.y + '%';
      btn.style.setProperty('--c', catInfo(item.cat).color);
      btn.setAttribute('aria-label', item.name);
      btn.title = item.name + ' — ' + catInfo(item.cat).label;

      if (isFound(item.id)) btn.classList.add('is-found');
      if (item.custom) btn.classList.add('is-new');
      if (state.selected === item.id) btn.classList.add('is-active');

      var dot = document.createElement('span');
      dot.className = 'pin-dot';
      btn.appendChild(dot);

      btn.addEventListener('click', function (ev) {
        ev.stopPropagation();
        select(item.id);
      });

      frag.appendChild(btn);
    });

    el.pins.innerHTML = '';
    el.pins.appendChild(frag);

    if (state.selected && !visibleIds[state.selected]) {
      state.selected = null;
      renderDetail();
    }
  }

  function renderList() {
    var items = filtered();
    el.list.innerHTML = '';

    var frag = document.createDocumentFragment();
    items.forEach(function (item) {
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
      var bits = [item.region];
      if (item.code) {
        var code = document.createElement('span');
        code.className = 'row-code';
        code.textContent = 'code ' + item.code;
        meta.appendChild(document.createTextNode(bits.join(' · ') + ' · '));
        meta.appendChild(code);
      } else {
        meta.textContent = bits.join(' · ') + ' · ' + catInfo(item.cat).label.toLowerCase();
      }
      body.appendChild(meta);
      row.appendChild(body);

      row.addEventListener('click', function () {
        select(item.id);
      });

      li.appendChild(row);
      frag.appendChild(li);
    });

    el.list.appendChild(frag);

    el.empty.hidden = items.length > 0;
    el.listCount.textContent = items.length + ' of ' + allItems().length;
    el.listTitle.textContent = state.cat === 'all'
      ? (state.region === 'all' ? 'All spots' : state.region)
      : catInfo(state.cat).label;
  }

  function renderStats() {
    var items = allItems();
    var codes = items.filter(function (i) { return !!i.code; }).length;
    el.statTotal.textContent = items.length;
    el.statFound.textContent = state.found.length;
    el.statCodes.textContent = codes;
    el.exportBtn.hidden = state.mine.length === 0;
  }

  function select(id) {
    state.selected = id;
    renderPins();
    renderList();
    renderDetail();
    if (window.innerWidth < 1000) {
      el.detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }

  function renderDetail() {
    var item = null;
    allItems().forEach(function (candidate) {
      if (candidate.id === state.selected) item = candidate;
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
    close.addEventListener('click', function () {
      state.selected = null;
      renderPins();
      renderList();
      renderDetail();
    });
    top.appendChild(close);
    el.detail.appendChild(top);

    var badges = document.createElement('div');
    badges.className = 'badges';
    badges.appendChild(makeBadge(info.label, 'badge-cat', info.color));
    badges.appendChild(makeBadge(item.region + (item.county ? ' · ' + item.county : '')));
    badges.appendChild(makeBadge(item.confidence || 'community-reported', 'badge-warn'));
    if (item.custom) badges.appendChild(makeBadge('your pin'));
    el.detail.appendChild(badges);

    (item.loot || []).forEach(function (line) {
      var p = document.createElement('p');
      p.className = 'detail-loot';
      p.textContent = line;
      el.detail.appendChild(p);
    });

    if (item.code) {
      var codeBox = document.createElement('div');
      codeBox.className = 'detail-code';
      var label = document.createElement('b');
      label.textContent = 'code';
      codeBox.appendChild(label);
      codeBox.appendChild(document.createTextNode(item.code));
      el.detail.appendChild(codeBox);
    }

    if (item.how) {
      var how = document.createElement('p');
      how.className = 'how';
      how.textContent = item.how;
      el.detail.appendChild(how);
    }

    if (item.risk) {
      var risk = document.createElement('p');
      risk.className = 'how';
      risk.style.color = 'rgba(255,200,87,0.85)';
      risk.style.fontSize = '12px';
      risk.textContent = item.risk;
      el.detail.appendChild(risk);
    }

    var foot = document.createElement('div');
    foot.className = 'detail-foot';

    var label = document.createElement('label');
    label.className = 'found-label';
    var box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = isFound(item.id);
    box.addEventListener('change', function () {
      toggleFound(item.id, box.checked);
    });
    label.appendChild(box);
    label.appendChild(document.createTextNode('Cleared it'));
    foot.appendChild(label);

    if (item.source) {
      var link = document.createElement('a');
      link.className = 'source';
      link.href = item.source;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'source ↗';
      foot.appendChild(link);
    }

    el.detail.appendChild(foot);
  }

  function makeBadge(text, extraClass, color) {
    var span = document.createElement('span');
    span.className = 'badge' + (extraClass ? ' ' + extraClass : '');
    if (color) span.style.setProperty('--c', color);
    span.textContent = text;
    return span;
  }

  function toggleFound(id, on) {
    var idx = state.found.indexOf(id);
    if (on && idx === -1) state.found.push(id);
    if (!on && idx !== -1) state.found.splice(idx, 1);
    writeStore(FOUND_KEY, state.found);
    render();
    renderDetail();
  }

  /* ---------- view transform ---------- */

  function applyView() {
    el.stage.style.transform = 'translate(' + state.pan.x + 'px, ' + state.pan.y + 'px) scale(' + state.zoom + ')';
    el.pins.style.setProperty('--inv', String(1 / state.zoom));
  }

  function setZoom(next) {
    state.zoom = Math.min(2.6, Math.max(1, Number(next.toFixed(2))));
    if (state.zoom === 1) state.pan = { x: 0, y: 0 };
    clampPan();
    applyView();
  }

  function clampPan() {
    var rect = el.frame.getBoundingClientRect();
    var maxX = (rect.width * (state.zoom - 1)) / 2;
    var maxY = (rect.height * (state.zoom - 1)) / 2;
    state.pan.x = Math.max(-maxX, Math.min(maxX, state.pan.x));
    state.pan.y = Math.max(-maxY, Math.min(maxY, state.pan.y));
  }

  /* ---------- interactions ---------- */

  function wireDrag() {
    var dragging = false;
    var moved = false;
    var start = null;

    el.frame.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.pin')) return;
      if (ev.button !== 0) return;
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

      if (!moved && state.addMode) {
        beginAddPin(ev.clientX, ev.clientY);
      }
    });

    window.addEventListener('pointercancel', function () {
      dragging = false;
      el.frame.classList.remove('is-dragging');
    });
  }

  function beginAddPin(clientX, clientY) {
    var rect = el.stage.getBoundingClientRect();
    var x = ((clientX - rect.left) / rect.width) * 100;
    var y = ((clientY - rect.top) / rect.height) * 100;

    if (x < 0 || x > 100 || y < 0 || y > 100) return;

    state.pending = { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
    el.addCoords.textContent = state.pending.x + '% / ' + state.pending.y + '%';
    el.addForm.hidden = false;
    el.addName.focus();
  }

  function toggleAddMode(on) {
    state.addMode = on;
    el.addToggle.setAttribute('aria-pressed', String(on));
    el.frame.classList.toggle('is-adding', on);
    el.mapHint.textContent = on ? 'Click the map to place your pin' : 'Drag to pan · +/− to zoom';
    if (on) {
      el.addForm.hidden = true;
      el.mapHint.parentElement.scrollIntoView({ block: 'nearest' });
    }
  }

  function submitAddPin(ev) {
    ev.preventDefault();
    if (!state.pending) return;

    var name = el.addName.value.trim();
    if (!name) return;

    var item = {
      id: 'mine-' + Date.now().toString(36),
      name: name,
      cat: el.addCat.value,
      region: el.addRegion.value || 'Port Gellhorn',
      county: '',
      x: state.pending.x,
      y: state.pending.y,
      loot: el.addLoot.value.trim() ? [el.addLoot.value.trim()] : [],
      how: el.addHow.value.trim(),
      confidence: 'your own pin',
      source: '',
      custom: true
    };

    state.mine.push(item);
    writeStore(MINE_KEY, state.mine);

    el.addForm.reset();
    el.addForm.hidden = true;
    state.pending = null;
    toggleAddMode(false);

    buildRegionOptions();
    render();
    select(item.id);
  }

  function exportPins() {
    var json = JSON.stringify(state.mine, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
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
    el.frame = document.getElementById('mapFrame');
    el.stage = document.getElementById('stage');
    el.pins = document.getElementById('pins');
    el.legend = document.getElementById('legend');
    el.catChips = document.getElementById('catChips');
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
    el.addToggle = document.getElementById('addToggle');
    el.addForm = document.getElementById('addForm');
    el.addName = document.getElementById('addName');
    el.addCat = document.getElementById('addCat');
    el.addRegion = document.getElementById('addRegion');
    el.addLoot = document.getElementById('addLoot');
    el.addHow = document.getElementById('addHow');
    el.addCoords = document.getElementById('addCoords');
    el.exportBtn = document.getElementById('exportBtn');
    el.mapHint = document.getElementById('mapHint');
  }

  function wireControls() {
    document.getElementById('zoomIn').addEventListener('click', function () { setZoom(state.zoom + 0.4); });
    document.getElementById('zoomOut').addEventListener('click', function () { setZoom(state.zoom - 0.4); });
    document.getElementById('zoomReset').addEventListener('click', function () { setZoom(1); });

    el.addToggle.addEventListener('click', function () { toggleAddMode(!state.addMode); });
    el.addForm.addEventListener('submit', submitAddPin);
    document.getElementById('addCancel').addEventListener('click', function () {
      el.addForm.reset();
      el.addForm.hidden = true;
      state.pending = null;
      toggleAddMode(false);
    });
    el.exportBtn.addEventListener('click', exportPins);

    el.regionSelect.addEventListener('change', function () {
      state.region = el.regionSelect.value;
      render();
    });

    el.search.addEventListener('input', function () {
      state.q = el.search.value;
      render();
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Escape') return;
      if (!el.addForm.hidden) {
        el.addForm.reset();
        el.addForm.hidden = true;
        state.pending = null;
        toggleAddMode(false);
        return;
      }
      if (state.selected) {
        state.selected = null;
        renderPins();
        renderList();
        renderDetail();
      }
    });

    window.addEventListener('resize', function () {
      clampPan();
      applyView();
    });
  }

  function boot() {
    cacheEls();
    buildLegend();
    buildCatOptions(el.addCat);
    wireDrag();
    wireControls();
    applyView();

    state.found = readStore(FOUND_KEY);
    state.mine = readStore(MINE_KEY).map(function (item) {
      item.custom = true;
      return item;
    });

    loadData()
      .then(function (items) {
        state.items = items;
        buildChips();
        buildRegionOptions();
        render();
      })
      .catch(function (err) {
        el.list.innerHTML = '';
        el.empty.hidden = false;
        el.empty.textContent = 'Could not load data/locations.json (' + err.message + '). Serve this folder over HTTP rather than opening the file directly.';
        el.statTotal.textContent = '—';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
