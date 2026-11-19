#!/usr/bin/env node
/**
 * Re-encode the videos already uploaded to the road trip site.
 *
 * Browsers cannot re-encode video, so this runs on the machine with ffmpeg:
 * download -> re-encode -> upload -> verify -> delete the original.
 * Every original is saved under ./video-backup before anything is replaced,
 * so a bad result can always be re-uploaded by hand.
 *
 *   node tools/compress-videos.mjs            (encode and replace)
 *   node tools/compress-videos.mjs --dry-run  (download and encode only)
 *
 * Tuning: RT_CRF (default 23, lower = better quality), RT_MAXW (default 1920).
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const API = process.env.RT_API || 'https://site-40527424745f40ee94a923a69d477c05.freebuff.page';
// CRF 23 at full resolution is the classic visually-transparent setting for
// viewing; CRF 20 barely saved anything because the sources are already 1080p.
const CRF = process.env.RT_CRF || '23';
const MAXW = process.env.RT_MAXW || '1920';
const DRY = process.argv.includes('--dry-run');
const WORK = path.resolve('video-backup');
const OUT = path.join(WORK, 'encoded');

const mb = n => (n / 1048576).toFixed(1) + ' MB';

function have(cmd){
  const r = spawnSync(cmd, ['-version'], { encoding: 'utf8' });
  return r.status === 0;
}
if (!have('ffmpeg') || !have('ffprobe')) {
  console.error('ffmpeg and ffprobe must be on PATH.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

const state = await (await fetch(API + '/api/state')).json();
const videos = (state.photos || []).filter(p => /^video\//.test(p.type || ''));
if (!videos.length) {
  console.log('No videos on the site.');
  process.exit(0);
}
console.log(`${videos.length} video(s), ${mb(videos.reduce((t, v) => t + (v.size || 0), 0))} total\n`);

let before = 0, after = 0, replaced = 0;

for (const p of videos) {
  const ext = (p.type || 'video/mp4').split('/')[1].replace('quicktime', 'mov');
  const src = path.join(WORK, p.id + '.' + ext);
  const dst = path.join(OUT, p.id + '.mp4');

  process.stdout.write(`${p.id}  ${mb(p.size || 0)}  downloading… `);
  const res = await fetch(`${API}/api/photos/${encodeURIComponent(p.id)}`);
  if (!res.ok) { console.log('FAILED (download ' + res.status + ')'); continue; }
  const bytes = Buffer.from(await res.arrayBuffer());
  await writeFile(src, bytes);

  const probe = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_streams', src], { encoding: 'utf8' });
  let vstream = {};
  try { vstream = JSON.parse(probe.stdout).streams.find(s => s.codec_type === 'video') || {}; } catch {}
  const w = vstream.width || 0, h = vstream.height || 0;
  process.stdout.write(`${w}x${h}, encoding… `);

  const enc = spawnSync('ffmpeg', [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', src,
    '-vf', `scale='min(${MAXW},iw)':-2`,
    '-c:v', 'libx264', '-crf', CRF, '-preset', 'medium', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    dst
  ], { encoding: 'utf8' });

  if (enc.status !== 0) {
    console.log('FAILED (ffmpeg)\n' + (enc.stderr || '').trim().split('\n').slice(-3).join('\n'));
    continue;
  }

  const small = await readFile(dst);
  console.log(`${mb(bytes.length)} -> ${mb(small.length)}`);
  before += bytes.length;
  after += small.length;

  if (DRY) continue;
  if (small.length >= bytes.length * 0.95) {
    console.log('  no meaningful saving, leaving the original');
    continue;
  }

  const form = new FormData();
  form.append('file', new Blob([small], { type: 'video/mp4' }), 'compressed.mp4');
  form.append('caption', p.caption || '');
  const up = await fetch(API + '/api/photos', { method: 'POST', body: form });
  if (!up.ok) { console.log('  upload FAILED (' + up.status + '), original kept'); continue; }
  const next = await up.json();
  const fresh = (next.photos || []).find(x => !state.photos.some(o => o.id === x.id));
  if (!fresh) { console.log('  upload did not return a new file, original kept'); continue; }

  const del = await fetch(`${API}/api/photos/${encodeURIComponent(p.id)}`, { method: 'DELETE' });
  if (!del.ok) {
    console.log('  uploaded as ' + fresh.id + ' but could not delete the original — remove it by hand');
    continue;
  }
  replaced++;
  console.log('  replaced, now ' + fresh.id);
}

console.log('\n' + (DRY ? '[dry run] would save ' : 'saved ') + mb(before - after)
  + ` (${mb(before)} -> ${mb(after)})` + (DRY ? '' : `, ${replaced} replaced`));
console.log('Originals kept in ' + WORK);
