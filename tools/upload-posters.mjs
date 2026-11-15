#!/usr/bin/env node
/**
 * File a JPEG as a video's shared thumbnail poster.
 *
 *   node tools/upload-posters.mjs <videoId> <poster.jpg>
 *
 * The poster is an ordinary album photo captioned `poster:<videoId>`; the
 * page hides those from the grid and uses them as video tile backgrounds, so
 * nobody downloads video bytes just to see the thumbnail. Skips videos that
 * already have one.
 */
import { readFile, stat } from 'node:fs/promises';

const [videoId, jpeg] = process.argv.slice(2);
if (!videoId || !jpeg) {
  console.error('usage: node tools/upload-posters.mjs <videoId> <poster.jpg>');
  process.exit(2);
}
const API = process.env.RT_API || 'https://site-40527424745f40ee94a923a69d477c05.freebuff.page';

const state = await (await fetch(API + '/api/state')).json();
const photos = state.photos || [];
if (photos.some(p => (p.caption || '') === 'poster:' + videoId)) {
  console.log('poster already exists for ' + videoId);
  process.exit(0);
}
if (!photos.some(p => p.id === videoId)) {
  console.error('no video with id ' + videoId + ' in the album');
  process.exit(1);
}
const buf = await readFile(jpeg);
await stat(jpeg);
console.log('uploading ' + (buf.length / 1024).toFixed(1) + ' KB poster for ' + videoId);

const form = new FormData();
form.append('file', new Blob([buf], { type: 'image/jpeg' }), 'poster.jpg');
form.append('caption', 'poster:' + videoId);
const res = await fetch(API + '/api/photos', { method: 'POST', body: form });
if (!res.ok) {
  console.error('upload failed: ' + res.status + ' ' + (await res.text()).slice(0, 200));
  process.exit(1);
}
const next = await res.json();
const made = (next.photos || []).find(p => (p.caption || '') === 'poster:' + videoId);
console.log('poster saved as ' + (made ? made.id : '(unknown id)'));
