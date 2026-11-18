/* One-off: remove the dead browser-key provider path left behind when the
   Settings key panel was deleted. Every edit asserts it found its anchors. */
import fs from 'node:fs';

function edit(path, fn) {
  const before = fs.readFileSync(path, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error('no change applied to ' + path);
  fs.writeFileSync(path, after);
  console.log('edited ' + path);
}

function rep(s, a, b, label) {
  if (s.indexOf(a) < 0) throw new Error('missing anchor: ' + label);
  return s.split(a).join(b);
}

function cutTo(s, a, b, label) {
  const i = s.indexOf(a);
  if (i < 0) throw new Error('missing start anchor: ' + label);
  const j = s.indexOf(b, i + a.length);
  if (j < 0) throw new Error('missing end anchor: ' + label);
  return s.slice(0, i) + s.slice(j);
}

/* ---------------- app.js ---------------- */
edit('sites/whats-happening/js/app.js', function (s) {
  // Drop the per-browser Ticketmaster/YouTube fetchers, their normalizers and
  // mergeLive: with no key inputs they are unreachable, and loadLiveFile is
  // the only thing that ever fills state.live.
  s = cutTo(s, '  function normalizeTM(item) {', '  /* The scheduled Action publishes data/live.json once a day.', 'provider block');

  s = rep(s,
    `      mergeLive(list);
      if (j && j.sources) {
        if (j.sources.ticketmaster && j.sources.ticketmaster.events > 0) S.liveStatus.tm = j.sources.ticketmaster.events + ' live events';
        if (j.sources.youtube && j.sources.youtube.events > 0) S.liveStatus.yt = j.sources.youtube.events + ' streams';
      }
`,
    `      S.live = list;
`,
    'loadLiveFile body');

  s = rep(s,
    `        case 'save-keys': saveKeys(); break;
        case 'clear-keys':
          S.keys = { ticketmaster: '', youtube: '' };
          W.store.set('keys', S.keys);
          S.live = [];
          S.liveStatus = { tm: 'off', yt: 'off' };
          toast('Keys removed');
          paint(false);
          break;
`,
    '',
    'key actions');

  s = rep(s,
    `  function saveKeys() {
    var tm = document.getElementById('key-tm'), yt = document.getElementById('key-yt');
    S.keys = { ticketmaster: tm ? tm.value.trim() : '', youtube: yt ? yt.value.trim() : '' };
    W.store.set('keys', S.keys);
    W.store.set('tmCache', null);
    W.store.set('ytCache', null);
    S.live = [];
    toast('Keys saved in this browser');
    paint(false);
    loadTicketmaster(function () { loadYouTube(function () { paint(false); }); });
  }

`,
    '',
    'saveKeys');

  s = rep(s,
    `    loadLiveFile(function () {
      paint(false);
      if (S.keys.ticketmaster || S.keys.youtube) {
        loadTicketmaster(function () { loadYouTube(function () { paint(false); }); });
      }
    });
`,
    `    loadLiveFile(function () { paint(false); });
`,
    'boot');

  return s;
});

/* ---------------- core.js ---------------- */
edit('sites/whats-happening/js/core.js', function (s) {
  s = rep(s, `    keys: store.get('keys', { ticketmaster: '', youtube: '' }),
`, '', 'keys state');
  s = rep(s,
    `    live: [],
    liveStatus: { tm: 'off', yt: 'off' },
    liveError: '',
`,
    `    live: [],
    liveGeneratedAt: null,
`,
    'live state');
  return s;
});

/* ---------------- views.js ---------------- */
edit('sites/whats-happening/js/views.js', function (s) {
  return rep(s,
    'are invented so the app is fully explorable with no keys. Add a free Ticketmaster or YouTube key in <a href="#/settings">Settings</a> to pull real listings.',
    'are invented so the app is fully explorable with no keys. Real listings load automatically from the daily sync; none have arrived for this visit yet.',
    'demo notice');
});

console.log('cleanup complete');
