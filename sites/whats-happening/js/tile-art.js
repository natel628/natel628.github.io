/* What's Happening? - tile art: TM/YT thumbnails first, CSS gradient fallback.
   No new API key. Wraps WHV.art / hero / sheet art to inject <img> when
   ev.image || ev.thumbnail is an https URL. Gradient behind remains, so
   missing/blocked images still look intentional. */
(function () {
'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function imgFor(ev) {
    var u = ev && (ev.image || ev.thumbnail) || '';
    if (typeof u !== 'string') return '';
    u = u.trim();
    if (!/^https:\/\//.test(u)) return '';
    return u;
  }
  function imgTag(src) {
    return '<img class="art__img" src="' + esc(src) + '" alt="" loading="lazy" onerror="this.remove()" />';
  }
  function injectAfterOpen(html, img) {
    var i = html.indexOf('>');
    if (i < 0) return html;
    return html.slice(0, i + 1) + img + html.slice(i + 1);
  }
  function injectCSS() {
    if (document.querySelector('style[data-tile-art]')) return;
    var css = '.art__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0}' +
      '.art__glyph,.art__tags,.save{position:relative;z-index:2}' +
      '.hero__art{position:relative;overflow:hidden}.hero__art .art__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}' +
      '.sheet__art{position:relative;overflow:hidden}.sheet__art .art__img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}';
    var s = document.createElement('style');
    s.setAttribute('data-tile-art', '1');
    s.textContent = css;
    document.head.appendChild(s);
  }
  function patch() {
    if (!window.WH || !window.WHV) return false;
    var V = window.WHV;
    if (!V.__tileArtPatched) {
      var origArt = V.art;
      V.art = function (ev, cls) {
        var html = origArt(ev, cls);
        var src = imgFor(ev);
        if (!src) return html;
        return injectAfterOpen(html, imgTag(src));
      };
      var origHero = V.hero;
      if (typeof origHero === 'function') {
        V.hero = function (ev) {
          var html = origHero(ev);
          var src = imgFor(ev);
          if (!src) return html;
          return html.replace(/(<div class="hero__art"[^>]*>)/, '$1' + imgTag(src));
        };
      }
      V.__tileArtPatched = true;
    }
    var V2 = window.WHV2;
    if (V2 && !V2.__tileArtPatched && typeof V2.eventModal === 'function') {
      var origModal = V2.eventModal;
      V2.eventModal = function (ev) {
        var html = origModal(ev);
        var src = imgFor(ev);
        if (!src) return html;
        return html.replace(/(<div class="sheet__art[^"]*"[^>]*>)/, '$1' + imgTag(src));
      };
      V2.__tileArtPatched = true;
    }
    return true;
  }
  injectCSS();
  if (!patch()) {
    var t = setInterval(function () { if (patch()) clearInterval(t); }, 50);
    setTimeout(function () { clearInterval(t); }, 3000);
  }
})();
