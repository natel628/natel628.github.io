#!/usr/bin/env node
/**
 * File the site's videos to YOUR Google Drive, from this machine.
 *
 * Nobody else needs a Google account: they upload clips to the site exactly
 * like today, and this script (running as you, on your computer) pushes any
 * un-backed-up videos to your Drive folder and stamps the shared ☁️ badges.
 *
 * One-time setup (about five minutes):
 *   1. In the same Google Cloud project as the page's web client, create a
 *      second OAuth client of type "Desktop app" (APIs & Services >
 *      Credentials > Create credentials). Copy its client ID and secret.
 *   2. node tools/sync-to-drive.mjs --setup <desktopClientId> <desktopClientSecret>
 *   3. node tools/sync-to-drive.mjs --auth
 *      (opens Google in your browser — approve, and the script saves a
 *      refresh token; your password never touches this project)
 *   4. node tools/sync-to-drive.mjs
 *      (uploads every video missing a badge, then marks them)
 *
 * The folder comes from the site's own shared Drive settings, so there is
 * exactly one place to change it. Secrets live in tools/.drive-sync.json,
 * which is git-ignored and never leaves this machine.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CFG_PATH = path.join(HERE, '.drive-sync.json');
const API = process.env.RT_API || 'https://site-40527424745f40ee94a923a69d477c05.freebuff.page';
const META_PREFIX = '⟦rt-data⟧';

const MIME_EXT = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm', 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };

async function loadCfg() {
  try { return JSON.parse(await readFile(CFG_PATH, 'utf8')); } catch { return {}; }
}
async function saveCfg(cfg) {
  await writeFile(CFG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

async function apiState() {
  const res = await fetch(API + '/api/state');
  if (!res.ok) throw new Error('site API returned ' + res.status);
  return res.json();
}
function readMeta(state) {
  const notes = (state && state.notes) || [];
  let note = null;
  for (const n of notes) {
    if (typeof n.body !== 'string' || n.body.indexOf(META_PREFIX) !== 0) continue;
    if (!note || (+n.at || 0) >= (+note.at || 0)) note = n;
  }
  let data = {};
  if (note) { try { data = JSON.parse(note.body.slice(META_PREFIX.length)) || {}; } catch { data = {}; } }
  return { note, data, stale: notes.filter(n =>
    typeof n.body === 'string' && n.body.indexOf(META_PREFIX) === 0 && (!note || n.id !== note.id)).map(n => n.id) };
}
async function writeMeta(data, staleIds) {
  let next = await (await fetch(API + '/api/notes', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ body: META_PREFIX + JSON.stringify(data) })
  })).json();
  for (const id of staleIds) {
    next = await (await fetch(API + '/api/notes/' + encodeURIComponent(id), { method: 'DELETE' })).json();
  }
  return next;
}

async function refreshAccessToken(cfg) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: cfg.desktopId, client_secret: cfg.secret, refresh_token: cfg.refreshToken, grant_type: 'refresh_token' })
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error('Google refused the refresh (' + (data.error || res.status) + '). Run --auth again.');
  return data.access_token;
}

async function driveUpload(token, folderId, item, buf) {
  const base = String((item.caption || '').trim() || 'trip upload').replace(/[/\\]+/g, '-');
  const ext = MIME_EXT[item.type] || '';
  const meta = { name: ext && base.toLowerCase().endsWith(ext) ? base : base + ext, mimeType: item.type || 'application/octet-stream' };
  if (folderId) meta.parents = [folderId];
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify(meta)
  });
  if (!init.ok) throw new Error('Drive refused the upload start (' + init.status + ')');
  const session = init.headers.get('location');
  if (!session) throw new Error('Drive returned no upload address');
  const put = await fetch(session, { method: 'PUT', body: buf });
  if (put.status !== 200 && put.status !== 201) throw new Error('Drive upload failed (' + put.status + ')');
  const done = await put.json();
  if (!done || !done.id) throw new Error('Drive did not confirm the file');
  return done.id;
}

const [cmd, ...rest] = process.argv.slice(2);

if (cmd === '--setup') {
  const [desktopId, secret] = rest;
  if (!desktopId || !secret) { console.error('usage: node tools/sync-to-drive.mjs --setup <desktopClientId> <desktopClientSecret>'); process.exit(2); }
  const cfg = await loadCfg();
  await saveCfg({ ...cfg, desktopId, secret });
  console.log('Saved. Now run: node tools/sync-to-drive.mjs --auth');
  process.exit(0);
}

if (cmd === '--auth') {
  const cfg = await loadCfg();
  if (!cfg.desktopId || !cfg.secret) { console.error('Run --setup first.'); process.exit(2); }
  const { code, redirectUri } = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const u = new URL(req.url, 'http://127.0.0.1');
      const c = u.searchParams.get('code');
      const err = u.searchParams.get('error');
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end(c
        ? '<h1>Done — back to the terminal.</h1><p>This tab can be closed.</p>'
        : '<h1>Something went wrong.</h1><p>' + (err || 'no code returned') + '</p>');
      const port = server.address().port;
      server.close();
      c ? resolve({ code: c, redirectUri: 'http://127.0.0.1:' + port }) : reject(new Error(err || 'no code returned'));
    });
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
        client_id: cfg.desktopId, redirect_uri: 'http://127.0.0.1:' + port,
        response_type: 'code', scope: 'https://www.googleapis.com/auth/drive.file',
        access_type: 'offline', prompt: 'consent'
      });
      console.log('\nOpen this URL in your browser, sign in as yourself, and approve:\n\n' + url + '\n');
    });
  }).catch(err => { console.error(err.message); process.exit(1); });
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: cfg.desktopId, client_secret: cfg.secret,
      redirect_uri: redirectUri, grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.refresh_token) {
    console.error('Google refused the exchange (' + (data.error || res.status) + '). Try --auth again.');
    process.exit(1);
  }
  await saveCfg({ ...cfg, refreshToken: data.refresh_token });
  console.log('Signed in. Now run: node tools/sync-to-drive.mjs');
  process.exit(0);
}

if (cmd && cmd !== '--sync') {
  console.error('Unknown command. See the header of tools/sync-to-drive.mjs.');
  process.exit(2);
}

// Default: push every un-backed-up video to Drive and stamp the badges.
{
  const cfg = await loadCfg();
  if (!cfg.desktopId || !cfg.secret) { console.error('Run --setup first (see the header).'); process.exit(2); }
  if (!cfg.refreshToken) { console.error('Run --auth first (see the header).'); process.exit(2); }
  const state = await apiState();
  const { data } = readMeta(state);
  const stale = (() => {
    const notes = (state && state.notes) || [];
    const ids = [];
    let newest = null;
    for (const n of notes) {
      if (typeof n.body !== 'string' || n.body.indexOf(META_PREFIX) !== 0) continue;
      if (!newest || (+n.at || 0) >= (+newest.at || 0)) newest = n;
    }
    for (const n of notes) {
      if (typeof n.body === 'string' && n.body.indexOf(META_PREFIX) === 0 && (!newest || n.id !== newest.id)) ids.push(n.id);
    }
    return ids;
  })();
  const folderId = (data.drive && data.drive.folderId) || '';
  if (!folderId) { console.error('No Drive folder saved on the site yet — paste it in the page first.'); process.exit(2); }
  const marked = (data.driveFiles && typeof data.driveFiles === 'object') ? data.driveFiles : {};
  const pending = ((state && state.photos) || []).filter(p =>
    /^video\//.test(p.type || '') && !marked[p.id]);
  if (!pending.length) { console.log('Everything is already in Drive — nothing to do.'); process.exit(0); }
  const totalMB = pending.reduce((t, p) => t + (+p.size || 0), 0) / 1048576;
  console.log(pending.length + ' video(s), ' + totalMB.toFixed(1) + ' MB to file.');
  const token = await refreshAccessToken(cfg);
  let done = 0;
  for (const p of pending) {
    process.stdout.write(p.id + '  ' + (p.size / 1048576).toFixed(1) + ' MB  downloading… ');
    try {
      const res = await fetch(API + '/api/photos/' + encodeURIComponent(p.id));
      if (!res.ok) throw new Error('download failed (' + res.status + ')');
      const buf = Buffer.from(await res.arrayBuffer());
      process.stdout.write('uploading… ');
      const fileId = await driveUpload(token, folderId, p, buf);
      marked[p.id] = { id: fileId, at: Date.now() };
      done++;
      console.log('backed up');
    } catch (err) {
      console.log('FAILED (' + (err.message || err) + ')');
    }
  }
  if (done) {
    data.driveFiles = marked;
    await writeMeta(data, stale);
    console.log('\nMarked ' + done + ' video(s) — badges show for everyone now.');
  } else {
    console.log('\nNothing uploaded — badges unchanged.');
  }
}
