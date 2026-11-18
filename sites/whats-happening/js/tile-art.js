/* What's Happening? - tile art.

   Every card, hero and event sheet gets the event's own photo, with a stable
   stand-in when the provider published none or the image fails to load.

   The first version wrapped WHV.art / WHV.hero, which never worked: views.js
   cards call their own local art() closure, so the exported function is not on
   the render path and not one card ever showed a photo. This version works on
   the DOM instead - after each paint it finds the art boxes and adds the image
   itself, so it does not matter which function built the markup.
*/
(function () {
  'use strict';

  function W() { return window.WH; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function standIn(ev) {
    var seed = (ev && (ev.id || ev.title)) || 'event';
    return 'https://picsum.photos/seed/' + encodeURIComponent(String(seed)) + '/800/500';
  }
  function imgFor(ev) {
    var u = (ev && (ev.image || ev.thumbnail)) || '';
    if (typeof u === 'string') {
      u = u.trim();
      if (/^https:\/\//.test(u)) return u;
    }
    return standIn(ev);
  }
  /* referrerpolicy keeps Ticketmaster's CDN from rejecting a request that
     carries a cross-site referer; onerror swaps to the stand-in once. */
  function imgTag(src, ev) {
    var fb = esc(standIn(ev));
    return '<img class="art__img" alt="" loading="lazy" referrerpolicy="no-referrer" src="' + esc(src) + '"' +
      ' onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src=\'' + fb + '\';}else{this.remove();}" />';
  }

  function injectCSS() {
    if (document.querySelector('style[data-tile-art]')) return;
    var css = '.art,.hero__art,.sheet__art{position:relative;overflow:hidden}' +
      '.art__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}' +
      '.art__glyph{z-index:1}.art__tags,.save{z-index:2}';
    var s = document.createElement('style');
    s.setAttribute('data-tile-art', '1');
    s.textContent = css;
    document.head.appendChild(s);
  }

  /* Which event does this art box belong to? A card carries its id on the
     article; inside the modal, the open sheet's buttons carry it. */
  function eventId(el) {
    var host = el.closest ? el.closest('[data-id]') : null;
    if (host) return host.getAttribute('data-id');
    var modal = document.getElementById('modal');
    if (modal && !modal.hidden) {
      var b = modal.querySelector('[data-id]');
      if (b) return b.getAttribute('data-id');
    }
    return null;
  }

  function decorate(root) {
    if (!root || !root.querySelectorAll || !W()) return;
    var boxes = root.querySelectorAll('.art, .hero__art, .sheet__art');
    for (var i = 0; i < boxes.length; i++) {
      var box = boxes[i];
      if (box.querySelector('.art__img')) continue;
      var id = eventId(box);
      var ev = id ? W().byId(id) : null;
      if (!ev) continue;
      box.insertAdjacentHTML('afterbegin', imgTag(imgFor(ev), ev));
    }
  }

  function decorateAll() {
    decorate(document.getElementById('main'));
    decorate(document.getElementById('modal'));
  }

  var pending = null;
  function schedule() {
    if (pending) return;
    pending = setTimeout(function () { pending = null; decorateAll(); }, 40);
  }

  function watch(el) {
    if (!el || !window.MutationObserver) return;
    new MutationObserver(schedule).observe(el, { childList: true, subtree: true });
  }

  injectCSS();
  watch(document.getElementById('main'));
  watch(document.getElementById('modal'));
  window.addEventListener('hashchange', schedule);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', decorateAll);
  else decorateAll();
  setTimeout(decorateAll, 400);
})();
