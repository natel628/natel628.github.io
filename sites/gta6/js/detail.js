'use strict';
var G6 = window.G6 || {};

G6.detail = (function () {

  var TIER_LABELS = {
    official:  '✦ Officially documented',
    community: '○ Community-reported',
    estimate:  '◌ Unverified / estimated'
  };

  var RISK_LABELS = {
    none:    'None',
    low:     'Low',
    medium:  'Medium',
    high:    'High',
    unknown: 'Unknown'
  };

  function _t(text) {
    // Safe text node creation
    return document.createTextNode(text);
  }

  function _el(tag, cls, children) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function buildDetailHTML(loc, state, categories) {
    var catInfo = null;
    for (var i = 0; i < categories.length; i++) {
      if (categories[i].id === loc.category) { catInfo = categories[i]; break; }
    }
    var catColor = catInfo ? catInfo.color : '#7fd1ff';
    var catLabel = catInfo ? catInfo.label : loc.category;
    var tier     = loc.verification || 'community';
    var isFound  = !!(state.found && state.found[loc.id]);
    var note     = (state.notes && state.notes[loc.id]) || '';
    var isDest   = state.destination === loc.id;

    var frag = document.createDocumentFragment();

    // ── Header ─────────────────────────────────────────────
    var header = _el('div', 'detail-header');
    var titleEl = _el('h2', 'detail-title');
    titleEl.textContent = loc.name;
    var closeBtn = _el('button', 'detail-close');
    closeBtn.setAttribute('aria-label', 'Close detail panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', function () {
      G6.state.set({ selectedId: null });
    });
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    frag.appendChild(header);

    // ── Body ───────────────────────────────────────────────
    var body = _el('div', 'detail-body');

    // Tier badge
    var tierBadge = _el('div', 'detail-tier-badge ' + tier);
    tierBadge.textContent = TIER_LABELS[tier] || tier;
    if (tier === 'estimate') {
      tierBadge.title = 'Position is approximate. Treat this as a rough guide, not a confirmed location.';
    }
    body.appendChild(tierBadge);

    // Category chip + region row
    var metaRow = _el('div', '');
    metaRow.style.display = 'flex';
    metaRow.style.alignItems = 'center';
    metaRow.style.gap = 'var(--sp-2)';
    metaRow.style.flexWrap = 'wrap';

    var catChip = _el('span', 'detail-cat-chip');
    catChip.style.setProperty('--cat-color', catColor);
    var catDot = _el('span', 'detail-cat-dot');
    catChip.appendChild(catDot);
    catChip.appendChild(document.createTextNode(catLabel));
    metaRow.appendChild(catChip);

    if (loc.region) {
      // Show the region's label, not its id.
      var regionLabel = loc.region;
      var regions = state.regions || [];
      for (var r = 0; r < regions.length; r++) {
        if (regions[r].id === loc.region) { regionLabel = regions[r].label; break; }
      }
      var regionSpan = _el('span', '');
      regionSpan.style.fontSize = '.72rem';
      regionSpan.style.color    = 'var(--g6-muted)';
      regionSpan.textContent    = regionLabel;
      metaRow.appendChild(regionSpan);
    }
    body.appendChild(metaRow);

    // Summary / hint
    if (loc.summary) {
      var sumField = _field('Description', loc.summary);
      body.appendChild(sumField);
    }
    if (loc.hint && loc.hint !== loc.summary) {
      var hintField = _field('How to find', loc.hint);
      body.appendChild(hintField);
    }

    // Extra pointers: what to bring, when to go, what trips people up.
    if (loc.tips && loc.tips.length) {
      var tipsField = _el('div', 'detail-field');
      tipsField.appendChild(_label('Tips'));
      var tipsList = _el('ul', 'detail-rewards');
      loc.tips.forEach(function (tip) {
        var li = _el('li', '');
        li.textContent = tip;
        tipsList.appendChild(li);
      });
      tipsField.appendChild(tipsList);
      body.appendChild(tipsField);
    }

    // Coordinates here are estimates; say so instead of implying GPS precision.
    if (loc.position && loc.position.method === 'estimated') {
      var accNote = _el('p', '');
      accNote.style.cssText = 'font-size:.68rem;color:var(--g6-muted);margin-top:var(--sp-1)';
      accNote.textContent = 'Pin is approximate (\u00b1' + (loc.position.accuracy || 500) +
                            '\u202fm). Use the written directions to find the exact spot.';
      body.appendChild(accNote);
    }

    // Rewards
    if (loc.rewards && loc.rewards.length) {
      var rwField = _el('div', 'detail-field');
      rwField.appendChild(_label('Rewards / Loot'));
      var rwList  = _el('ul', 'detail-rewards');
      loc.rewards.forEach(function (r) {
        var li = _el('li', '');
        li.textContent = r;
        rwList.appendChild(li);
      });
      rwField.appendChild(rwList);
      body.appendChild(rwField);
    }

    // Safe code
    if (loc.code) {
      var codeField = _el('div', 'detail-field');
      codeField.appendChild(_label('Safe / Keypad Code'));
      var codeEl = _el('div', 'detail-code');
      codeEl.textContent = loc.code;
      codeField.appendChild(codeEl);
      body.appendChild(codeField);
    }

    // Risk
    if (loc.risk) {
      var riskRow = _el('div', 'detail-field');
      riskRow.appendChild(_label('Risk'));
      var riskBadge = _el('span', 'risk-badge ' + (loc.risk || 'unknown'));
      riskBadge.textContent = RISK_LABELS[loc.risk] || loc.risk;
      riskRow.appendChild(riskBadge);
      body.appendChild(riskRow);
    }

    // Sources
    if (loc.sources && loc.sources.length) {
      var srcField = _el('div', 'detail-field');
      srcField.appendChild(_label('Sources'));
      var srcList = _el('div', 'detail-sources');
      loc.sources.forEach(function (src) {
        var a = _el('a', 'detail-source-link');
        a.href = src.url;
        a.textContent = src.label;
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
        srcList.appendChild(a);
      });
      srcField.appendChild(srcList);
      body.appendChild(srcField);
    }

    // ── Actions ────────────────────────────────────────────
    var actions = _el('div', 'detail-actions');

    // Mark found
    var foundBtn = _el('button', 'action-btn' + (isFound ? ' success' : ' primary'));
    foundBtn.innerHTML = isFound ? '&#10003; Marked as Found' : '&#9675; Mark as Found';
    foundBtn.addEventListener('click', function () {
      var s = G6.state.get();
      var newFound = Object.assign({}, s.found);
      if (newFound[loc.id]) {
        delete newFound[loc.id];
      } else {
        newFound[loc.id] = new Date().toISOString();
      }
      G6.state.set({ found: newFound });
      _saveProgress();
      G6.dom.toast(newFound[loc.id] ? 'Marked as found!' : 'Unmarked', 'success');
      // Re-render detail
      G6.detail.showById(loc.id);
    });
    actions.appendChild(foundBtn);

    // Set as destination
    var destBtn = _el('button', 'action-btn' + (isDest ? ' success' : ''));
    destBtn.innerHTML = isDest ? '&#9873; Destination set' : '&#9873; Set as Destination';
    destBtn.addEventListener('click', function () {
      G6.navigation.setDestination(loc.id);
      G6.dom.toast('Destination set', 'info');
      G6.detail.showById(loc.id);
    });
    actions.appendChild(destBtn);

    // Copy link
    var copyBtn = _el('button', 'action-btn');
    copyBtn.textContent = '⧉ Copy Link';
    copyBtn.addEventListener('click', function () {
      var url = location.origin + location.pathname + '#l=' + loc.id;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          G6.dom.toast('Link copied!', 'success');
        }).catch(function () {
          _fallbackCopy(url);
        });
      } else {
        _fallbackCopy(url);
      }
    });
    actions.appendChild(copyBtn);

    body.appendChild(actions);

    // ── Note ───────────────────────────────────────────────
    var noteField = _el('div', 'detail-field');
    noteField.appendChild(_label('My Note'));
    var noteArea = _el('textarea', 'note-area');
    noteArea.placeholder = 'Add a personal note\u2026';
    noteArea.value = note;
    noteArea.setAttribute('maxlength', '500');
    noteArea.addEventListener('input', G6.dom.debounce(function () {
      var s = G6.state.get();
      var newNotes = Object.assign({}, s.notes);
      var val = noteArea.value.trim();
      if (val) newNotes[loc.id] = val;
      else     delete newNotes[loc.id];
      G6.state.set({ notes: newNotes });
      _saveProgress();
    }, 600));
    noteField.appendChild(noteArea);
    body.appendChild(noteField);

    frag.appendChild(body);
    return frag;
  }

  function _field(labelText, value) {
    var field = G6.dom.el('div', { className: 'detail-field' });
    field.appendChild(_label(labelText));
    var val = G6.dom.el('p', { className: 'detail-field-value', textContent: value });
    field.appendChild(val);
    return field;
  }

  function _label(text) {
    var el = document.createElement('div');
    el.className = 'detail-field-label';
    el.textContent = text;
    return el;
  }

  function _fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); G6.dom.toast('Link copied!', 'success'); }
    catch (e) { G6.dom.toast('Could not copy link', 'error'); }
    document.body.removeChild(ta);
  }

  function _saveProgress() {
    var s = G6.state.get();
    G6.storage.saveProgress({
      found:    s.found,
      notes:    s.notes,
      custom:   s.custom,
      position: s.position,
      prefs:    s.prefs
    });
  }

  // Show detail for a location id
  function showById(id) {
    var s = G6.state.get();
    var loc = null;
    for (var i = 0; i < s.locations.length; i++) {
      if (s.locations[i].id === id) { loc = s.locations[i]; break; }
    }
    if (!loc) { hide(); return; }

    var isMobile = window.innerWidth < 760;

    if (isMobile) {
      _renderInto(document.getElementById('sheetDetailHost'), loc, s, s.categories);
      // Detail replaces the sheet's location list, and the sheet opens to half
      var sheet = document.querySelector('.bottom-sheet');
      if (sheet) {
        sheet.classList.add('has-detail');
        _snapSheet(sheet, 'half');
      }
    } else {
      var host = document.getElementById('desktopDetailHost');
      if (host) {
        _renderInto(host, loc, s, s.categories);
        document.querySelector('.app').classList.add('detail-open');
        G6.map.invalidate();
      }
    }

    // Fly to marker
    if (loc.position) {
      G6.map.flyTo(loc.position.x, loc.position.y, -1);
    }

    // Update hash
    history.replaceState(null, '', '#l=' + id);
  }

  function _renderInto(host, loc, state, categories) {
    if (!host) return;
    while (host.firstChild) host.removeChild(host.firstChild);
    host.appendChild(buildDetailHTML(loc, state, categories));
  }

  function hide() {
    // Desktop
    var app = document.querySelector('.app');
    if (app) app.classList.remove('detail-open');
    var host = document.getElementById('desktopDetailHost');
    if (host) while (host.firstChild) host.removeChild(host.firstChild);
    // Mobile — clear the sheet's detail and snap back to peek
    var sheetHost = document.getElementById('sheetDetailHost');
    if (sheetHost) while (sheetHost.firstChild) sheetHost.removeChild(sheetHost.firstChild);
    var sheet = document.querySelector('.bottom-sheet');
    if (sheet) {
      sheet.classList.remove('has-detail');
      if (sheet.dataset.snap !== 'peek') _snapSheet(sheet, 'peek');
    }
    // Clear hash
    history.replaceState(null, '', location.pathname);
    G6.map.invalidate();
  }

  function _snapSheet(sheet, snap) {
    sheet.dataset.snap = snap;
    document.body.dataset.sheetSnap = snap;
  }

  window.G6 = G6;
  return { showById: showById, hide: hide, buildDetailHTML: buildDetailHTML };

})();

window.G6 = G6;
