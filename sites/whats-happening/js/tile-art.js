/* What's Happening? - tile art.

   Order of preference for a tile picture:
     1. the picture the listing itself published (Ticketmaster image, YouTube
        thumbnail) - always right, because it is the event's own artwork;
     2. a keyword photo for the category / venue, so a listing that published
        no picture still gets something that looks like what it is (and so do
        the demonstration events, which are invented and have no artwork);
     3. picsum, unchanged, only if the keyword service cannot answer.
   The gradient stays behind all of it, so a blocked image never leaves a hole.
*/
(function () {
'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Two or three words that describe the listing, in the order that matters:
     the category first, then the venue/title so two comedy nights do not get
     the identical picture. */
  var TAGS = {
    comedy: 'comedy,stage',
    music: 'concert,stage',
    sports: 'stadium,sport',
    festival: 'festival,crowd',
    outdoor: 'mountain,outdoors',
    theatre: 'theatre,stage',
    film: 'cinema,screen',
    food: 'food,market',
    art: 'gallery,art',
    community: 'community,event',
    online: 'livestream,studio',
    ski: 'ski,snow'
  };
  function word(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(function (w) {
      return w && w.length > 2;
    })[0] || '';
  }
  function tagsFor(ev) {
    if (!ev) return 'event';
    var base = TAGS[ev.category] || ev.category || 'event';
    var extra = ev.presence === 'online' || ev.source === 'youtube' ? 'studio' : word(ev.venue) || word(ev.title);
    return extra ? base + ',' + extra : base;
  }
  function keywordSrc(ev) {
    return 'https://loremflickr.com/800/500/' + encodeURIComponent(tagsFor(ev)).replace(/%2C/g, ',');
  }
  function seedFor(ev) { return encodeURIComponent(String((ev && (ev.id || ev.title)) || 'event')); }

  function published(ev) {
    var u = ev && (ev.image || ev.thumbnail) || '';
    if (typeof u !== 'string') return '';
    u = u.trim();
    return /^https:\/\//.test(u) ? u : '';
  }

  function imgFor(ev) {
    return published(ev) || keywordSrc(ev);
  }

  /* One retry, then out of the way: keyword service -> picsum -> nothing. */
  function imgTag(src, ev) {
    var fallback = 'https://picsum.photos/seed/' + seedFor(ev) + '/800/500';
    return '<img class="art__img" src="' + esc(src) + '" alt="" loading="lazy" ' +
      'onerror="if(this.dataset.fb){this.remove();}else{this.dataset.fb=1;this.src=\'' + esc(fallback) + '\';}">';
  }
  function artImg(ev) { return imgTag(imgFor(ev), ev); }

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
        return injectAfterOpen(html, artImg(ev));
      };
      var origHero = V.hero;
      if (typeof origHero === 'function') {
        V.hero = function (ev) {
          var html = origHero(ev);
          return html.replace(/(<div class="hero__art"[^>]*>)/, '$1' + artImg(ev));
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
        return html.replace(/(<div class="sheet__art[^"]*"[^>]*>)/, '$1' + artImg(ev));
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
