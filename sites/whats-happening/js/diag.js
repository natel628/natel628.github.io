/* What's Happening? - hidden diagnostics panel.

   Open with ?diag=1, #diag, or Ctrl+Alt+D, or call window.WHDIAG.run().
   It loads a copy of this page in a hidden iframe and drives it with real
   clicks (filters, watchlist, calendar, map, sheet), then lists what failed.
   Running in an iframe means the page you are looking at is never touched. */
window.WHDIAG = (function () {
  'use strict';

  var LIB = 'diag-3';
  var running = false, report = '', panel = null;
  var root = null;   // stable wrapper so the panel cannot be lost

  function mark(k, v) {
    try { document.documentElement.setAttribute('data-diag-' + k, String(v)); } catch (e) {}
  }
  function q(d, sel) { return d.querySelector(sel); }
  function qa(d, sel) { return Array.prototype.slice.call(d.querySelectorAll(sel)); }
  function assert(cond, msg) { if (!cond) throw new Error(msg); }
  function click(d, sel) {
    var n = q(d, sel);
    assert(n, 'element not found: ' + sel);
    n.click();
  }
  function bytes(s) {
    try { return new TextEncoder().encode(s).length; } catch (e) { return unescape(encodeURIComponent(s)).length; }
  }
  function nowStamp() { return new Date().toISOString(); }
  function ms(t0) { return Math.round(Date.now() - t0) + 'ms'; }

  function wait(fn, limit, label) {
    var t0 = Date.now();
    return new Promise(function (res, rej) {
      (function tick() {
        var v = fn();
        if (v) return res(v);
        if (Date.now() - t0 > limit) return rej(new Error('timeout after ' + limit + 'ms' + (label ? ': ' + label : '')));
        setTimeout(tick, 120);
      })();
    });
  }

  function params() {
    try { return new URLSearchParams(location.search); } catch (e) { return null; }
  }
  function isFrame() { var p = params(); return !!p && p.get('frame') === '1'; }
  function wanted() {
    var p = params();
    if (p && p.get('diag') === '1') return true;
    return (location.hash || '').toLowerCase().indexOf('diag') >= 0;
  }

  mark('lib', LIB + (isFrame() ? ' frame' : wanted() ? ' wanted' : ' idle'));

  /* ---------------- harness context ---------------- */
  function refresh(c) {
    c.w = c.frame.contentWindow;
    c.d = c.frame.contentDocument || c.w.document;
    c.W = c.w.WH;
    c.S = c.W.state;
    return c;
  }

  function reloadFrame(c) {
    return new Promise(function (res) {
      var f = c.frame, done = false;
      function go() { if (done) return; done = true; res(); }
      f.addEventListener('load', function () { setTimeout(go, 60); });
      setTimeout(go, 12000);
      f.contentWindow.location.reload();
    }).then(function () {
      return wait(function () { var w = f.contentWindow; return w && w.WH && w.WH.state; }, 15000, 'frame reboot');
    }).then(function () { return refresh(c); });
  }

  /* ---------------- checks ---------------- */
  function checkStorage(c) {
    var ls = c.w.localStorage, k = 'wh.diag.probe', v = 'v' + Date.now();
    ls.setItem(k, v);
    var got = ls.getItem(k);
    ls.removeItem(k);
    assert(got === v, 'localStorage did not return what was written (private mode or storage blocked)');
    return 'read/write ok';
  }

  function checkBoot(c) {
    return wait(function () { return c.W && c.d.getElementById('main'); }, 15000, 'boot').then(function () {
      var err = c.d.getElementById('boot-error');
      assert(!err, 'page error overlay: ' + (err.textContent || '').replace(/\s+/g, ' ').slice(0, 160));
      var main = c.d.getElementById('main');
      assert(main.textContent.trim().length > 40, 'main area is empty');
      return 'rendered, ' + main.querySelectorAll('.card').length + ' cards on the landing view';
    });
  }

  function checkFilters(c) {
    var d = c.d, S = c.S, W = c.W;
    c.w.location.hash = '#/browse';
    return wait(function () { return q(d, '.filters') && q(d, '.card[data-id]'); }, 6000, 'browse view').then(function () {
      var before = qa(d, '.card[data-id]').length;
      click(d, '[data-action="filter"][data-group="cats"][data-val="music"]');
      return wait(function () {
        var ids = qa(d, '.card[data-id]').map(function (n) { return n.getAttribute('data-id'); });
        return ids.length && ids.every(function (id) { var e = W.byId(id); return e && e.category === 'music'; });
      }, 4000, 'music filter').catch(function () {
        throw new Error('selecting the music chip did not restrict the list');
      }).then(function () {
        assert(S.filters.cats.indexOf('music') >= 0, 'filter state did not record the chip');
        assert(qa(d, '.card[data-id]').length <= before, 'filtering produced more cards than before');
        click(d, '[data-action="filter"][data-group="cats"][data-val="music"]');
        return wait(function () { return S.filters.cats.indexOf('music') < 0; }, 4000, 'chip off').catch(function () {
          throw new Error('clicking the chip again did not switch it off');
        });
      }).then(function () {
        click(d, '[data-action="filter"][data-group="date"][data-val="today"]');
        return wait(function () { return S.filters.date === 'today'; }, 4000, 'date filter');
      }).then(function () {
        var outside = qa(d, '.card[data-id]').filter(function (n) {
          var e = W.byId(n.getAttribute('data-id'));
          return e && !W.sameDay(W.parseLocal(e.startLocal), new Date());
        });
        assert(!outside.length, outside.length + ' cards shown that are not today');
        click(d, '[data-action="resetfilters"]');
        return wait(function () { return S.filters.date === 'any' && S.filters.cats.length === 0; }, 4000, 'reset').catch(function () {
          throw new Error('Reset did not clear the filters');
        });
      }).then(function () {
        return 'category chip, date filter and reset all worked (' + before + ' cards, ' + qa(d, '.card[data-id]').length + ' after reset)';
      });
    });
  }

  function checkWatchlist(c) {
    var d = c.d;
    var card = q(d, '.card[data-id]');
    assert(card, 'no card available to save');
    var id = card.getAttribute('data-id');
    click(d, '.card[data-id="' + id + '"] .save');
    assert(c.S.saved.indexOf(id) >= 0, 'save button did not add the event to the watchlist');
    var raw = c.w.localStorage.getItem('wh.v1.saved');
    assert(raw && raw.indexOf(id) >= 0, 'the watchlist was not written to localStorage (wh.v1.saved)');
    return reloadFrame(c).then(function () {
      assert(c.S.saved.indexOf(id) >= 0, 'the saved event did not come back after a full reload');
      var btn = q(c.d, '.card[data-id="' + id + '"] .save');
      var showsSaved = btn ? btn.classList.contains('is-on') : null;
      c.S.saved = c.S.saved.filter(function (x) { return x !== id; });
      c.W.store.set('saved', c.S.saved);
      return 'save survived a full page reload' + (showsSaved === true ? ', card showed saved state' : '');
    });
  }

  function openSheet(c) {
    click(c.d, '.card[data-id]');
    return wait(function () { return q(c.d, '.sheet'); }, 5000, 'event sheet');
  }
  function closeSheet(c) {
    c.d.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return wait(function () { return c.d.getElementById('modal').hidden; }, 4000, 'sheet close').catch(function () {
      throw new Error('Escape did not close the event sheet');
    });
  }

  function checkCalendar(c) {
    var W = c.W, d = c.d;
    assert(W && W.icsFor, 'icsFor is not available');
    var ev = W.allEvents().filter(function (e) { return e.source === 'demo'; })[0];
    assert(ev, 'no event available to export');
    var text = W.icsFor([ev]);
    assert(/^BEGIN:VCALENDAR\r\n/.test(text), 'ICS does not start with BEGIN:VCALENDAR');
    assert(text.indexOf('\r\nEND:VCALENDAR') > 0, 'ICS does not end with END:VCALENDAR');
    ['BEGIN:VEVENT', 'UID:', 'DTSTAMP:', 'DTSTART:', 'DTEND:', 'SUMMARY:', 'END:VEVENT'].forEach(function (k) {
      assert(text.indexOf(k) >= 0, 'ICS is missing ' + k);
    });
    assert(!/(^|[^\r])\n/.test(text), 'ICS uses bare newlines instead of CRLF');
    var over = text.split('\r\n').filter(function (l) { return bytes(l) > 75; });
    assert(!over.length, 'ICS line over 75 octets (some clients reject this): ' + String(over[0] || '').slice(0, 40));
    var blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    assert(url && url.indexOf('blob:') === 0, 'could not create a download URL for the calendar file');
    URL.revokeObjectURL(url);
    return openSheet(c).then(function () {
      assert(q(d, '[data-action="ics-one"]'), 'the event sheet has no calendar button');
      return closeSheet(c);
    }).then(function () {
      return 'valid ICS (' + text.split('\r\n').length + ' lines, none over 75 octets), sheet opens and Escapes';
    });
  }

  function checkMap(c) {
    var d = c.d;
    c.w.location.hash = '#/near';
    return wait(function () { return q(d, '[data-action="maptoggle"][data-val="map"]'); }, 6000, 'near view').then(function () {
      click(d, '[data-action="maptoggle"][data-val="map"]');
      return wait(function () { return q(d, '#map'); }, 5000, 'map container');
    }).then(function () {
      return wait(function () {
        var m = q(d, '#map');
        if (m && m.classList.contains('leaflet-container')) return m;
        var hint = q(d, '.maphint');
        if (hint && /could not load/i.test(hint.textContent) && !m.classList.contains('leaflet-container')) {
          throw new Error('Leaflet never loaded - map CDN may be blocked');
        }
        return null;
      }, 20000, 'leaflet init');
    }).then(function (m) {
      var pins = m.querySelectorAll('.leaflet-interactive, .cluster').length;
      assert(c.w.L, 'Leaflet global is missing after load');
      click(d, '[data-action="maptoggle"][data-val="list"]');
      return wait(function () { return !q(d, '#map'); }, 4000, 'map teardown').catch(function () {
        throw new Error('switching back to list left the map in the page');
      }).then(function () {
        return 'Leaflet mounted and drew ' + pins + ' pin(s), then unmounted cleanly';
      });
    });
  }

  var CHECKS = [
    { id: 'storage', label: 'localStorage read/write', fn: checkStorage },
    { id: 'boot', label: 'Page boots without error overlay', fn: checkBoot },
    { id: 'filters', label: 'Filters: category, date, reset', fn: checkFilters },
    { id: 'watchlist', label: 'Watchlist survives a reload', fn: checkWatchlist },
    { id: 'calendar', label: 'Calendar export + event sheet', fn: checkCalendar },
    { id: 'map', label: 'Map loads and tears down', fn: checkMap }
  ];

  /* ---------------- panel ---------------- */
  function ensurePanel() {
    if (panel && document.body.contains(panel)) return panel;
    if (!root || !document.body.contains(root)) {
      root = document.createElement('div');
      root.id = 'diag-root';
      document.body.appendChild(root);
      mark('root', 'appended');
    }
    panel = document.createElement('div');
    panel.className = 'diag';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Diagnostics');
    panel.innerHTML =
      '<div class="diag__head">' +
        '<b>Diagnostics</b><span class="diag__sum" id="diag-sum">ready</span>' +
        '<span class="diag__btns"><button type="button" data-diag="run">Run</button>' +
        '<button type="button" data-diag="copy">Copy</button>' +
        '<button type="button" data-diag="close" aria-label="Close">\u00d7</button></span>' +
      '</div>' +
      '<ol class="diag__list" id="diag-list"></ol>' +
      '<p class="diag__hint">Runs in a hidden copy of this page, so your own filters and watchlist are untouched.</p>';
    panel.addEventListener('click', function (e) {
      var t = e.target.closest('button[data-diag]');
      if (!t) return;
      var a = t.getAttribute('data-diag');
      if (a === 'run') start();
      else if (a === 'copy') copyReport(t);
      else if (a === 'close') closePanel();
    });
    root.appendChild(panel);
    mark('panel', document.body.contains(panel) ? 'attached' : 'missing');
    return panel;
  }

  function closePanel() {
    if (panel) panel.remove();
    panel = null;
  }

  function renderRows() {
    var list = document.getElementById('diag-list');
    if (!list) return;
    list.innerHTML = CHECKS.map(function (c) {
      return '<li class="diag__row" data-check="' + c.id + '"><span class="diag__st">\u00b7</span>' +
        '<span class="diag__l">' + c.label + '</span><span class="diag__d"></span></li>';
    }).join('');
  }

  function setRow(id, status, detail, time) {
    var row = document.querySelector('.diag__row[data-check="' + id + '"]');
    if (!row) return;
    row.className = 'diag__row is-' + status;
    row.querySelector('.diag__st').textContent = status === 'pass' ? 'PASS' : status === 'fail' ? 'FAIL' : '\u00b7';
    row.querySelector('.diag__d').textContent = (detail || '') + (time ? ' (' + time + ')' : '');
  }

  function setSummary(text, cls) {
    var el = document.getElementById('diag-sum');
    if (!el) return;
    el.textContent = text;
    el.className = 'diag__sum' + (cls ? ' is-' + cls : '');
  }

  function pad(s) { var x = s + '          '; return x.slice(0, 11); }
  function buildReport(results) {
    var passed = results.filter(function (r) { return r.status === 'pass'; }).length;
    var failed = results.filter(function (r) { return r.status === 'fail'; }).length;
    var head = ['whats-happening diagnostics  ' + nowStamp(), 'url   ' + location.href,
      'ua    ' + navigator.userAgent, 'lib   ' + LIB, '----------------------------------------'];
    var lines = results.map(function (r) {
      return (r.status === 'pass' ? 'PASS  ' : 'FAIL  ') + pad(r.id) + (r.detail || '') + ' (' + r.time + 'ms)';
    });
    return head.concat(lines, ['----------------------------------------', passed + ' passed, ' + failed + ' failed']).join('\n');
  }

  function copyReport(btn) {
    var text = report || 'Run the checks first.';
    function done(ok) {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Select the text below';
      setTimeout(function () { btn.textContent = old; }, 1600);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    } else { done(false); window.prompt('Copy the report:', text); }
  }

  /* ---------------- run ---------------- */
  function start() {
    if (running) return;
    running = true;
    ensurePanel();
    renderRows();
    setSummary('running\u2026');
    report = '';
    mark('run', 'started');

    var results = [];
    var frame = document.createElement('iframe');
    frame.className = 'diag__frame';
    frame.title = 'diagnostics harness';
    frame.setAttribute('aria-hidden', 'true');
    frame.src = location.pathname + '?frame=1&d=' + Date.now();
    (root || document.body).appendChild(frame);

    var ctx = { frame: frame };

    new Promise(function (res) {
      var done = false;
      function go() { if (done) return; done = true; res(); }
      frame.addEventListener('load', function () { setTimeout(go, 50); });
      setTimeout(go, 15000);
    }).then(function () {
      return wait(function () { var w = frame.contentWindow; return w && w.WH && w.WH.state; }, 15000, 'harness boot');
    }).then(function () {
      refresh(ctx);
      return CHECKS.reduce(function (chain, c) {
        return chain.then(function () {
          setRow(c.id, 'run', '');
          var t0 = Date.now();
          return Promise.resolve().then(function () { return c.fn(ctx); }).then(function (detail) {
            results.push({ id: c.id, status: 'pass', detail: detail || '', time: Date.now() - t0 });
            setRow(c.id, 'pass', detail, ms(t0));
          }).catch(function (e) {
            var msg = (e && e.message) || String(e);
            results.push({ id: c.id, status: 'fail', detail: msg, time: Date.now() - t0 });
            setRow(c.id, 'fail', msg, ms(t0));
          });
        });
      }, Promise.resolve());
    }).then(function () {
      report = buildReport(results);
      var failed = results.filter(function (r) { return r.status === 'fail'; }).length;
      setSummary(failed ? failed + ' failed' : 'all passed', failed ? 'fail' : 'pass');
      mark('report', report.slice(0, 1800));
      if (failed) { try { console.error('[diagnostics]\n' + report); } catch (e) {} }
    }).catch(function (e) {
      var msg = 'harness failed: ' + ((e && e.message) || e);
      report = 'whats-happening diagnostics  ' + nowStamp() + '\n' + msg;
      setSummary('could not run', 'fail');
      mark('report', report);
      results.push({ id: 'harness', status: 'fail', detail: msg, time: 0 });
    }).then(function () {
      frame.remove();
      ensurePanel();          // if anything detached the panel, put it back
      mark('state', (panel && document.body.contains(panel) ? 'panel-attached' : 'panel-lost') + ' results=' + results.length);
      running = false;
    });
  }

  function toggle() {
    if (panel && document.body.contains(panel)) { closePanel(); return; }
    ensurePanel();
    renderRows();
    setSummary(report ? 'last run below' : 'ready');
  }

  document.addEventListener('keydown', function (e) {
    if (e.altKey && e.ctrlKey && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); toggle(); }
  });

  if (!isFrame()) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
    function boot() { if (wanted()) start(); }
  }

  return { run: start, toggle: toggle, lastReport: function () { return report; } };
})();
