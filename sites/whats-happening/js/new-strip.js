/* What's Happening? - "new since your last visit" strip.

   The feed is republished daily but the visitor sees the same wall of cards
   either way. This keeps a compact snapshot of the event ids that were on
   screen last time (wh.v1.seenIds) plus the time of that visit
   (wh.v1.lastSeen), then on the next visit lifts the ids that were not in
   that snapshot - and that the visitor has not opened yet, using the viewed
   counts the app already keeps in state.viewed.

   Nothing else is stored, nothing is written to the feed, and the strip stays
   out of the way: it only renders on the Discover landing view, it never uses
   the .notice class (the smoke test treats a bare .notice as the demo banner),
   and it is skipped inside the diagnostics harness frame so that running
   ?diag=1 cannot consume the visitor's lastSeen.
*/
(function () {
  'use strict';
  if (!window.WH || !window.WH.state) return;
  var W = window.WH, S = W.state;
  if (/(\?|&)frame=1(&|$)/.test(location.search)) return;

  var SHOW = 6;                 // chips in the strip
  var KEEP = 1500;              // ids remembered between visits
  var prevIds = W.store.get('seenIds', null);
  var since = W.store.get('lastSeen', 0) || 0;
  var dismissed = false;
  var sealed = false;
  var styled = false;

  function currentIds() {
    var out = [];
    for (var i = 0; i < S.live.length && out.length < KEEP; i++) {
      if (S.live[i] && S.live[i].id) out.push(S.live[i].id);
    }
    return out;
  }

  /* Remember this visit once the feed is actually on screen, and again when
     the page is hidden, so a visitor who closes the tab still counts as seen. */
  function seal() {
    if (sealed || !S.live || !S.live.length) return;
    sealed = true;
    W.store.set('seenIds', currentIds());
    W.store.set('lastSeen', Date.now());
  }

  window.addEventListener('pagehide', seal);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') seal();
  });

  function sinceLabel() {
    var h = Math.round((Date.now() - since) / 3600000);
    if (since <= 0) return 'your first visit';
    if (h < 1) return 'less than an hour ago';
    if (h < 24) return h === 1 ? 'an hour ago' : h + ' hours ago';
    var d = Math.round(h / 24);
    return d === 1 ? 'yesterday' : d + ' days ago';
  }

  /* Ids that were not on screen last visit, are still upcoming, and that the
     visitor has not opened (state.viewed holds the per-event open counts). */
  function collect() {
    if (!Array.isArray(prevIds) || !S.live || !S.live.length) return { list: [], total: 0 };
    var seen = {};
    for (var i = 0; i < prevIds.length; i++) seen[prevIds[i]] = 1;
    var now = new Date();
    var fresh = S.live.filter(function (ev) {
      if (!ev || !ev.id) return false;
      if (seen[ev.id]) return false;
      if (S.viewed && S.viewed[ev.id]) return false;
      if (W.endsAt(ev) < now) return false;
      return true;
    });
    fresh.sort(function (a, b) { return W.parseLocal(a.startLocal) - W.parseLocal(b.startLocal); });
    return { list: fresh.slice(0, SHOW), total: fresh.length };
  }

  function ensureStyle() {
    if (styled) return;
    styled = true;
    var st = document.createElement('style');
    st.setAttribute('data-newstrip-style', '1');
    st.textContent = [
      '.newstrip{position:relative;margin:0 0 16px;padding:12px 14px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.045)}',
      '.newstrip__head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;padding-right:28px;font-size:13px}',
      '.newstrip__head b{font-size:13px}',
      '.newstrip__sub{opacity:.65;font-size:12px}',
      '.newstrip__row{display:flex;gap:8px;overflow-x:auto;margin-top:10px;padding-bottom:2px;-webkit-overflow-scrolling:touch;scrollbar-width:thin}',
      '.newstrip__item{flex:0 0 auto;display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;max-width:240px;padding:8px 10px;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.05);color:inherit;font:inherit;cursor:pointer}',
      '.newstrip__item:hover,.newstrip__item:focus-visible{border-color:rgba(255,255,255,.34);background:rgba(255,255,255,.09)}',
      '.newstrip__t{display:block;max-width:220px;font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.newstrip__m{display:block;font-size:11px;opacity:.65}',
      '.newstrip__x{position:absolute;top:8px;right:8px;padding:2px 6px;border:0;background:none;color:inherit;font-size:16px;line-height:1;opacity:.55;cursor:pointer}',
      '.newstrip__x:hover{opacity:1}'
    ].join('');
    document.head.appendChild(st);
  }

  function chip(ev) {
    var d = W.parseLocal(ev.startLocal);
    return '<button type="button" class="newstrip__item" data-newid="' + W.esc(ev.id) + '">' +
      '<span class="newstrip__t">' + W.esc(ev.title) + '</span>' +
      '<span class="newstrip__m">' + W.esc(W.relDay(d) + ' \u00b7 ' + W.fmtTime(d)) + '</span>' +
      '</button>';
  }

  function build(found) {
    ensureStyle();
    var box = document.createElement('div');
    box.className = 'newstrip';
    box.setAttribute('data-newstrip', '1');
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'New since your last visit');
    var more = found.total > found.list.length ? ' (showing ' + found.list.length + ')' : '';
    box.innerHTML = '<div class="newstrip__head"><b>' + found.total + ' new since your last visit</b>' +
      '<span class="newstrip__sub">since ' + W.esc(sinceLabel()) + more + '</span></div>' +
      '<div class="newstrip__row">' + found.list.map(chip).join('') + '</div>' +
      '<button type="button" class="newstrip__x" data-newstrip-close aria-label="Dismiss">\u00d7</button>';
    box.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-newid], [data-newstrip-close]') : null;
      if (!t) return;
      if (t.hasAttribute('data-newstrip-close')) {
        dismissed = true;
        if (box.parentNode) box.parentNode.removeChild(box);
        return;
      }
      var card = document.querySelector('#main .card[data-id="' + t.getAttribute('data-newid') + '"]');
      if (card) {
        if (card.scrollIntoView) card.scrollIntoView({ block: 'center' });
        card.click();            // the page's own handler opens the event sheet
      } else {
        location.hash = '#/discover';
      }
    });
    return box;
  }

  function ensure() {
    if (dismissed) return;
    var main = document.getElementById('main');
    if (!main) return;
    var existing = main.querySelector('[data-newstrip]');
    if (S.view !== 'discover') {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      return;
    }
    var found = collect();
    if (!found.total) {
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      seal();
      return;
    }
    var sig = found.list.map(function (e) { return e.id; }).join(',') + '|' + found.total;
    if (existing) {
      if (existing.getAttribute('data-newids') === sig) return;
      existing.parentNode.removeChild(existing);
    }
    var box = build(found);
    box.setAttribute('data-newids', sig);
    var live = main.querySelector('.notice--live');
    main.insertBefore(box, live ? live.nextSibling : main.firstChild);
    seal();
  }

  var timer = null;
  function schedule() {
    if (timer) return;
    timer = setTimeout(function () { timer = null; ensure(); }, 120);
  }

  var mainEl = document.getElementById('main');
  if (window.MutationObserver && mainEl) {
    new MutationObserver(schedule).observe(mainEl, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensure);
  else ensure();
})();
