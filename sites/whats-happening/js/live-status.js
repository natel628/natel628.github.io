/* What's Happening? - live-status hardening.
   1. Provider-confirmed live always wins: liveNow === true reports live
      before any local clock math or presence check.
   2. In-person events never get a stream badge: every render is swept and
      any Live / Premiere / Starts-soon / Scheduled-stream badge on an
      in-person event is removed (presence both keeps its own badge).
   3. Status re-evaluates every 60 seconds with no reload: a timer refreshes
      visible badges in place, so time-window badges flip on their own.
   4. A small checked-x-ago note proves the badges were just re-evaluated.
   5. Staleness guard: when data/live.json has a generatedAt older than two
      days, the same note says so and shows the date, so a silently failing
      daily sync cannot leave old listings up forever with no signal.
*/
(function () {
  'use strict';
  if (!window.WH || !window.WHV) return;
  var W = window.WH, V = window.WHV, S = W.state;
  var origLiveState = W.liveState;
  W.liveState = function (ev) {
    if (ev && ev.liveNow === true) return 'live';
    return origLiveState(ev);
  };
  function guardedBadge(ev) {
    if (!ev || ev.presence === 'in-person') return '';
    return V.badge(ev);
  }
  function checkedLabel() {
    var diff = Date.now() - (S.liveCheckedAt || Date.now());
    var m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m === 1) return '1 min ago';
    return m + ' min ago';
  }
  function liveAgeDays() {
    if (!S.liveGeneratedAt) return null;
    var t = new Date(S.liveGeneratedAt).getTime();
    if (isNaN(t)) return null;
    return (Date.now() - t) / 86400000;
  }
  function paintNote() {
    var note = document.querySelector('[data-livecheck-note]');
    if (!note) return;
    var slot = note.querySelector('[data-livechecked]');
    if (slot) slot.textContent = checkedLabel();
    note.setAttribute('title', 'Badges re-evaluated ' + checkedLabel());
  }
  function ensureNote() {
    var main = document.getElementById('main');
    var stale = document.querySelector('[data-livecheck-note]');
    if (!main || !S.live || !S.live.length || !main.querySelector('.art__tags')) {
      if (stale && stale.parentNode) stale.parentNode.removeChild(stale);
      return;
    }
    var note = main.querySelector('[data-livecheck-note]');
    if (!note) {
      note = document.createElement('div');
      note.className = 'notice notice--live';
      note.setAttribute('data-livecheck-note', '1');
      main.insertBefore(note, main.firstChild);
    }
    var age = liveAgeDays();
    var isStale = age !== null && age > 2;
    var dateBit = S.liveGeneratedAt ? ' Listings updated ' + W.esc(String(S.liveGeneratedAt).slice(0, 10)) + '.' : '';
    var warnBit = isStale ? ' These listings may be out of date - the daily sync may have failed.' : '';
    note.innerHTML = '<span class="notice__icon" aria-hidden="true"></span>' +
      '<div>Live status checked <span data-livechecked>just now</span>. Badges re-check automatically every minute.' + dateBit + warnBit + '</div>';
    paintNote();
  }
  function sweepBadges() {
    var nodes = document.querySelectorAll('#main [data-id], #modal [data-id]');
    for (var i = 0; i < nodes.length; i++) {
      var tags = nodes[i].querySelector('.art__tags');
      if (!tags) continue;
      var ev = W.byId(nodes[i].getAttribute('data-id'));
      if (!ev) continue;
      var demo = tags.querySelector('.badge--demo');
      var html = (demo ? demo.outerHTML : '') + guardedBadge(ev);
      if (tags.innerHTML !== html) tags.innerHTML = html;
    }
    S.liveCheckedAt = Date.now();
    ensureNote();
    paintNote();
  }
  var sweepTimer = null;
  function scheduleSweep() {
    if (sweepTimer) return;
    sweepTimer = setTimeout(function () {
      sweepTimer = null;
      sweepBadges();
    }, 120);
  }
  var main0 = document.getElementById('main');
  if (window.MutationObserver && main0) {
    new MutationObserver(scheduleSweep).observe(main0, { childList: true, subtree: true });
  }
  setInterval(sweepBadges, 60000);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepBadges);
  } else {
    sweepBadges();
  }
})();
