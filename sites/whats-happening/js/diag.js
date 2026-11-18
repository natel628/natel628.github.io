/* What's Happening? - hidden diagnostics panel.

   Open with ?diag=1, #diag, or Ctrl+Alt+D, or call window.WHDIAG.run().
   It loads a copy of this page in a hidden iframe and drives it with real
   clicks (filters, reset, watchlist, calendar, map, sheet), then lists what
   failed. Running in an iframe means the page you are looking at is never
   touched.

   Budgets: every wait resolves on its condition (usually <0.5s) and only
   spends its full limit when something is actually broken, so a healthy run
   takes a few seconds. Filter checks compare the rendered cards against the
   model set, so an empty-but-wrong list fails instead of passing quietly.

   diag-9: FAIL details now carry the first stack frame (file:line:col) and
   the report prints up to five frames underneath, so a failure names its
   source instead of just its message.

   diag-10: the first row is feed health - per-source counts and errors from
   data/health.json plus how old data/live.json is, which is what the deploy
   guard enforces.

   diag-11: the calendar check takes its fixture from the invented set
   (W.demoEvents()) instead of from W.allEvents(), which now returns only the
   live feed whenever the feed has events.
*/
window.WHDIAG = (function () {
  'use strict';

  var LIB = 'diag-11';
  var running = false, report = '', panel = null;
  var root = null;   // stable wrapper so the panel cannot be lost

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

  /* A predicate that throws fails the wait at once (no silent hang); a
     falsy return keeps polling until the limit, then rejects. */
  function wait(fn, limit, label) {
    var t0 = Date.now();
    return new Promise(function (res, rej) {
      (function tick() {
        var v;
        try { v = fn(); } catch (e) { rej(e); return; }
        if (v) return res(v);
        if (Date.now() - t0 > limit) return rej(new Error('timeout after ' + limit + 'ms' + (label ? ': ' + label : '')));
        setTimeout(tick, 60);
      })();
    });
  }

  /* One stack frame, trimmed to file:line:col so the report line stays short. */
  function tidyFrame(line) {
    var l = String(line).trim();
    if (l.indexOf('at ') === 0) l = l.slice(3);
    var i = l.indexOf('http');
    if (i > 0) l = l.slice(i);
    var j = l.indexOf('://');
    if (j >= 0) {
      var k = l.indexOf('/', j + 3);
      if (k >= 0) l = l.slice(k + 1);
    }
    return l.trim();
  }
  function frames(e) {
    var s = (e && e.stack) || '';
    if (!s) return [];
    return s.split('\n').slice(1).map(tidyFrame).filter(Boolean).slice(0, 5);
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
  /* Version hook: readable without running anything. */
  try { document.documentElement.setAttribute('data-diag-lib', LIB + (isFrame() ? ' frame' : wanted() ? ' wanted' : ' idle')); } catch (e) {}

  /* ---------------- harness context ---------------- */
  function refresh(c) {
    c.w = c.frame.contentWindow;
    c.d = c.frame.contentDocument || c.w.document;
    c.W = c.w.WH;
    c.S = c.W.state;
    return c;
  }

  function reloadFrame(c) {
    var f = c.frame, done = false;
    return new Promise(function (res) {
      function go() { if (done) return; done = true; res(); }
      f.addEventListener('load', function () { setTimeout(go, 60); });
      setTimeout(go, 8000);
      f.contentWindow.location.reload();
    }).then(function () {
      return wait(function () { var w = f.contentWindow; return w && w.WH && w.WH.state; }, 8000, 'frame reboot');
    }).then(function () { return refresh(c); });
  }

  /* ---------------- checks ---------------- */

  /* Feed health: what the last scheduled sync managed to fetch, per source,
     and how fresh the published file is. Same limits the deploy guard uses,
     so a panel that passes means a deploy that can pass. */
  function checkFeed() {
    var t0 = Date.now();
    return fetch('data/health.json?d=' + t0, { cache: 'no-store' }).then(function (r) {
      assert(r.ok, 'data/health.json is missing (HTTP ' + r.status + ') - run the "Sync live events" workflow');
      return r.json();
    }).then(function (h) {
      var src = h.sources || {};
      var keys = Object.keys(src);
      assert(keys.length, 'health.json lists no sources');
      var parts = keys.map(function (k) {
        var s = src[k] || {};
        return k + ' ' + (s.status || '?') + ' ' + (s.events || 0) + (s.error ? ' (' + s.error + ')' : '');
      });
      var detail = 'sync ' + (h.ranAt || '?') + ': ' + parts.join(', ');
      assert(h.status === 'ok', 'last sync aborted - ' + (h.reason || 'no reason given') + ' - ' + detail);
      var bad = keys.filter(function (k) { return (src[k] || {}).status === 'error'; });
      assert(!bad.length, bad.join(', ') + ' failed - ' + detail);
      return fetch('data/live.json?d=' + t0, { cache: 'no-store' }).then(function (r) {
        assert(r.ok, 'data/live.json is missing (HTTP ' + r.status + ')');
        return r.json();
      }).then(function (live) {
        var n = (live.events || []).length;
        var age = Math.round((Date.now() - Date.parse(live.generatedAt || '')) / 36e5);
        assert(n > 0, 'live.json holds no events');
        assert(age <= 48, 'live.json is ' + age + 'h old (limit 48h) - the daily sync looks stopped');
        return detail + ' - live.json ' + n + ' events, ' + age + 'h old';
      });
    });
  }

  function checkStorage(c) {
    var ls = c.w.localStorage, k = 'wh.diag.probe', v = 'v' + Date.now();
    ls.setItem(k, v);
    var got = ls.getItem(k);
    ls.removeItem(k);
    assert(got === v, 'localStorage did not return what was written (private mode or storage blocked)');
    return 'read/write ok';
  }

  function checkBoot(c) {
    return wait(function () { return c.W && c.d.getElementById('main'); }, 8000, 'boot').then(function () {
      var err = c.d.getElementById('boot-error');
      assert(!err, 'page error overlay: ' + ((err && err.textContent) || '').replace(/\s+/g, ' ').slice(0, 160));
      var main = c.d.getElementById('main');
      assert(main.textContent.trim().length > 40, 'main area is empty');
      return 'rendered, ' + main.querySelectorAll('.card').length + ' cards on the landing view';
    });
  }

  function cardIds(d) {
    return qa(d, '.card[data-id]').map(function (n) { return n.getAttribute('data-id'); });
  }
  function modelIds(W, S) {
    return W.query(S.filters, S.q).map(function (e) { return e.id; });
  }
  function diffIds(shown, expected) {
    var missing = expected.filter(function (id) { return shown.indexOf(id) < 0; });
    var extra = shown.filter(function (id) { return expected.indexOf(id) < 0; });
    return { missing: missing, extra: extra };
  }

  function checkFilters(c) {
    var d = c.d, S = c.S, W = c.W;
    c.w.location.hash = '#/browse';
    return wait(function () { return q(d, '.filters') && q(d, '.card[data-id]'); }, 4000, 'browse view').then(function () {
      var before = cardIds(d).length;
      assert(before > 0, 'browse view rendered no cards to filter');
      click(d, '[data-action="filter"][data-group="cats"][data-val="music"]');
      return wait(function () {
        var ids = cardIds(d);
        return ids.length && ids.every(function (id) { var e = W.byId(id); return e && e.category === 'music'; });
      }, 3000, 'music filter').catch(function () {
        throw new Error('selecting the music chip did not restrict the list');
      }).then(function () {
        assert(S.filters.cats.indexOf('music') >= 0, 'filter state did not record the chip');
        assert(cardIds(d).length <= before, 'filtering produced more cards than before');
        click(d, '[data-action="filter"][data-group="cats"][data-val="music"]');
        return wait(function () { return S.filters.cats.indexOf('music') < 0; }, 3000, 'chip off').catch(function () {
          throw new Error('clicking the chip again did not switch it off');
        });
      }).then(function () {
        click(d, '[data-action="filter"][data-group="date"][data-val="today"]');
        return wait(function () {
          if (S.filters.date !== 'today') return null;
          var shown = cardIds(d);
          var expected = modelIds(W, S);
          if (shown.length !== expected.length) return null;
          for (var i = 0; i < shown.length; i++) {
            var e = W.byId(shown[i]);
            if (!e || expected.indexOf(shown[i]) < 0 || !W.sameDay(W.parseLocal(e.startLocal), new Date())) return null;
          }
          return shown.length + ' shown, ' + expected.length + ' expected';
        }, 3000, 'today filter').catch(function () {
          var shown = cardIds(d);
          var expected = modelIds(W, S);
          var diff = diffIds(shown, expected);
          var offDay = shown.filter(function (id) {
            var e = W.byId(id);
            return e && !W.sameDay(W.parseLocal(e.startLocal), new Date());
          });
          throw new Error('Today filter mismatch: showing ' + shown.length + ' of ' + expected.length + ' expected' +
            (diff.missing.length ? ' (missing ' + diff.missing.slice(0, 3).join(',') + ')' : '') +
            (diff.extra.length ? ' (unexpected ' + diff.extra.slice(0, 3).join(',') + ')' : '') +
            (offDay.length ? ' (' + offDay.length + ' not today)' : ''));
        });
      }).then(function () {
        click(d, '[data-action="resetfilters"]');
        return wait(function () { return S.filters.date === 'any' && S.filters.cats.length === 0; }, 3000, 'reset').catch(function () {
          throw new Error('Reset did not clear the filters');
        });
      }).then(function () {
        return 'category chip, date filter and reset all worked (' + before + ' cards, ' + cardIds(d).length + ' after reset)';
      });
    });
  }

  function checkReset(c) {
    var d = c.d, S = c.S, W = c.W;
    c.w.location.hash = '#/comedy';
    return wait(function () { return S.view === 'comedy' && q(d, '.filters'); }, 4000, 'comedy view').then(function () {
      assert(S.filters.cats.indexOf('comedy') >= 0, 'comedy view did not start on its own category');
      click(d, '[data-action="filter"][data-group="cats"][data-val="comedy"]');
      return wait(function () { return S.filters.cats.length === 0; }, 3000, 'chip off');
    }).then(function () {
      click(d, '[data-action="resetfilters"]');
      return wait(function () { return S.filters.cats.length === 1 && S.filters.cats[0] === 'comedy'; }, 3000, 'reset comedy').catch(function () {
        throw new Error('Reset did not restore the Comedy category (got: [' + S.filters.cats.join(',') + '])');
      });
    }).then(function () {
      assert(S.filters.where === 'anywhere', 'comedy page lost its anywhere scope after reset (got: ' + S.filters.where + ')');
      var ids = cardIds(d);
      assert(ids.length > 0, 'no cards after reset');
      var bad = ids.filter(function (id) { var e = W.byId(id); return !e || e.category !== 'comedy'; });
      assert(!bad.length, bad.length + ' non-comedy cards shown on the Comedy page after reset');
      c.w.location.hash = '#/online';
      return wait(function () { return S.view === 'online' && q(d, '.filters'); }, 4000, 'online view');
    }).then(function () {
      assert(S.filters.where === 'online', 'online view did not start on online-only');
      S.filters.where = 'near';
      click(d, '[data-action="resetfilters"]');
      return wait(function () { return S.filters.where === 'online'; }, 3000, 'reset online').catch(function () {
        throw new Error('Reset did not restore the online-only scope (got: ' + S.filters.where + ')');
      });
    }).then(function () {
      return 'reset restored Comedy + anywhere, and online-only on the Online page';
    });
  }

  function checkOnline(c) {
    var d = c.d, W = c.W;
    c.w.location.hash = '#/online';
    return wait(function () { return q(d, '.filters') && q(d, '.card[data-id]'); }, 4000, 'online view').then(function () {
      var ids = cardIds(d);
      assert(ids.length > 0, 'no cards on the online page to check');
      var bad = ids.filter(function (id) {
        var e = W.byId(id);
        return !e || !(e.presence === 'online' || e.streamUrl || e.channel);
      });
      assert(!bad.length, bad.length + ' event(s) listed with no stream or channel to open');
      return ids.length + ' listed, every one has a stream or channel';
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
    return wait(function () { return q(c.d, '.sheet'); }, 3000, 'event sheet');
  }
  function closeSheet(c) {
    c.d.dispatchEvent(new c.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    return wait(function () { return c.d.getElementById('modal').hidden; }, 2000, 'sheet close').catch(function () {
      throw new Error('Escape did not close the event sheet');
    });
  }

  /* Fixture: the invented set, taken straight from the data module. It used to
     come from allEvents(), which now returns only the live feed whenever the
     feed has events, so this check has to reach past it. */
  function icsFixture(W) {
    var demo = (typeof W.demoEvents === 'function' ? W.demoEvents() : []).filter(function (e) {
      return e && e.source === 'demo';
    });
    return demo[0] || (W.allEvents() || [])[0] || null;
  }

  function checkCalendar(c) {
    var W = c.W, d = c.d;
    assert(W && W.icsFor, 'icsFor is not available');
    var ev = icsFixture(W);
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
    return wait(function () { return q(d, '[data-action="maptoggle"][data-val="map"]'); }, 4000, 'near view').then(function () {
      click(d, '[data-action="maptoggle"][data-val="map"]');
      return wait(function () { return q(d, '#map'); }, 3000, 'map container');
    }).then(function () {
      return wait(function () {
        var m = q(d, '#map');
        if (m && m.classList.contains('leaflet-container')) return m;
        var hint = q(d, '.maphint');
        if (hint && /could not load/i.test(hint.textContent)) {
          throw new Error('Leaflet never loaded - map CDN may be blocked');
        }
        return null;
      }, 6000, 'leaflet init');
    }).then(function (m) {
      var pins = m.querySelectorAll('.leaflet-interactive, .cluster').length;
      assert(c.w.L, 'Leaflet global is missing after load');
      click(d, '[data-action="maptoggle"][data-val="list"]');
      return wait(function () { return !q(d, '#map'); }, 3000, 'map teardown').catch(function () {
        throw new Error('switching back to list left the map in the page');
      }).then(function () {
        return 'Leaflet mounted and drew ' + pins + ' pin(s), then unmounted cleanly';
      });
    });
  }

  var CHECKS = [
    { id: 'feed', label: 'Live feed present, fresh and sourced', fn: checkFeed },
    { id: 'storage', label: 'localStorage read/write', fn: checkStorage },
    { id: 'boot', label: 'Page boots without error overlay', fn: checkBoot },
    { id: 'filters', label: 'Filters: category, date, reset', fn: checkFilters },
    { id: 'reset', label: 'Reset restores section defaults', fn: checkReset },
    { id: 'online', label: 'Online page only lists streams', fn: checkOnline },
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
    }
    panel = document.createElement('div');
    panel.className = 'diag';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Diagnostics');
    panel.innerHTML = '<div class="diag__head">' +
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
    var lines = [];
    results.forEach(function (r) {
      lines.push((r.status === 'pass' ? 'PASS  ' : 'FAIL  ') + pad(r.id) + (r.detail || '') + ' (' + r.time + 'ms)');
      if (r.status === 'fail' && r.stack && r.stack.length) {
        r.stack.forEach(function (fr) { lines.push('      at ' + fr); });
      }
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
      setTimeout(go, 8000);
    }).then(function () {
      return wait(function () { var w = frame.contentWindow; return w && w.WH && w.WH.state; }, 8000, 'harness boot');
    }).then(function () {
      refresh(ctx);
      return CHECKS.reduce(function (chain, c) {
        return chain.then(function () {
          setRow(c.id, 'run', '');
          var t0 = Date.now();
          return Promise.resolve().then(function () {
            /* A previous check may have reloaded the frame; always drive the
               live document so one failure cannot poison the next check. */
            if (ctx.w && ctx.w.WH && ctx.w.WH.state) refresh(ctx);
            return c.fn(ctx);
          }).then(function (detail) {
            results.push({ id: c.id, status: 'pass', detail: detail || '', time: Date.now() - t0 });
            setRow(c.id, 'pass', detail, ms(t0));
          }).catch(function (e) {
            var msg = (e && e.message) || String(e);
            var st = frames(e);
            var detail = msg + (st.length ? ' @ ' + st[0] : '');
            results.push({ id: c.id, status: 'fail', detail: detail, stack: st, time: Date.now() - t0 });
            setRow(c.id, 'fail', detail, ms(t0));
          });
        });
      }, Promise.resolve());
    }).then(function () {
      report = buildReport(results);
      var failed = results.filter(function (r) { return r.status === 'fail'; }).length;
      setSummary(failed ? failed + ' failed' : 'all passed', failed ? 'fail' : 'pass');
      if (failed) { try { console.error('[diagnostics]\n' + report); } catch (e) {} }
    }).catch(function (e) {
      var msg = 'harness failed: ' + ((e && e.message) || e);
      var st = frames(e);
      report = 'whats-happening diagnostics  ' + nowStamp() + '\n' + msg +
        (st.length ? '\n' + st.map(function (fr) { return '      at ' + fr; }).join('\n') : '');
      setSummary('could not run', 'fail');
      results.push({ id: 'harness', status: 'fail', detail: msg, stack: st, time: 0 });
    }).then(function () {
      frame.remove();
      ensurePanel();
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
    function boot() { if (wanted()) start(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  return { run: start };
})();
