/* What's Happening? - live-status hardening.

   1. Provider-confirmed live always wins: liveNow === true reports live
      before any local clock math or presence check.
   2. In-person events never get a stream badge: every render is swept and
      any Live / Premiere / Starts-soon / Scheduled-stream badge on an
      in-person event is removed (presence both keeps its own badge).
   3. Status re-evaluates every 60 seconds with no reload, so time-window
      badges flip on their own.
   4. Staleness guard: when data/live.json has a generatedAt older than two
      days, the note above the listings says so and shows the date, so a
      silently failing daily sync cannot leave old listings up forever.
   5. The note is rewritten only when its content actually changes. The first
      version reassigned note.innerHTML on every sweep, and the sweep is
      triggered by a MutationObserver on #main, which contains the note - a
      self-sustaining write loop at ~8 DOM rebuilds a second that also kept
      the "last checked" text pinned to "just now".

   The changing "checked N min ago" line is gone with it: it could only ever
   report the loop, not real freshness. The note now states the listing date
   it actually came from.
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

  /* A listing view is the only place the note makes sense: it describes the
     badges on the cards below it, not the visitor's saved list or calendar. */
  var LIST_VIEWS = ['discover', 'near', 'browse', 'comedy', 'concerts', 'sports', 'outdoor', 'online'];

  function liveAgeDays() {
    if (!S.liveGeneratedAt) return null;
    var t = new Date(S.liveGeneratedAt).getTime();
    if (isNaN(t)) return null;
    return (Date.now() - t) / 86400000;
  }

  function noteHtml() {
    var age = liveAgeDays();
    var stale = age !== null && age > 2;
    var dateBit = S.liveGeneratedAt ? ' Listings updated ' + W.esc(String(S.liveGeneratedAt).slice(0, 10)) + '.' : '';
    var warnBit = stale ? ' These listings may be out of date - the daily sync may have failed.' : '';
    return '<span class="notice__icon" aria-hidden="true"></span>' +
      '<div>Live status is re-checked automatically every minute.' + dateBit + warnBit + '</div>';
  }

  function ensureNote() {
    var main = document.getElementById('main');
    if (!main) return;
    var note = main.querySelector('[data-livecheck-note]');
    var wanted = LIST_VIEWS.indexOf(S.view) >= 0 && S.live && S.live.length > 0 && main.querySelector('.art__tags');
    if (!wanted) {
      if (note && note.parentNode) note.parentNode.removeChild(note);
      return;
    }
    var html = noteHtml();
    if (!note) {
      note = document.createElement('div');
      note.className = 'notice notice--live';
      note.setAttribute('data-livecheck-note', '1');
      main.insertBefore(note, main.firstChild);
    }
    if (note.getAttribute('data-live-html') !== html) {
      note.innerHTML = html;
      note.setAttribute('data-live-html', html);
    }
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
    ensureNote();
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
