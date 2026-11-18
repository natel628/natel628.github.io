/* What's Happening? - tile art: TM/YT thumbnails first, picsum fallback, gradient behind.
   No new API key. Wraps WHV.art / hero / sheet art. Demo events (no image)
   get a stable picsum seed so no tile is gradient-only.
*/
(function () {
'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function imgFor(ev) {
    var u = ev && (ev.image || ev.thumbnail) || '';
    if (typeof u === 'string') {
      u = u.trim();
      if (/^https:\/\//.test(u)) return u;
    }
    var seed = (ev && (ev.id || ev.title)) || 'event';
    return 'https://picsum.photos/seed/' + encodeURIComponent(String(seed)) + '/800/500';
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
      '.art__glyph{z-index:1}.art__tags,.save{z-index:2}' +
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
    if (!V.__tileArtPatched2) {
      var origArt = V.art;
      V.art = function (ev, cls) {
        var html = origArt(ev, cls);
        return injectAfterOpen(html, imgTag(imgFor(ev)));
      };
      var origHero = V.hero;
      if (typeof origHero === 'function') {
        V.hero = function (ev) {
          var html = origHero(ev);
          return html.replace(/(<div class="hero__art"[^>]*>)/, '$1' + imgTag(imgFor(ev)));
        };
      }
      V.__tileArtPatched2 = true;
      V.__tileArtPatched = true;
    }
    var V2 = window.WHV2;
    if (V2 && !V2.__tileArtPatched2 && typeof V2.eventModal === 'function') {
      var origModal = V2.eventModal;
      V2.eventModal = function (ev) {
        var html = origModal(ev);
        return html.replace(/(<div class="sheet__art[^"]*"[^>]*>)/, '$1' + imgTag(imgFor(ev)));
      };
      V2.__tileArtPatched2 = true;
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
