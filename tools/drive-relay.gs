/* Road Trip Drive relay — runs as YOU, so nobody else needs a Google account.
 *
 * What it does: the trip page asks it to take a video (init), it opens a
 * private upload slot with your Drive and tells the page where to put the
 * bytes (through the site's own shared state, so the page can read it), then
 * stamps the shared ☁️ badge once the file lands (mark). The crew never
 * signs in anywhere; every upload is authenticated as you.
 *
 * Setup (once, works from a phone browser):
 *   1. Go to script.google.com, sign in as yourself, New project.
 *   2. Delete Code.gs contents, paste this whole file, Save.
 *   3. Project Settings → check "Show appsscript.json" → open it and add
 *      "https://www.googleapis.com/auth/drive.file" to oauthScopes
 *      (create the key if missing). This is the smallest permission that
 *      works: the script can only touch files it created itself.
 *   4. Deploy → New deployment → type Web app → Execute as: Me →
 *      Who has access: Anyone → Deploy. Approve the Drive permission
 *      (it shows because of step 3).
 *   5. Copy the Web app URL into the page under Photos → Google Drive
 *      backup → "Relay web-app URL" → Save. Done — for everyone.
 *
 * Abuse notes (the URL is public, by design): init only accepts a video that
 * is actually in the album and under 80 MB; mark only stamps a file that is
 * really inside your folder. One pending handoff per video; orphans older
 * than a day are swept on every init.
 */

var SITE = 'https://site-40527424745f40ee94a923a69d477c05.freebuff.page';
var META_PREFIX = '⟦rt-data⟧';
var SESSION_PREFIX = '⟦drive-up⟧';
var SESSION_TTL = 24 * 60 * 60 * 1000;
var MAX_BYTES = 80000000;

function api(method, path, payload) {
  var opt = { method: method, muteHttpExceptions: true };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  var res = UrlFetchApp.fetch(SITE + path, opt);
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) throw new Error('site ' + res.getResponseCode());
  return JSON.parse(res.getContentText() || '{}');
}

function siteState() { return api('get', '/api/state'); }

function sessionNotes(state) {
  return ((state && state.notes) || []).filter(function (n) {
    return n.body && n.body.indexOf(SESSION_PREFIX) === 0;
  });
}

function readMeta(state) {
  var notes = (state && state.notes) || [];
  var note = null, data = {};
  notes.forEach(function (n) {
    if (typeof n.body !== 'string' || n.body.indexOf(META_PREFIX) !== 0) return;
    if (!note || (+n.at || 0) >= (+note.at || 0)) note = n;
  });
  if (note) { try { data = JSON.parse(note.body.slice(META_PREFIX.length)) || {}; } catch (e) { data = {}; } }
  var stale = notes.filter(function (n) {
    return typeof n.body === 'string' && n.body.indexOf(META_PREFIX) === 0 && (!note || n.id !== note.id);
  }).map(function (n) { return n.id; });
  return { data: data, stale: stale };
}

function writeMeta(data, stale) {
  var next = api('post', '/api/notes', { body: META_PREFIX + JSON.stringify(data) });
  stale.forEach(function (id) { next = api('delete', '/api/notes/' + encodeURIComponent(id)); });
  return next;
}

function doPost(e) {
  try {
    var msg = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (msg.action === 'init') return out(handleInit(String(msg.videoId || '')));
    if (msg.action === 'mark') return out(handleMark(String(msg.videoId || ''), String(msg.fileId || '')));
    throw new Error('unknown action');
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function handleInit(videoId) {
  if (!videoId) throw new Error('no video');
  var state = siteState();
  var item = null;
  (state.photos || []).forEach(function (p) { if (p.id === videoId) item = p; });
  if (!item || (item.type || '').indexOf('video/') !== 0) throw new Error('not an album video');
  if ((+item.size || 0) > MAX_BYTES) throw new Error('too big');
  var meta = readMeta(state);
  var folderId = (meta.data.drive && meta.data.drive.folderId) || '';
  if (!folderId) throw new Error('no folder saved on the site');

  // Sweep orphans (any video, older than a day) plus this video's handoff.
  var now = Date.now();
  sessionNotes(state).forEach(function (n) {
    try {
      var s = JSON.parse(n.body.slice(SESSION_PREFIX.length));
      if (s.videoId === videoId || (now - (+s.at || 0)) > SESSION_TTL) {
        api('delete', '/api/notes/' + encodeURIComponent(n.id));
      }
    } catch (e) { api('delete', '/api/notes/' + encodeURIComponent(n.id)); }
  });

  var base = String(item.caption || 'trip video').trim().replace(/[/\\]+/g, '-') || 'trip video';
  if (!/\.(mp4|mov|webm)$/i.test(base)) base += '.mp4';
  var resp = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post',
    contentType: 'application/json; charset=UTF-8',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    payload: JSON.stringify({ name: base, mimeType: item.type, parents: [folderId] }),
    muteHttpExceptions: true
  });
  if (resp.getResponseCode() !== 200) throw new Error('drive ' + resp.getResponseCode());
  var headers = resp.getHeaders();
  var session = headers['Location'] || headers['location'];
  if (!session) throw new Error('no upload address');
  api('post', '/api/notes', {
    body: SESSION_PREFIX + JSON.stringify({ videoId: videoId, session: session, at: Date.now() })
  });
  return { ok: true };
}

function handleMark(videoId, fileId) {
  if (!videoId || !fileId) throw new Error('missing video or file');
  var file;
  try {
    file = DriveApp.getFileById(fileId);
  } catch (e) { throw new Error('file not found'); }
  // Only files sitting in our own folder count.
  var state = siteState();
  var meta = readMeta(state);
  var folderId = (meta.data.drive && meta.data.drive.folderId) || '';
  var inside = false;
  try {
    var parents = file.getParents();
    while (parents.hasNext()) {
      if (parents.next().getId() === folderId && folderId) { inside = true; break; }
    }
  } catch (e) { /* treat as not inside */ }
  if (!inside) throw new Error('not in the trip folder');
  var files = meta.data.driveFiles;
  if (!files || typeof files !== 'object') { files = {}; meta.data.driveFiles = files; }
  files[videoId] = { id: fileId, at: Date.now() };
  writeMeta(meta.data, meta.stale);
  // Handoff served its purpose.
  sessionNotes(state).forEach(function (n) {
    try {
      if (JSON.parse(n.body.slice(SESSION_PREFIX.length)).videoId === videoId) {
        api('delete', '/api/notes/' + encodeURIComponent(n.id));
      }
    } catch (e) {}
  });
  return { ok: true };
}
