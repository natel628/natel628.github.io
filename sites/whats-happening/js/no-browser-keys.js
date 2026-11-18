/* What's Happening? - live comes from scheduled sync (GitHub Secrets), not browser keys.
   Hide the old Live data sources key inputs in Settings to avoid confusion.
*/
(function () {
'use strict';
  function patch() {
    if (!window.WH || !window.WHV2) return false;
    var W = window.WH, V2 = window.WHV2;
    try {
      W.state.keys = { ticketmaster: '', youtube: '' };
      W.store.set('keys', W.state.keys);
      W.store.set('tmCache', null);
      W.store.set('ytCache', null);
    } catch (e) {}
    if (!V2.__noKeysPatched) {
      var orig = V2.viewSettings;
      V2.viewSettings = function () {
        var html = orig();
        html = html.replace(/<section class="panel"><h2>Live data sources<\/h2>[\s\S]*?<\/section>/, '<section class="panel"><h2>Live data</h2><p class="panel__sub">Live listings refresh automatically every day from the site feed. No keys needed in this browser.</p></section>');
        return html;
      };
      V2.__noKeysPatched = true;
    }
    return true;
  }
  if (!patch()) {
    var t = setInterval(function () { if (patch()) clearInterval(t); }, 50);
    setTimeout(function () { clearInterval(t); }, 3000);
  }
})();
