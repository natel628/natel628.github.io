/* Curio v2 — personal curiosity library (revamp) */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const timeAgo = (ts) => {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  const days = Math.floor(h / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return days + ' days ago';
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};
const fmtDate = (ts) => new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
const dueIn = (ts) => {
  if (!ts) return '—';
  const d = ts - Date.now();
  if (d <= 0) { const days = Math.floor(-d / 86400000); return days < 1 ? 'due now' : days + (days === 1 ? ' day' : ' days') + ' overdue'; }
  const days = Math.ceil(d / 86400000);
  return days <= 1 ? 'tomorrow' : 'in ' + days + ' days';
};
const safeHref = (u) => {
  try { const x = new URL(String(u), location.href); return /^https?:$/.test(x.protocol) ? x.href : '#'; } catch { return '#'; }
};
const readMins = (t) => {
  const story = state.stories[storyKey(t)];
  const words = story ? story.words : (String(t?.overview || '') + ' ' + (t?.keyFacts || []).join(' ')).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};
const uid = () => 'g_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- preferences (v1 + v2 migration) ---------- */
const PREFS_KEY = 'curio_prefs_v1';
const PREFS_V2_KEY = 'curio_prefs_v2';
const ONBOARD_KEY = 'curio_onboarded_v1';
const READING_KEY = 'curio_reading_progress_v1';
const REVIEW_KEY = 'curio_review_v1';

function loadPrefs() {
  let p = {};
  try { p = JSON.parse(localStorage.getItem(PREFS_V2_KEY) || localStorage.getItem(PREFS_KEY) || '{}'); } catch {}
  const out = Object.assign({ view: 'grid', sort: 'newest', summaryMode: 'full', theme: 'dark', readingSize: 'md', readingMeasure: 'normal', readingTheme: 'dark', sound: false, onboarded: false, tags: [] }, p);
  if (out.theme === 'system') out.theme = 'dark'; // dark-first: 'system' used to flash white on light-OS devices
  if (!localStorage.getItem(PREFS_V2_KEY) && localStorage.getItem(PREFS_KEY)) {
    try { localStorage.setItem(PREFS_V2_KEY, JSON.stringify(out)); } catch {}
  }
  return out;
}
const prefs = loadPrefs();
function savePrefs() {
  try { localStorage.setItem(PREFS_V2_KEY, JSON.stringify({
    view: prefs.view, sort: prefs.sort, summaryMode: prefs.summaryMode,
    theme: prefs.theme, readingSize: prefs.readingSize, readingMeasure: prefs.readingMeasure,
    readingTheme: prefs.readingTheme, sound: prefs.sound, tags: prefs.tags
  })); } catch {}
}
function applyTheme() {
  document.documentElement.dataset.theme = prefs.theme === 'light' ? 'light' : 'dark';
}

function loadReadingProgress() { try { return JSON.parse(localStorage.getItem(READING_KEY) || '{}'); } catch { return {}; } }
const readingProgress = loadReadingProgress();
function saveReadingProgress() { try { localStorage.setItem(READING_KEY, JSON.stringify(readingProgress)); } catch {} }

/* ---------- state ---------- */
const state = {
  user: null, authChecked: true,
  route: 'home', topicId: null,
  topics: [], categories: [],
  guest: loadGuest(),
  filter: { q: '', status: 'all', category: 'All', sort: prefs.sort, view: prefs.view, showArchived: false, tag: 'All' },
  discover: null, discoverEmpty: false, rediscover: [],
  capturing: false,
  stories: {}, storyOpen: new Set(),
  selectedCard: 0,
  cmdOpen: false, moreOpen: false, readingSettingsOpen: false,
  focusMode: false,
  soundOn: prefs.sound,
};
function loadGuest() { try { return JSON.parse(localStorage.getItem('curio_guest_v1') || '[]'); } catch { return []; } }
function saveGuest() { try { localStorage.setItem('curio_guest_v1', JSON.stringify(state.guest)); } catch (e) { toast('Could not save (storage full). Export a backup.'); } }

/* ---------- api (kept for compatibility, guest-first) ---------- */
async function api(path, opts = {}) {
  const r = await fetch(path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  if (r.status === 401) { state.user = null; return { _unauth: true }; }
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
function haptic(ms = 10) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
  document.body.appendChild(host);
  const colors = ['#8E7CFF', '#F0B35A', '#7FD6A0', '#7AA7FF'];
  for (let i = 0; i < 24; i++) {
    const p = document.createElement('span');
    p.style.cssText = `position:absolute;left:50%;top:50%;width:8px;height:8px;border-radius:50%;background:${colors[i % colors.length]};transform:translate(-50%,-50%)`;
    host.appendChild(p);
    const angle = (Math.PI * 2 * i) / 24;
    const dist = 60 + Math.random() * 80;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 40;
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0)`, opacity: 0 }], { duration: 700 + Math.random() * 300, easing: 'cubic-bezier(.16,1,.3,1)' });
  }
  setTimeout(() => host.remove(), 1100);
}
function playChime() {
  if (!prefs.sound) return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 660; g.gain.value = 0.04;
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}

/* ---------- library source ---------- */
function allTopics() { return state.user ? state.topics : state.guest; }
function findTopic(id) { return allTopics().find((t) => t.id === id); }
async function refreshLibrary() {
  if (!state.user) return;
  try {
    const d = await api('/api/topics?sort=newest');
    if (d._unauth) return;
    state.topics = d.topics || [];
    state.categories = d.categories || [];
  } catch (e) { console.warn(e); }
}
async function refreshDiscover() {
  if (state.user) {
    try {
      const d = await api('/api/discover');
      if (!d._unauth) { state.discover = d.discover; state.discoverEmpty = Boolean(d.empty); }
      const r = await api('/api/rediscover');
      if (!r._unauth) state.rediscover = r.items || [];
    } catch { /* offline */ }
  } else {
    state.discover = localDiscover(state.guest);
    state.discoverEmpty = state.guest.length === 0;
    state.rediscover = localRediscover(state.guest);
  }
}
function localDiscover(topics) {
  const pool = [
    { title: 'The Library of Alexandria', query: 'Library of Alexandria', reason: 'A legendary starting point for any curiosity library.' },
    { title: 'The Fermi paradox', query: 'Fermi paradox', reason: 'Where is everybody? A vast, quiet universe.' },
    { title: 'The psychology of déjà vu', query: 'psychology of deja vu', reason: 'Why a moment can feel strangely familiar.' },
    { title: 'Octopus intelligence', query: 'octopus intelligence', reason: 'Tool use and escape artistry from a mind unlike ours.' },
    { title: 'The Antikythera mechanism', query: 'Antikythera mechanism', reason: 'A 2,000-year-old Greek computer from a shipwreck.' },
    { title: 'Why time feels faster as you age', query: 'why time feels faster as you age', reason: 'Attention, novelty, and the compression of memory.' },
  ];
  const owned = new Set(topics.map((t) => t.title.toLowerCase()));
  const fresh = pool.filter((p) => !owned.has(p.title.toLowerCase())).slice(0, 3);
  const related = topics.slice(0, 2).map((t) => ({ title: 'Deeper into ' + t.title, query: t.title + ' explained', reason: 'A natural next layer beneath something you saved.' }));
  while (related.length < 2) related.push({ title: fresh[related.length]?.title || 'The Voynich manuscript', query: fresh[related.length]?.query || 'Voynich manuscript', reason: 'A good rabbit hole to start with.' });
  return { related, unexpected: [{ title: 'A 10-minute rabbit hole', query: topics[0]?.title || 'curiosity', reason: 'Pick your least-explored topic and ask one “why” deeper.' }], newCuriosities: fresh, aiPowered: false };
}
function localRediscover(topics) {
  const week = Date.now() - 7 * 24 * 3600 * 1000;
  const old = topics.filter((t) => t.status !== 'completed' && t.createdAt < week).slice(0, 3);
  const list = old.length ? old : topics.filter((t) => t.status === 'unread').slice(0, 3);
  return list.map((topic) => ({ topic, prompt: 'You saved this a little while ago. Still curious?' }));
}

/* ---------- research (client-side) ---------- */
const WIKI = 'https://en.wikipedia.org';
function stripTags(html) { const d = document.createElement('div'); d.innerHTML = String(html || ''); return (d.textContent || '').replace(/\s+/g, ' ').trim(); }
async function getJSON(url, ms = 12000) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(timer); }
}
function articleURL(lang, title) { return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`; }
function inputKind(input) {
  if (/^https?:\/\//i.test(input)) return 'link';
  if (/\?\s*$/.test(input) || /^(why|how|what|when|where|who|is|are|can|did|does|do)\b/i.test(input.trim())) return 'question';
  return 'topic';
}
function searchQuery(input) {
  let q = String(input).trim();
  if (/^https?:\/\//i.test(q)) {
    try {
      const u = new URL(q);
      const m = u.pathname.match(/\/wiki\/(.+)$/);
      q = decodeURIComponent(m ? m[1].replace(/_/g, ' ') : (u.pathname.split('/').filter(Boolean).pop() || u.hostname)).replace(/[-_]/g, ' ');
    } catch { /* keep raw */ }
  }
  const cleaned = q.replace(/\?+$/, '').replace(/^(why|how|what|when|where|who|which)\s+(is|are|was|were|did|does|do|can|could|would|should|has|have)?\s*/i, '').replace(/^the\s+/i, '').trim();
  return cleaned || String(input).trim();
}
async function wikiSearchPages(q, limit = 6) {
  const d = await getJSON(`${WIKI}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${limit}`);
  return (d && d.pages ? d.pages : []).map((p) => ({ title: p.title, description: stripTags(p.description || ''), excerpt: stripTags(p.excerpt || ''), url: articleURL('en', p.title) }));
}
async function wikiSummary(lang, title) {
  const d = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, '_'))}`);
  if (!d || !d.extract || d.type === 'disambiguation') return null;
  return { title: d.title, overview: d.extract, description: d.description || '', url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || articleURL(lang, d.title) };
}
async function wikiIntro(title) {
  const d = await getJSON(`${WIKI}/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`);
  const pages = d && d.query && d.query.pages ? Object.values(d.query.pages) : [];
  return pages[0] && pages[0].extract ? pages[0].extract.trim() : '';
}
function sentences(text) { return (String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => s.length > 40); }

/* story parsing (unchanged logic) */
const STORY_SKIP_SECTION = /^(see also|references|external links|further reading|notes|citations|bibliography|sources|footnotes|works cited|general references|explanatory notes|gallery)$/i;
function splitSections(text) {
  const out = []; let cur = { heading: 'The lead', level: 2, blocks: [] }; let skip = false;
  for (const raw of String(text || '').replace(/\u00a0/g, ' ').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1$/);
    if (h) {
      const level = h[1].length;
      if (level === 2) { if (cur.blocks.length) out.push(cur); skip = STORY_SKIP_SECTION.test(h[2]); cur = { heading: h[2], level, blocks: [] }; }
      else if (!skip) cur.blocks.push({ t: 'h', text: h[2] });
      continue;
    }
    if (!skip) cur.blocks.push({ t: 'p', text: line });
  }
  if (cur.blocks.length) out.push(cur);
  return out;
}
function storyTimeline(sections) {
  const seen = new Set(); const rows = [];
  for (const s of sections) for (const b of s.blocks) {
    if (b.t !== 'p') continue;
    for (const raw of sentences(b.text)) {
      if (/retrieved|archived from the original|doi:|isbn|issn/i.test(raw)) continue;
      if (/^[A-Z][^()]{2,90}\([^)]*\b(?:1[5-9]\d{2}|20\d{2})\b[^)]*\)\s*(?:was|is|were)\b/.test(raw)) continue;
      const m = raw.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      if (!m) continue;
      const clipped = raw.replace(/^["'”“)\]]+\s*/, '');
      const text = clipped.length > 320 ? clipped.slice(0, 320).trim() + '…' : clipped;
      const key = text.slice(0, 70).toLowerCase();
      if (seen.has(key)) continue; seen.add(key);
      rows.push({ year: Number(m[1]), text });
    }
  }
  rows.sort((a, b) => a.year - b.year);
  return rows.slice(0, 18);
}
function wikitextThreads(wt, title) {
  const body = String(wt || '').replace(/<ref[^>]*\/>/g, ' ').replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ').replace(/\{\{[\s\S]*?\}\}/g, ' ');
  const counts = new Map();
  for (const m of body.matchAll(/\[\[([^\]\|#:]+)(?:#[^\]\|]*)?(?:\|[^\]]*)?\]\]/g)) {
    const name = m[1].trim();
    if (!name || name.length > 40) continue;
    if (/^(file|image|category|template|wikipedia|help|portal|wikt|wiktionary|isbn|doi|pmid)\b/i.test(name)) continue;
    if (/^\d+$/.test(name)) continue;
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const self = String(title || '').toLowerCase();
  const PUBLISHERS = /^(the )?(associated press|reuters|the new york times|the philadelphia inquirer|the washington post|the guardian|bbc|cnn|nbc news|cbs news|abc news|npr|newspapers\.com|abebooks|amazon|google books|youtube|imdb)$/i;
  return [...counts.entries()].filter(([name, n]) => n >= 2 && name.toLowerCase() !== self && !PUBLISHERS.test(name)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, n]) => ({ title: name, reason: `Comes up ${n} times in the article` }));
}
const CATEGORY_NOISE = /^(articles|short description|use .*english|use mdy|use dmy|all wikipedia|pages using|webarchive|cs1 |good articles|featured articles|comics infobox|template)/i;
function cleanCategory(c) { return String(c || '').replace(/_/g, ' ').replace(/\s*\(.*?\)\s*$/, '').trim(); }
function linkLabel(url) {
  try {
    const u = new URL(url);
    const seg = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
    const nice = seg.replace(/\.(html?|php|aspx?|cms)$/i, '').replace(/[-_+]+/g, ' ').replace(/\b\d{5,}\b/g, '').replace(/\s+/g, ' ').trim();
    return nice.length > 4 ? nice : u.hostname.replace(/^www\./, '');
  } catch { return String(url); }
}
function dedupeLinks(list) {
  const map = new Map();
  for (const raw of list || []) {
    const url = String(raw);
    const archived = /^https?:\/\/web\.archive\.org\/web\//i.test(url);
    const live = url.replace(/^https?:\/\/web\.archive\.org\/web\/\d+\//i, '');
    const key = live.split('#')[0].split('?')[0].replace(/\/+$/, '').toLowerCase();
    if (!key) continue;
    const prev = map.get(key);
    if (!prev || (prev.archived && !archived)) map.set(key, { url, archived });
  }
  return [...map.values()].map(({ url }) => {
    let host = 'link';
    try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    return { url, publisher: host, title: linkLabel(url) };
  }).slice(0, 12);
}
async function loadStory(title) {
  const fullURL = `${WIKI}/w/api.php?action=query&format=json&origin=*&prop=extracts&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`;
  const parseURL = `${WIKI}/w/api.php?action=parse&format=json&origin=*&prop=wikitext|categories|externallinks&redirects=1&page=${encodeURIComponent(title)}`;
  let full, parsed;
  try { [full, parsed] = await Promise.all([getJSON(fullURL, 20000), getJSON(parseURL, 20000).catch(() => null)]); }
  catch { throw new Error('Couldn’t reach Wikipedia for the full article. Check your connection and try again.'); }
  const page = full && full.query && full.query.pages ? Object.values(full.query.pages)[0] : null;
  if (!page || !page.extract) throw new Error('Wikipedia has no full article text for that page yet.');
  const all = splitSections(page.extract);
  const timeline = storyTimeline(all);
  const p = parsed && parsed.parse;
  const words = page.extract.split(/\s+/).filter(Boolean).length;
  return { title: page.title, url: articleURL('en', page.title), sections: all.filter((s) => s.heading !== 'The lead'), lead: all.find((s) => s.heading === 'The lead') || null, timeline, threads: p ? wikitextThreads(p.wikitext && p.wikitext['*'], page.title) : [], categories: p && p.categories ? [...new Set(p.categories.map((c) => cleanCategory(c['*'])).filter((c) => c && !CATEGORY_NOISE.test(c)))].slice(0, 12) : [], elsewhere: p ? dedupeLinks(p.externallinks) : [], words };
}
const CATEGORY_RULES = [
  ['History', /histor|ancient|centur|empire|dynasty|\bwar\b|revolution|archaeolog|medieval|roman|greek/i],
  ['Space', /astronom|planet|galax|universe|nasa|orbit|telescope|cosmo|\bstar\b/i],
  ['Science', /physic|quantum|chemis|biolog|\batom|molecul|\bcell\b|genetic|evolution|species|energy/i],
  ['Psychology', /psycholog|\bbrain\b|\bmind\b|cognit|behavio|memory|emotion|mental/i],
  ['Technology', /technolog|comput|software|internet|algorithm|artificial intelligence|machine learning|robot/i],
  ['Philosophy', /philosoph|ethic|\blogic\b|metaphys|consciousness|existential/i],
  ['Art & Culture', /\bart\b|paint|music|film|literat|novel|poet|architect|design|museum/i],
  ['Nature', /animal|plant|ocean|forest|climate|ecolog|geolog|volcan/i],
  ['Health', /medic|disease|health|virus|vaccine|nutrition|sleep/i],
  ['Society', /politic|econom|societ|\blaw\b|government|religion|\bcity\b|country/i],
];
function guessCategory(text) { for (const [name, rx] of CATEGORY_RULES) if (rx.test(text)) return name; return 'Curiosity'; }
/* Tolerant matching: misspellings + synonyms + relaxed variants, so
   "bill clinton drug lord aquittel" still lands on "Bill Clinton pardon controversy". */
const SEARCH_SYNONYMS = { acquittal: 'pardon', acquited: 'pardon', acquitted: 'pardon', aquittal: 'acquittal', aquittel: 'acquittal', pardoned: 'pardon', pardoning: 'pardon', pardons: 'pardon', clemency: 'pardon', controvercy: 'controversy', controversey: 'controversy', presedent: 'president', druglord: 'drug lord' };
const fixSearchToken = (t) => SEARCH_SYNONYMS[String(t).toLowerCase()] || t;
const fixedSearchQuery = (q) => String(q).split(/\s+/).map(fixSearchToken).join(' ');
const synonymSearchQuery = (q) => String(q).split(/\s+/).map((w) => SEARCH_SYNONYMS[String(w).toLowerCase()] || w).join(' ');
function searchVariants(q) {
  const tokens = String(q).split(/\s+/).filter(Boolean);
  const out = [];
  const push = (c) => { c = String(c || '').trim(); if (c.length > 2 && !out.includes(c)) out.push(c); };
  push(q);
  const fixed = fixedSearchQuery(q);
  push(fixed); push(synonymSearchQuery(fixed)); push(synonymSearchQuery(q));
  const fe = fixed.split(/\s+/); const fhe = fe.slice(0, 2).join(' ');
  if (tokens.length >= 3 && [...tokens, ...fe].some((k) => ['pardon', 'pardoned', 'pardons', 'acquittal', 'acquitted', 'aquittal', 'aquittel', 'clemency'].includes(String(k).toLowerCase()))) push(fhe + ' pardon');
  if (tokens.length >= 3 && tokens.length <= 7) for (let i = tokens.length - 1; i >= 0; i--) push(tokens.filter((_, j) => j !== i).join(' '));
  if (tokens.length >= 3) {
    const kwSet = [...new Set([...tokens.slice(2), ...fe.slice(2), ...synonymSearchQuery(fixed).split(/\s+/).slice(2)])];
    for (const kw of kwSet) { if (kw.length > 3) push(fhe + ' ' + kw); if (out.length >= 10) break; }
    push(tokens.slice(0, 3).join(' ')); push(tokens.slice(0, 2).join(' '));
  }
  return out.slice(0, 10);
}
function scoreSearchPage(title, q, variant) {
  const stop = new Set(['the', 'of', 'a', 'an', 'and', 'why', 'did', 'does', 'what', 'how', 'lord']);
  const toks = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3 && !stop.has(w));
  const tl = String(title || '').toLowerCase();
  const qw = toks(q), vw = toks(variant);
  let s = 0;
  for (const w of vw) if (tl.includes(w)) s += w.length > 6 ? 2 : 1;
  for (const w of qw) if (!vw.includes(w) && tl.includes(w)) s += 0.5;
  if (vw.length >= 2 && tl.includes(vw.slice(0, 2).join(' '))) s += 1.5;
  return s;
}
async function wikiActionSearch(q, limit = 5) {
  const d = await getJSON(`${WIKI}/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&srinfo=suggestion`);
  const pages = (d && d.query && d.query.search ? d.query.search : []).map((h) => ({ title: h.title, description: '', excerpt: '', url: articleURL('en', h.title) }));
  const suggestion = d && d.query && d.query.searchinfo ? d.query.searchinfo.suggestion : null;
  return { pages, suggestion };
}
async function localResearch(input) {
  const kind = inputKind(input);
  const q = searchQuery(input);
  const variants = searchVariants(q);
  const seen = new Map();
  let suggestion = null;
  try {
    for (const v of variants.slice(0, 6)) {
      let pages = [];
      try { pages = await wikiSearchPages(v, 3); } catch {}
      if (!pages.length) {
        try { const r = await wikiActionSearch(v, 3); pages = r.pages; if (r.suggestion && !suggestion) suggestion = r.suggestion; } catch {}
      }
      for (const p of pages.slice(0, 2)) if (p && p.title && !seen.has(p.title.toLowerCase())) seen.set(p.title.toLowerCase(), { page: p, variant: v });
      if (seen.size >= 4) break;
    }
    if (!seen.size) {
      try {
        const r = await wikiActionSearch(q, 5);
        for (const p of r.pages.slice(0, 2)) if (p && p.title && !seen.has(p.title.toLowerCase())) seen.set(p.title.toLowerCase(), { page: p, variant: q });
        if (r.suggestion && !suggestion) suggestion = r.suggestion;
      } catch {}
    }
  }
  catch { throw new Error('Couldn’t reach Wikipedia. Check your connection and try again.'); }
  if (!seen.size) throw new Error('No Wikipedia article matched that. Try fewer words — e.g. just the name and one keyword.');
  const ranked = [...seen.values()].map(({ page, variant }) => ({ page, variant, score: scoreSearchPage(page.title, q, variant) })).sort((a, b) => b.score - a.score);
  const best = ranked[0].page;
  const matchedVariant = ranked[0].variant;
  const pages = ranked.map((r) => r.page);
  const [summary, simple, intro] = await Promise.all([wikiSummary('en', best.title).catch(() => null), wikiSummary('simple', best.title).catch(() => null), wikiIntro(best.title).catch(() => '')]);
  const overview = (summary && summary.overview) || intro || best.excerpt || best.description;
  if (!overview) throw new Error('Wikipedia has no summary for that page yet. Try another wording.');
  const flat = overview.replace(/\s+/g, ' ');
  const keyFacts = sentences(intro).filter((s) => !flat.includes(s.slice(0, 50))).slice(0, 4);
  if (!keyFacts.length && best.excerpt) keyFacts.push(best.excerpt);
  const sources = [];
  if (summary) sources.push({ title: summary.title + ' — Wikipedia', url: summary.url, publisher: 'Wikipedia', snippet: (summary.description || best.excerpt || '').slice(0, 220) });
  if (kind === 'link') { let host = 'link'; try { host = new URL(input).hostname.replace(/^www\./, ''); } catch {} sources.push({ title: 'The link you saved', url: input, publisher: host, snippet: 'Your original link' }); }
  pages.slice(1, 5).forEach((p) => sources.push({ title: p.title, url: p.url, publisher: 'Wikipedia', snippet: (p.description || p.excerpt || '').slice(0, 220) }));
  const overviewNote = matchedVariant && matchedVariant.toLowerCase() !== q.toLowerCase() ? 'Closest Wikipedia match for “' + q.slice(0, 80) + '” — matched via “' + matchedVariant.slice(0, 80) + '”.' : '';
  return { title: (summary && summary.title) || best.title, inputType: kind, category: guessCategory([overview, best.description, q].join(' ')), overview, overviewNote, keyFacts, wiki: summary ? { title: summary.title, url: summary.url } : { title: best.title, url: best.url }, simple: simple ? { overview: simple.overview, url: simple.url } : null, sources, related: pages.slice(1, 4).map((p) => ({ title: p.title, reason: p.description || 'A nearby article worth a look.' })), aiPowered: false };
}

/* ---------- capture ---------- */
const EXAMPLES = ['Why did the Library of Alexandria disappear?', 'The psychology of déjà vu', 'The Fermi paradox'];
async function capture(input) {
  input = (input || '').trim();
  if (!input || state.capturing) return;
  state.capturing = true;
  updateCaptureUI(true);
  setStatusText(input.length > 140 ? 'Saving your thought and researching…' : 'Saving and researching…');
  try {
    if (state.user) {
      const d = await api('/api/topics', { method: 'POST', body: JSON.stringify({ input }) });
      if (d._unauth) { state.user = null; render(); return; }
      if (d.duplicate) {
        const existing = findTopic(d.topic.id) || d.topic;
        toast('Already in your library — opened it instead.');
        location.hash = '#/topic/' + encodeURIComponent(existing.id);
        return;
      }
      state.topics.unshift(d.topic);
      await refreshDiscover();
      location.hash = '#/topic/' + d.topic.id;
    } else {
      setStatusText('Researching…');
      const r = await localResearch(input);
      const dup = state.guest.find((x) => sameTopic(x, { title: r.title, wikiTitle: r.wiki?.title }));
      if (dup) {
        toast('Already in your library — opened it instead.');
        location.hash = '#/topic/' + encodeURIComponent(dup.id);
        return;
      }
      const now = Date.now();
      const topic = { id: uid(), title: r.title, input, inputType: r.inputType, category: r.category, status: 'unread', overview: r.overview, overviewNote: r.overviewNote || '', keyFacts: r.keyFacts, wikiUrl: r.wiki?.url || null, wikiTitle: r.wiki?.title || null, sources: r.sources, related: r.related, simple: r.simple || null, notes: '', tags: [], archived: false, createdAt: now, updatedAt: now, readPct: 0, reviewDueAt: now + 2 * 86400000, reviewInterval: 2 };
      if (r.overviewNote) setTimeout(() => toast(r.overviewNote), 50);
      state.guest.unshift(topic); saveGuest();
      await refreshDiscover();
      location.hash = '#/topic/' + topic.id;
      playChime();
    }
  } catch (e) {
    setStatusText(e.message);
    toast(e.message);
  } finally {
    state.capturing = false;
    updateCaptureUI(false);
  }
}
function setStatusText(msg) { const el = $('#cap-status'); if (el) el.textContent = msg; }
function updateCaptureUI(busy) {
  const btn = $('#cap-btn'); if (btn) { btn.disabled = busy; btn.innerHTML = busy ? '<span class="spin"></span> Researching…' : 'Explore ✦'; }
  const input = $('#cap-input'); if (input) input.disabled = busy;
}

/* ---------- mutations ---------- */
async function patchTopic(id, patch, opts = {}) {
  const t = findTopic(id);
  if (!t) return;
  if (state.user && !String(id).startsWith('g_')) {
    const d = await api('/api/topics/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
    if (d._unauth) { state.user = null; render(); return; }
    Object.assign(t, d.topic);
    const i = state.topics.findIndex((x) => x.id === id);
    if (i >= 0) state.topics[i] = t;
  } else {
    Object.assign(t, patch, { updatedAt: Date.now() });
    saveGuest();
  }
  if (!opts.silent) render();
  return t;
}
async function deleteTopic(id) {
  const t = findTopic(id);
  if (!t) return;
  if (!confirm(`Delete “${t.title}”? This cannot be undone.`)) return;
  if (state.user && !String(id).startsWith('g_')) {
    await api('/api/topics/' + id, { method: 'DELETE' }).catch(() => null);
    state.topics = state.topics.filter((x) => x.id !== id);
  } else {
    state.guest = state.guest.filter((x) => x.id !== id);
    saveGuest();
  }
  delete readingProgress[id]; saveReadingProgress();
  await refreshDiscover();
  // Re-render immediately: if we're already on #/library the hash won't change, so no hashchange fires.
  if (state.route === 'topic' && state.topicId === id) location.hash = '#/library';
  render();
  toast('Deleted.');
}
function openRename(t) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="Rename topic"><h3>Rename topic</h3><p>Give it a name you'll recognize later.</p>
    <input id="rename-input" value="${esc(t.title)}" maxlength="200"><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost small" id="m-cancel">Cancel</button><button class="btn primary small" id="m-save">Save</button></div></div></div>`;
  const wrap = root.querySelector('.modal-wrap');
  trapFocus(wrap);
  const inp = $('#rename-input');
  inp.focus(); inp.select();
  $('#m-cancel').onclick = () => (root.innerHTML = '');
  const save = async () => { const v = inp.value.trim(); root.innerHTML = ''; if (v && v !== t.title) await patchTopic(t.id, { title: v }); };
  $('#m-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') root.innerHTML = ''; };
}
function markOpened(t) {
  if (!t) return;
  t.lastOpenedAt = Date.now();
  if (state.user && !String(t.id).startsWith('g_')) patchTopic(t.id, { lastOpenedAt: t.lastOpenedAt }, { silent: true }).catch(() => {});
  else saveGuest();
}

/* ---------- navigation ---------- */
const NAV = [
  { id: 'home', label: 'Capture', icon: '✦' },
  { id: 'library', label: 'Library', icon: '▤' },
  { id: 'discover', label: 'Discover', icon: '✧' },
];
function counts() {
  const ts = allTopics().filter((t) => !t.archived);
  return { library: ts.length, inbox: ts.filter((t) => t.status === 'unread').length, exploring: ts.filter((t) => t.status === 'exploring').length, completed: ts.filter((t) => t.status === 'completed').length };
}
function parseRoute() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\//, '').split('/');
  if (parts[0] === 'topic' && parts[1]) { state.route = 'topic'; state.topicId = decodeURIComponent(parts[1]); }
  else {
    let r = parts[0] || 'home';
    // redirects for old routes
    if (r === 'inbox' || r === 'exploring' || r === 'completed') { state.route = 'library'; state._statusFilter = r === 'inbox' ? 'unread' : (r === 'exploring' ? 'exploring' : (r === 'completed' ? 'completed' : 'all')); }
    else { state.route = r; state._statusFilter = null; }
  }
  if (!['home', 'library', 'discover', 'topic'].includes(state.route)) state.route = 'home';
  if (state._statusFilter) { state.filter.status = state._statusFilter; state._statusFilter = null; }
}
function go(id) { location.hash = '#/' + (id === 'home' ? '' : id); }

/* ---------- render shell ---------- */
function renderSide() {
  const c = counts();
  const active = (id) => (state.route === id ? 'active' : '');
  const collapsed = localStorage.getItem('curio_rail_collapsed') === '1';
  const rail = $('#side');
  rail.className = 'rail' + (collapsed ? ' collapsed' : '');
  rail.innerHTML = `
    <div class="brand"><div class="brand-mark">C</div><div class="brand-text"><div class="brand-name">Curio</div><div class="brand-tag">Night Desk</div></div>
      <button class="icon-btn" id="rail-toggle" title="Collapse rail" style="margin-left:auto">${collapsed ? '›' : '‹'}</button></div>
    <button class="nav-item ${active('home')}" data-nav="home" ${state.route === 'home' ? 'aria-current="page"' : ''}><span class="ico">✦</span><span class="nav-text">Capture</span></button>
    <button class="nav-item ${active('library')}" data-nav="library" ${state.route === 'library' ? 'aria-current="page"' : ''}><span class="ico">▤</span><span class="nav-text">Library</span><span class="badge">${c.library}</span></button>
    <button class="nav-item ${active('discover')}" data-nav="discover" ${state.route === 'discover' ? 'aria-current="page"' : ''}><span class="ico">✧</span><span class="nav-text">Discover</span></button>
    <div class="nav-label">More</div>
    <button class="nav-item" id="more-btn"><span class="ico">⋯</span><span class="nav-text">More</span></button>
    <div class="rail-foot"><div class="hint">${state.user ? 'Synced' : 'Saved on this device'}</div></div>`;
  rail.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  $('#rail-toggle').onclick = () => { localStorage.setItem('curio_rail_collapsed', collapsed ? '0' : '1'); renderSide(); };
  $('#more-btn').onclick = (e) => { e.stopPropagation(); toggleMore(); };
  // bottom nav
  const bn = $('#bottomnav');
  bn.innerHTML = [
    { id: 'home', label: 'Capture', icon: '✦' },
    { id: 'library', label: 'Library', icon: '▤' },
    { id: 'discover', label: 'Discover', icon: '✧' },
    { id: 'more', label: 'More', icon: '⋯' },
  ].map((n) => `<button class="${state.route === n.id ? 'active' : ''}" data-nav="${n.id}" aria-label="${esc(n.label)}" ${state.route === n.id ? 'aria-current="page"' : ''}><span class="bi">${n.icon}</span>${n.label}</button>`).join('');
  bn.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => { if (b.dataset.nav === 'more') toggleMore(); else go(b.dataset.nav); }));
  // FAB
  let fab = $('#fab');
  if (!fab) { fab = document.createElement('button'); fab.id = 'fab'; fab.className = 'btn primary'; fab.style.cssText = 'position:fixed;bottom:88px;right:18px;width:56px;height:56px;border-radius:50%;font-size:22px;z-index:35;box-shadow:var(--sh-lg)'; fab.textContent = '✦'; fab.setAttribute('aria-label', 'Capture'); document.body.appendChild(fab); }
  fab.style.display = (state.route === 'home') ? 'none' : 'grid';
  fab.onclick = () => { go('home'); setTimeout(() => $('#cap-input')?.focus(), 200); };
}

function toggleMore() {
  state.moreOpen = !state.moreOpen;
  let m = $('#more-menu');
  if (state.moreOpen) {
    if (!m) {
      m = document.createElement('div'); m.id = 'more-menu'; m.className = 'more-menu';
      m.innerHTML = `
        <button id="mm-theme">Theme: ${prefs.theme}</button>
        <button id="mm-stats">Stats & streak</button>
        <button id="mm-export">Export library (JSON)</button>
        <button id="mm-export-md">Export Markdown</button>
        <button id="mm-export-html">Export HTML</button>
        <button id="mm-import">Import backup</button>
        <button id="mm-tags">Manage tags</button>
        <button id="mm-onboard">Replay tour</button>
        <button id="mm-help">Keyboard shortcuts</button>
        <button id="mm-about">About Curio</button>`;
      document.body.appendChild(m);
      $('#mm-theme').onclick = () => { cycleTheme(); renderMore(); };
      $('#mm-stats').onclick = () => { closeMore(); showStats(); };
      $('#mm-export').onclick = () => { closeMore(); exportLibrary(); };
      const mmmd = $('#mm-export-md'); if (mmmd) mmmd.onclick = () => { closeMore(); exportMarkdown(); };
      const mmh = $('#mm-export-html'); if (mmh) mmh.onclick = () => { closeMore(); exportHTML(); };
      $('#mm-import').onclick = () => { closeMore(); $('#import-file')?.click(); };
      $('#mm-tags').onclick = () => { closeMore(); manageTags(); };
      $('#mm-onboard').onclick = () => { closeMore(); startOnboarding(true); };
      $('#mm-help').onclick = () => { closeMore(); showShortcuts(); };
      $('#mm-about').onclick = () => { closeMore(); toast('Curio — never lose a thought worth exploring.'); };
    }
    m.style.display = 'block';
  } else if (m) m.style.display = 'none';
}
function closeMore() { state.moreOpen = false; const m = $('#more-menu'); if (m) m.style.display = 'none'; }
function renderMore() { const b = $('#mm-theme'); if (b) b.textContent = 'Theme: ' + prefs.theme; }
function cycleTheme() {
  const order = ['dark', 'light'];
  prefs.theme = order[(order.indexOf(prefs.theme) + 1) % order.length];
  savePrefs(); applyTheme(); toast('Theme: ' + prefs.theme);
}

/* ---------- tags ---------- */
function allTags() { return [...new Set(allTopics().flatMap((t) => t.tags || []))].sort(); }
function manageTags() { toast('Add tags from a topic page.'); }

/* ---------- filtered topics ---------- */
function filteredTopics(base) {
  const f = state.filter;
  let list = f.showArchived ? [...base] : base.filter((t) => !t.archived);
  if (state.route === 'inbox' || f.status === 'unread') list = list.filter((t) => t.status === 'unread');
  if (state.route === 'exploring' || f.status === 'exploring') list = list.filter((t) => t.status === 'exploring');
  if (state.route === 'completed' || f.status === 'completed') list = list.filter((t) => t.status === 'completed');
  if (!f.showArchived) list = list.filter((t) => !t.archived);
  if (f.status !== 'all' && f.status !== 'unread' && f.status !== 'exploring' && f.status !== 'completed') {}
  if (state.route === 'library' && f.status !== 'all') list = list.filter((t) => t.status === f.status);
  if (f.tag !== 'All') list = list.filter((t) => (t.tags || []).includes(f.tag));
  if (f.q) {
    const q = f.q.toLowerCase();
    list = list.filter((t) => fuzzyScore((t.title + ' ' + (t.overview || '') + ' ' + t.category + ' ' + (t.input || '') + ' ' + (t.notes || '') + ' ' + (t.tags || []).join(' ')), q) >= 0);
  }
  if (f.category !== 'All') list = list.filter((t) => t.category === f.category);
  if (f.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (f.sort === 'oldest') list = [...list].sort((a, b) => a.createdAt - b.createdAt);
  else if (f.sort === 'review') list = [...list].sort((a, b) => (a.reviewDueAt || 0) - (b.reviewDueAt || 0));
  else list = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return list;
}
function fuzzyScore(text, q) {
  const t = text.toLowerCase();
  if (t.includes(q)) return 1;
  // simple subsequence
  let i = 0;
  for (const ch of q) { const idx = t.indexOf(ch, i); if (idx < 0) return -1; i = idx + 1; }
  return 0;
}
function highlight(text, q) {
  if (!q) return esc(text);
  const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig');
  return esc(text).replace(re, '<mark style="background:var(--spark-soft);color:var(--spark);border-radius:3px;padding:0 2px">$1</mark>');
}

/* ---------- card html ---------- */
function cardHTML(t) {
  const mins = readMins(t);
  const srcs = (t.sources || []).length;
  const rp = readingProgress[t.id];
  const pct = rp ? Math.round(rp.pct || 0) : (t.readPct || 0);
  const tags = (t.tags || []).map((tg) => `<span class="pill" style="font-size:10px">${esc(tg)}</span>`).join(' ');
  return `<article class="card" data-open="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
    <div class="card-actions">
      ${t.status !== 'completed' ? `<button class="icon-btn" data-done="${esc(t.id)}" title="Mark completed" aria-label="Mark completed">✓</button>` : ''}
      <button class="icon-btn" data-archive="${esc(t.id)}" title="${t.archived ? 'Unarchive' : 'Archive'}" aria-label="${t.archived ? 'Unarchive' : 'Archive'}">▢</button>
      <button class="icon-btn" data-del="${esc(t.id)}" title="Delete" aria-label="Delete">×</button>
    </div>
    <div class="cat">${esc(t.category)} · ${mins} min read</div>
    <h3>${highlight(t.title, state.filter.q)}</h3>
    <p class="desc">${esc(t.overview || '')}</p>
    ${tags ? `<div style="margin-top:8px;display:flex;gap:4px;flex-wrap:wrap">${tags}</div>` : ''}
    <div class="card-meta"><span class="pill ${esc(t.status)}">${esc(t.status)}</span><span>${timeAgo(t.createdAt)}</span>${srcs ? `<span>· ${srcs} sources</span>` : ''}${pct > 0 && pct < 100 ? `<span>· ${pct}% read</span>` : ''}</div>
    ${pct > 0 && pct < 100 ? `<div style="margin-top:8px;height:3px;background:var(--line);border-radius:2px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--blue))"></i></div>` : ''}
  </article>`;
}
function bindCards(root) {
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-del]') || e.target.closest('[data-archive]') || e.target.closest('[data-done]')) return;
      location.hash = '#/topic/' + encodeURIComponent(el.dataset.open);
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); location.hash = '#/topic/' + encodeURIComponent(el.dataset.open); } };
  });
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); deleteTopic(b.dataset.del); }));
  root.querySelectorAll('[data-archive]').forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const t = findTopic(b.dataset.archive);
    const newVal = !t?.archived;
    await patchTopic(b.dataset.archive, { archived: newVal }, { silent: true });
    toast(newVal ? 'Archived.' : 'Unarchived.');
    render();
  }));
  root.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    await patchTopic(b.dataset.done, { status: 'completed' }, { silent: true });
    haptic(15); confetti(); toast('Marked completed.'); playChime();
    render();
  }));
}

/* ---------- toolbar ---------- */
function toolbarHTML(showStatus) {
  const cats = ['All', ...new Set(allTopics().map((t) => t.category).filter(Boolean))];
  const tags = ['All', ...allTags()];
  const total = filteredTopics(allTopics()).length;
  return `<div class="toolbar">
    <label class="search"><span>⌕</span><input id="f-q" placeholder="Search library…  ( / )" value="${esc(state.filter.q)}" aria-label="Search library"></label>
    ${showStatus ? `<div class="seg" id="f-status" role="tablist" aria-label="Status filter">
      ${['all', 'unread', 'exploring', 'completed'].map((s) => `<button data-s="${s}" class="${state.filter.status === s ? 'active' : ''}" aria-selected="${state.filter.status === s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>` : ''}
    <select id="f-cat" aria-label="Category">${cats.map((c) => `<option ${state.filter.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="f-tag" aria-label="Tag">${tags.map((c) => `<option ${state.filter.tag === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="f-sort" aria-label="Sort">
      <option value="newest" ${state.filter.sort === 'newest' ? 'selected' : ''}>Newest</option>
      <option value="oldest" ${state.filter.sort === 'oldest' ? 'selected' : ''}>Oldest</option>
      <option value="title" ${state.filter.sort === 'title' ? 'selected' : ''}>Title A–Z</option>
      <option value="review" ${state.filter.sort === 'review' ? 'selected' : ''}>Review due</option>
    </select>
    <div class="seg" id="f-view" aria-label="View"><button data-v="grid" class="${state.filter.view === 'grid' ? 'active' : ''}" aria-pressed="${state.filter.view === 'grid'}">Grid</button><button data-v="list" class="${state.filter.view === 'list' ? 'active' : ''}" aria-pressed="${state.filter.view === 'list'}">List</button></div>
    <button class="chip ${state.filter.showArchived ? 'on' : ''}" id="f-arch" title="Show archived">${state.filter.showArchived ? 'Archived ✓' : 'Archived'}</button>
  </div>
  <div class="result-count">${total} ${total === 1 ? 'topic' : 'topics'}${state.filter.showArchived ? ' · including archived' : ''}${state.filter.tag !== 'All' ? ' · #' + esc(state.filter.tag) : ''}</div>`;
}
function bindToolbar() {
  const q = $('#f-q');
  if (q) q.oninput = (e) => { state.filter.q = e.target.value; renderList(); };
  const st = $('#f-status');
  if (st) st.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.status = b.dataset.s; state.filter.tag = state.filter.tag; render(); }));
  const cat = $('#f-cat');
  if (cat) cat.onchange = (e) => { state.filter.category = e.target.value; renderList(); };
  const tag = $('#f-tag');
  if (tag) tag.onchange = (e) => { state.filter.tag = e.target.value; renderList(); };
  const sort = $('#f-sort');
  if (sort) sort.onchange = (e) => { state.filter.sort = e.target.value; prefs.sort = e.target.value; savePrefs(); renderList(); };
  const vw = $('#f-view');
  if (vw) vw.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.view = b.dataset.v; prefs.view = b.dataset.v; savePrefs(); render(); }));
  const arch = $('#f-arch');
  if (arch) arch.onclick = () => { state.filter.showArchived = !state.filter.showArchived; render(); };
}
function bindCardsDelegated(root) { bindCards(root); }

function emptyHTML(msg, cta) {
  return `<div class="empty"><div class="big">○</div><h3>${esc(msg)}</h3>${cta || ''}</div>`;
}
function renderList(limit) {
  const host = $('#list-host');
  if (!host) return;
  let list = filteredTopics(allTopics());
  if (state.route === 'library' && state.filter.status !== 'all') list = list.filter((t) => t.status === state.filter.status);
  if (typeof limit === 'number') list = list.slice(0, limit);
  host.className = 'grid' + (state.filter.view === 'list' ? ' list' : '');
  host.innerHTML = list.length ? list.map(cardHTML).join('') : emptyHTML(
    state.filter.q ? 'No matches. Try a different search or clear filters.' : 'Nothing here yet.',
    state.route === 'home' ? '' : `<br><button class="btn small" onclick="location.hash='#/'">Capture your first curiosity</button>`
  );
  bindCards(host);
}

/* ---------- views ---------- */
function continueReading() {
  return allTopics().filter((t) => t.lastOpenedAt && !t.archived && t.status !== 'completed').sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).slice(0, 4);
}
function homeHTML() {
  const red = state.rediscover;
  const cont = continueReading();
  const total = allTopics().filter((t) => !t.archived).length;
  return `<section class="hero">
    <h1>What's on <em>your mind?</em></h1>
    <p>Capture it — research builds itself. <span class="kbd-hint">press <kbd>/</kbd></span></p>
  </section>
  <div class="capture">
    <textarea id="cap-input" rows="2" placeholder="A topic, a question, a half-formed thought, a link…"></textarea>
    <div class="capture-row">
      <span class="hint" id="cap-mode">${state.user ? 'Auto-saves to your library' : 'Saved on this device'}</span>
      <span class="kind-pill" id="cap-kind" style="display:none">Topic</span>
      <span class="spacer"></span>
      <button class="btn primary" id="cap-btn">Explore ✦</button>
    </div>
  </div>
  <div class="examples">${EXAMPLES.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  <div class="status-line" id="cap-status" role="status" aria-live="polite"></div>
  ${cont.length ? `<section class="section tight"><div class="section-head"><h2>Pick up where you left off</h2><p>${cont.length === 1 ? 'one story in progress' : cont.length + ' stories in progress'}</p></div>
    <div class="strip">${cont.map((t) => {
      const rp = readingProgress[t.id]; const pct = rp ? Math.round(rp.pct || 0) : (t.readPct || 0);
      return `<article class="strip-card" data-open="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
        <div class="cat">Last read ${esc(timeAgo(t.lastOpenedAt))} · ${readMins(t)} min read</div>
        <h3>${esc(t.title)}</h3>
        <div class="card-meta"><span class="pill ${esc(t.status)}">${esc(t.status)}</span>${pct > 0 ? `<span>${pct}% read</span>` : ''}</div>
        ${pct > 0 ? `<div style="margin-top:8px;height:3px;background:var(--line);border-radius:2px;overflow:hidden"><i style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,var(--accent),var(--blue))"></i></div>` : ''}
      </article>`;
    }).join('')}</div></section>` : ''}
  ${red.length ? `<section class="section tight"><div class="section-head"><h2>Gently resurfacing</h2><p>no pressure — just wonder</p></div>
    <div class="strip">${red.map(({ topic, prompt }) => `<article class="strip-card" data-open="${esc(topic.id)}" tabindex="0"><div class="cat">${esc(prompt)}</div><h3>${esc(topic.title)}</h3><div class="card-meta"><span class="pill ${esc(topic.status)}">${esc(topic.status)}</span><span>${timeAgo(topic.createdAt)}</span></div></article>`).join('')}</div></section>` : ''}
  <section class="section tight"><div class="section-head"><h2>Recent curiosities</h2><p>${total} saved</p><span class="spacer"></span>
    <div class="seg sm" id="f-view-home" aria-label="View"><button data-v="grid" class="${state.filter.view === 'grid' ? 'active' : ''}" aria-pressed="${state.filter.view === 'grid'}">Tiles</button><button data-v="list" class="${state.filter.view === 'list' ? 'active' : ''}" aria-pressed="${state.filter.view === 'list'}">List</button></div>
    <button class="link" data-nav="library">View all →</button></div>
    <div class="grid" id="list-host"></div></section>`;
}
function libraryHTML(title, sub, showStatus) {
  const archivedCount = allTopics().filter((t) => t.archived).length;
  return `<section class="page-head"><div class="section-head"><h2>${esc(title)}</h2><p>${esc(sub)}${archivedCount && !state.filter.showArchived ? ` · ${archivedCount} archived` : ''}</p><span class="spacer"></span>
    <button class="btn small ghost" id="import-btn" title="Restore topics from a Curio backup file">Import</button>
    <button class="btn small ghost" id="export-btn" title="Download your whole library as JSON">Export</button>
    <button class="btn small ghost" id="export-md-btn" title="Export as Markdown">MD</button></div>
  <input type="file" id="import-file" accept="application/json,.json" hidden>
  ${toolbarHTML(showStatus)}<div class="grid" id="list-host"></div></section>
  <section class="section tight"><div class="section-head"><h2>Capture another</h2></div>
  <div class="capture slim"><textarea id="cap-input" rows="2" placeholder="What are you curious about now?"></textarea>
  <div class="capture-row"><span class="hint">Auto-saves${state.user ? '' : ' on this device'}</span><span class="spacer"></span><button class="btn primary" id="cap-btn">Explore ✦</button></div></div>
  <div class="status-line" id="cap-status" role="status" aria-live="polite"></div></section>`;
}
function discoverHTML() {
  const d = state.discover;
  if (!d) return `<section class="section"><div class="section-head"><h2>Feed Your Curiosity</h2></div><div class="skel"></div><div class="skel"></div></section>`;
  const col = (title, items) => `<div class="disc-col"><h4>${esc(title)}</h4>${items.map((r) => `<button class="rec" data-query="${esc(r.query || r.title)}"><h5>${esc(r.title)}</h5><p class="why">${esc(r.reason || '')}</p></button>`).join('') || '<p class="hint">Save a few topics to unlock this.</p>'}</div>`;
  const all = [...(d.related || []), ...(d.unexpected || []), ...(d.newCuriosities || [])];
  const surprise = all.length ? all[Math.floor(Math.random() * all.length)] : null;
  return `<section class="page-head"><div class="section-head"><h2>Feed Your Curiosity</h2><p>${state.discoverEmpty ? 'starter picks — save topics to personalize' : 'based on your library · no key needed'}</p><span class="spacer"></span>
    ${surprise ? `<button class="btn small primary" id="surprise-btn" data-query="${esc(surprise.query || surprise.title)}">Surprise me ✦</button>` : ''}
    <button class="btn small ghost" id="random-btn">Random rabbit hole</button></div>
  <div class="disc-grid">${col('Go deeper', d.related)}${col('Unexpected connections', d.unexpected)}${col('Try something new', d.newCuriosities)}</div></section>`;
}
function stepsHTML(t) {
  const order = ['unread', 'exploring', 'completed'];
  const idx = order.indexOf(t.status);
  return `<div class="steps" role="group" aria-label="Progress">${order.map((s, i) => `<button class="step ${i <= idx ? 'done' : ''} ${t.status === s ? 'now' : ''}" data-status="${s}" aria-pressed="${t.status === s}"><span class="dot">${i < idx ? '✓' : (i + 1)}</span>${s}</button>${i < 2 ? '<span class="bar"></span>' : ''}`).join('')}</div>`;
}
function storyKey(t) { return t.wikiTitle || t.title; }
function storyPanelHTML(t) {
  const story = state.stories[storyKey(t)];
  if (story && state.storyOpen.has(t.id)) return `<section class="reader reader-root" id="story-panel" data-reading="${esc(prefs.readingTheme)}" aria-label="The whole story">${storyBodyHTML(t)}</section>`;
  return `<div class="panel" id="story-panel"><div class="panel-head"><h3>The whole story</h3><span class="hint" id="story-hint">beyond the opening paragraph</span></div><div id="story-body">${storyBodyHTML(t)}</div></div>`;
}
function storyBodyHTML(t) {
  const story = state.stories[storyKey(t)];
  if (!story || !state.storyOpen.has(t.id)) {
    return `<p class="hint">The overview above is only the opening paragraph. Open the full story to get the rest of it: every section of the article, a timeline of dated events, the names and places that keep coming back, and the reporting behind it.</p>
      <div class="story-actions"><button class="btn small primary" id="story-btn">Open the full story</button><span class="hint" id="story-note">Reads the complete Wikipedia article — nothing is stored.</span></div>`;
  }
  const words = (s) => s.blocks.reduce((n, b) => n + b.text.split(/\s+/).filter(Boolean).length, 0);
  const article = story.sections.length ? story.sections : (story.lead ? [{ heading: 'The article', blocks: story.lead.blocks }] : []);
  const toc = article.map((s, i) => `<button class="toc-item" data-sec="${i}"><span class="toc-n">${i + 1}</span><span class="toc-t">${esc(s.heading)}</span><span class="toc-w">${words(s)}</span></button>`).join('');
  const body = article.map((s, i) => `<section class="rd-sec" id="rd-sec-${i}"><h3 class="rd-h"><span class="rd-num">${i + 1}</span><span>${esc(s.heading)}</span></h3>${s.blocks.map((b) => b.t === 'h' ? `<h4>${esc(b.text)}</h4>` : `<p>${esc(b.text)}</p>`).join('')}</section>`).join('');
  const tl = story.timeline.length ? `<div class="rd-card"><h4>What happened, in order</h4><ol class="timeline">${story.timeline.map((r) => `<li><span class="tl-year">${r.year}</span><p>${esc(r.text)}</p></li>`).join('')}</ol></div>` : '';
  const threads = story.threads.length ? `<div class="story-block"><h4>Threads that run through it</h4><p class="hint" style="margin-bottom:10px">Tap one to make it its own topic — your notes here stay put.</p><div class="rel-grid">${story.threads.map((r) => `<button class="rel" data-query="${esc(r.title)}"><span>${esc(r.title)}<small>${esc(r.reason)}</small></span><span>→</span></button>`).join('')}</div></div>` : '';
  const cats = story.categories.length ? `<div class="rd-card"><h4>Filed under</h4><div class="cat-chips">${story.categories.map((c) => `<span>${esc(c)}</span>`).join('')}</div></div>` : '';
  const elsewhere = story.elsewhere.length ? `<div class="story-block"><h4>Reported elsewhere</h4><p class="hint" style="margin-bottom:8px">The sources the article itself cites — go to the primary reporting.</p>${story.elsewhere.map((s, i) => `<a class="src" href="${esc(safeHref(s.url))}" target="_blank" rel="noopener"><span class="src-n">${i + 1}</span><span class="src-body"><span class="src-p">${esc(s.publisher)}</span><span class="src-t">${esc(s.title)}</span></span><span class="src-go">↗</span></a>`).join('')}</div>` : '';
  const q = encodeURIComponent(story.title);
  const dig = `<div class="story-block"><h4>Keep digging</h4><div class="rel-grid">
    <a class="rel" href="https://duckduckgo.com/?q=${q}" target="_blank" rel="noopener"><span>Search the wider web<small>News, interviews, forums — anything newer than the article</small></span><span>↗</span></a>
    <a class="rel" href="https://news.google.com/search?q=${q}" target="_blank" rel="noopener"><span>Search the news<small>Latest coverage and follow-ups</small></span><span>↗</span></a>
    <a class="rel" href="https://en.wikipedia.org/w/index.php?title=Special:WhatLinksHere&target=${q}" target="_blank" rel="noopener"><span>What links here<small>Every article that mentions this one</small></span><span>↗</span></a>
  </div></div>`;
  const fs = prefs.readingSize === 'sm' ? '15px' : prefs.readingSize === 'lg' ? '19px' : '16.5px';
  const meas = prefs.readingMeasure === 'narrow' ? '56ch' : prefs.readingMeasure === 'wide' ? '80ch' : '68ch';
  return `<div class="rd-stage"><div class="rd-top">
      <div class="rd-meta"><strong id="rd-left">${Math.max(1, Math.round(story.words / 200))} min read</strong><span class="rd-dot rd-extra">·</span><span class="rd-extra">${story.words.toLocaleString()} words</span><span class="rd-dot rd-extra">·</span><span class="rd-extra">${article.length} sections</span></div>
      <span class="spacer"></span><button class="btn small ghost" id="story-start">Start</button><button class="btn small ghost" id="story-focus">Focus</button><button class="btn small ghost" id="story-settings">Aa</button><button class="btn small ghost" id="story-refresh">Refresh</button><button class="btn small ghost" id="story-hide">Close</button>
      <div class="rd-progress"><i id="rd-bar"></i></div>
    </div>
    <div class="rd-grid" style="--measure:${meas}">
      <div class="rd-main" style="font-size:${fs}">
        <nav class="rd-toc" aria-label="In this story"><div class="rd-toc-head"><h4>In this story</h4><span class="hint">jump to a section</span></div><div class="rd-toc-list">${toc}</div></nav>
        <article class="rd-body" id="rd-body">${body}</article>
      </div>
      <aside class="rd-rail">${tl}${cats}</aside>
    </div></div>
    <div class="rd-after">${threads}${elsewhere}${dig}</div>
    <p class="hint" style="margin-top:22px">All of this comes from the Wikipedia article <a href="${esc(safeHref(story.url))}" target="_blank" rel="noopener">${esc(story.title)} ↗</a>.</p>
    <div id="reading-settings" class="settings-pop" style="display:none;position:fixed;top:80px;right:24px">
      <label>Font size</label><div class="row">${['sm','md','lg'].map((s) => `<button data-size="${s}" class="${prefs.readingSize === s ? 'on' : ''}">${s === 'sm' ? 'S' : s === 'md' ? 'M' : 'L'}</button>`).join('')}</div>
      <label>Measure</label><div class="row">${['narrow','normal','wide'].map((m) => `<button data-measure="${m}" class="${prefs.readingMeasure === m ? 'on' : ''}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}</div>
      <label>Theme</label><div class="row">${['dark','light','sepia'].map((th) => `<button data-rtheme="${th}" class="${prefs.readingTheme === th ? 'on' : ''}">${th[0].toUpperCase() + th.slice(1)}</button>`).join('')}</div>
    </div>`;
}
function detachProgress() { if (state._progress) { state._progress(); state._progress = null; } }
function bindReadingProgress(t) {
  detachProgress();
  const body = $('#rd-body');
  const bar = $('#rd-bar');
  const left = $('#rd-left');
  const story = state.stories[storyKey(t)];
  if (!body || !bar || !story) return;
  const mins = Math.max(1, Math.round(story.words / 200));
  let raf = 0;
  const paint = () => {
    raf = 0;
    const r = body.getBoundingClientRect();
    const anchor = window.innerHeight * 0.72;
    const pct = Math.min(1, Math.max(0, (anchor - r.top) / Math.max(r.height, 1)));
    bar.style.width = (pct * 100).toFixed(1) + '%';
    if (left) left.textContent = pct >= 0.99 ? 'Finished' : pct <= 0.01 ? mins + ' min read' : Math.max(1, Math.round(mins * (1 - pct))) + ' min left';
    // persist (throttled: at most once per second, min 1 point change)
    const nextPct = pct * 100;
    const cur = readingProgress[t.id] || {};
    const now = Date.now();
    if (Math.abs((cur.pct || 0) - nextPct) > 1 && (!state._lastProgressSave || now - state._lastProgressSave > 1000)) {
      state._lastProgressSave = now;
      readingProgress[t.id] = { pct: nextPct, at: now };
      saveReadingProgress(); t.readPct = nextPct; if (!state.user) saveGuest();
    }
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  // resume
  const rp = readingProgress[t.id];
  if (rp && rp.pct > 0 && rp.pct < 99) setTimeout(() => { const y = (rp.pct / 100) * (document.body.scrollHeight - window.innerHeight); window.scrollTo({ top: Math.max(0, y - 100), behavior: 'smooth' }); }, 300);
  paint();
  state._progress = () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); };
}
function bindStory(t) {
  const open = $('#story-btn');
  if (open) open.onclick = () => openStory(t);
  const refresh = $('#story-refresh');
  if (refresh) refresh.onclick = () => openStory(t, true);
  const hide = $('#story-hide');
  if (hide) hide.onclick = () => { state.storyOpen.delete(t.id); detachProgress(); render(); };
  const start = $('#story-start');
  if (start) start.onclick = () => $('#rd-body')?.scrollIntoView({ block: 'start' });
  const focus = $('#story-focus');
  if (focus) focus.onclick = () => { document.body.classList.toggle('focus-mode'); state.focusMode = document.body.classList.contains('focus-mode'); };
  const settings = $('#story-settings');
  if (settings) settings.onclick = () => {
    const p = $('#reading-settings'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
  };
  const panel = $('#story-panel');
  if (panel) {
    panel.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
    panel.querySelectorAll('[data-sec]').forEach((b) => (b.onclick = () => {
      panel.querySelectorAll('[data-sec]').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('rd-sec-' + b.dataset.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const rsp = $('#reading-settings');
    if (rsp) {
      rsp.querySelectorAll('[data-size]').forEach((b) => (b.onclick = () => { prefs.readingSize = b.dataset.size; savePrefs(); render(); }));
      rsp.querySelectorAll('[data-measure]').forEach((b) => (b.onclick = () => { prefs.readingMeasure = b.dataset.measure; savePrefs(); render(); }));
      rsp.querySelectorAll('[data-rtheme]').forEach((b) => (b.onclick = () => { prefs.readingTheme = b.dataset.rtheme; const r = $('#story-panel'); if (r) r.dataset.reading = prefs.readingTheme; savePrefs(); render(); }));
    }
  }
  bindReadingProgress(t);
}
async function openStory(t, force) {
  const key = storyKey(t);
  state.storyOpen.add(t.id);
  if (!force && state.stories[key]) { render(); $('#story-panel')?.scrollIntoView({ block: 'start' }); return; }
  const btn = $('#story-btn') || $('#story-refresh');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spin"></span> Loading…'; }
  const note = $('#story-note');
  if (note) note.textContent = 'Loading the full article from Wikipedia…';
  try {
    state.stories[key] = await loadStory(key);
    render();
    $('#story-panel')?.scrollIntoView({ block: 'start' });
    playChime();
  } catch (e) {
    state.storyOpen.delete(t.id);
    const n = $('#story-note');
    if (n) n.textContent = e.message;
    if (btn) { btn.disabled = false; btn.innerHTML = 'Try again'; }
    toast(e.message);
  }
}

function topicHTML(t) {
  const facts = (t.keyFacts || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const srcs = (t.sources || []).map((s, i) => {
    let host = 'source';
    try { host = new URL(s.url).hostname.replace(/^www\./, ''); } catch {}
    return `<a class="src" href="${esc(safeHref(s.url))}" target="_blank" rel="noopener"><span class="src-n">${i + 1}</span><span class="src-body"><span class="src-p">${esc(s.publisher || host)}</span><span class="src-t">${esc(s.title)}</span>${s.snippet ? `<span class="src-s">${esc(s.snippet)}</span>` : ''}</span><span class="src-go">↗</span></a>`;
  }).join('');
  const hasSimple = Boolean(t.simple?.overview);
  const mode = hasSimple ? (prefs.summaryMode === 'simple' ? 'simple' : 'full') : 'full';
  const overviewText = mode === 'simple' && hasSimple ? t.simple.overview : (t.overview || 'No overview yet.');
  const overviewNote = t.overviewNote ? `<p class="hint" style="margin-bottom:8px">🔍 ${esc(t.overviewNote)}</p>` : '';
  const words = (t.notes || '').trim() ? (t.notes || '').trim().split(/\s+/).length : 0;
  const storyReady = Boolean(state.storyOpen.has(t.id) && state.stories[storyKey(t)]);
  const tags = (t.tags || []).map((tg) => `<span class="pill" style="font-size:10px">${esc(tg)}</span>`).join(' ');
  const tagInput = `<div style="margin-top:10px"><input id="tag-input" placeholder="Add tag…" style="background:var(--surface-3);border:1px solid var(--line);border-radius:var(--r-sm);color:var(--ink);padding:6px 10px;font-size:12px;width:160px"><button class="btn small ghost" id="tag-add" style="margin-left:6px">Add</button>${tags ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${tags} ${t.tags.map((tg) => `<button class="chip" data-rmtag="${esc(tg)}" style="font-size:10px;padding:3px 8px">×</button>`).join('')}</div>` : ''}</div>`;
  return `<button class="back" id="back-btn">← Back</button>
  <div class="topic-hero">
    <div class="topic-top"><div class="cat">${esc(t.category)} · ${esc(t.inputType || 'topic')} · ${readMins(t)} min read</div>
    ${t.archived ? '<span class="pill">archived</span>' : ''}</div>
    <h1>${esc(t.title)}</h1>
    <div class="date">Saved ${fmtDate(t.createdAt)} · updated ${timeAgo(t.updatedAt || t.createdAt)}</div>
    <div class="topic-links"><span class="badge plain">○ Curio research · Wikipedia + web</span>
    ${t.wikiUrl ? `<a class="badge plain link" href="${esc(safeHref(t.wikiUrl))}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
    ${hasSimple && t.simple.url ? `<a class="badge plain link" href="${esc(safeHref(t.simple.url))}" target="_blank" rel="noopener">Simple Wikipedia ↗</a>` : ''}</div>
    ${stepsHTML(t)}
    <div class="status-row" id="status-row">
      <button class="btn small ghost" id="copy-btn">Copy summary</button>
      <button class="btn small ghost" id="edit-btn">Rename</button>
      <button class="btn small ghost" id="arch-btn">${t.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn small ghost danger" id="del-btn">Delete</button>
      <button class="btn small ghost" id="share-btn">Share</button>
    </div>
    ${tagInput}
  </div>
  ${storyReady ? storyPanelHTML(t) : ''}
  <div class="topic-layout">
    <div class="prose">
      <div class="panel"><div class="panel-head"><h3>Overview</h3>
        ${hasSimple ? `<div class="seg sm" id="sum-toggle" role="tablist" aria-label="Summary style"><button data-m="full" class="${mode === 'full' ? 'active' : ''}">Full</button><button data-m="simple" class="${mode === 'simple' ? 'active' : ''}">Plain English</button></div>` : ''}
      </div>${overviewNote}<p>${esc(overviewText)}</p>
        ${hasSimple && mode === 'simple' ? `<p class="hint" style="margin-top:10px">Plain-language version from Simple English Wikipedia. <a href="${esc(safeHref(t.simple.url || '#'))}" target="_blank" rel="noopener">Read there ↗</a></p>` : ''}
        ${t.disputed ? `<details class="note"><summary>Established vs debated</summary><p>${esc(t.disputed)}</p></details>` : ''}</div>
      ${storyReady ? '' : storyPanelHTML(t)}
      ${facts ? `<div class="panel"><h3>Key facts</h3><ul class="facts">${facts}</ul></div>` : ''}
      <div class="panel"><div class="panel-head"><h3>Sources & further reading</h3><span class="hint">${(t.sources || []).length} links</span></div>${srcs || '<p class="hint">No sources found yet.</p>'}</div>
      ${(t.related || []).length ? `<div class="panel"><h3>Rabbit holes</h3><p class="hint" style="margin-bottom:12px">Each one opens fresh research — your current notes stay put.</p><div class="rel-grid">${t.related.map((r) => `<button class="rel" data-query="${esc(r.title)}"><span>${esc(r.title)}<small>${esc(r.reason || '')}</small></span><span>→</span></button>`).join('')}</div></div>` : ''}
      <div class="panel"><h3>Notes</h3>
        <div style="display:flex;gap:8px;margin-bottom:8px"><button class="btn small ghost" id="notes-md-toggle">Preview Markdown</button></div>
        <textarea class="notes-area" id="notes" placeholder="What struck you? What do you want to remember or follow up on?">${esc(t.notes || '')}</textarea>
        <div id="notes-preview" class="md-preview" style="display:none"></div>
        <div class="notes-foot"><span class="save-note" id="notes-state">Autosaves · ${words} words</span><button class="btn small ghost" id="notes-copy">Copy notes</button></div>
      </div>
    </div>
    <aside class="topic-side">
      <div class="panel side-card"><h3>Details</h3>
        <dl class="meta"><dt>Status</dt><dd>${esc(t.status)}</dd><dt>Category</dt><dd>${esc(t.category)}</dd><dt>Added</dt><dd>${esc(fmtDate(t.createdAt))}</dd>${t.wikiTitle ? `<dt>Wikipedia</dt><dd>${esc(t.wikiTitle)}</dd>` : ''}${(t.tags||[]).length ? `<dt>Tags</dt><dd>${esc((t.tags||[]).join(', '))}</dd>` : ''}</dl>
      </div>
      <div class="panel side-card"><h3>Review</h3><p class="hint">Next review ${dueIn(t.reviewDueAt)}.</p>
        <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
          <button class="btn small ghost" data-review="easy">Still curious</button>
          <button class="btn small ghost" data-review="hard">Got it</button>
          <button class="btn small ghost" data-review="skip">Let it go</button>
        </div>
      </div>
    </aside>
  </div>`;
}

/* ---------- render ---------- */
function render() {
  parseRoute();
  detachProgress();
  const routeChanged = state._route !== state.route;
  state._route = state.route;
  if (routeChanged) { $('#modal-root').innerHTML = ''; document.body.classList.remove('focus-mode'); }
  if (state.route !== 'library') state.filter.status = 'all';
  renderSide();
  closeMore();
  const main = $('#main');
  main.ondragover = null; main.ondragleave = null; main.ondrop = null;
  main.setAttribute('aria-busy', 'true');
  if (state.route === 'home') {
    main.innerHTML = homeHTML();
    bindCapture(); renderList(6);
    const vh = $('#f-view-home');
    if (vh) vh.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.view = b.dataset.v; prefs.view = b.dataset.v; savePrefs(); render(); }));
    bindCards(main);
    main.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => capture(b.dataset.ex)));
    main.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
    // kind pill update
    const ci = $('#cap-input');
    if (ci) ci.oninput = () => { const k = $('#cap-kind'); if (k) { k.style.display = ci.value.trim() ? 'inline-block' : 'none'; k.textContent = inputKind(ci.value); } };
  } else if (state.route === 'topic') {
    const t = findTopic(state.topicId);
    if (!t) { main.innerHTML = `<div class="empty"><div class="big">?</div><h3>That topic isn't here.</h3><p>It may have been deleted.</p><br><button class="btn" onclick="location.hash='#/library'">Back to library</button></div>`; main.setAttribute('aria-busy', 'false'); return; }
    markOpened(t);
    main.innerHTML = topicHTML(t);
    $('#back-btn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/library');
    $$('.topic-hero .step').forEach((b) => (b.onclick = () => patchTopic(t.id, { status: b.dataset.status })));
    const tog = $('#sum-toggle');
    if (tog) tog.querySelectorAll('button').forEach((b) => (b.onclick = () => { prefs.summaryMode = b.dataset.m; savePrefs(); render(); }));
    $('#del-btn').onclick = () => deleteTopic(t.id);
    $('#arch-btn').onclick = async () => { await patchTopic(t.id, { archived: !t.archived }, { silent: true }); toast(t.archived ? 'Unarchived.' : 'Archived.'); render(); };
    $('#edit-btn').onclick = () => openRename(t);
    $('#copy-btn').onclick = async () => {
      const text = `${t.title}\n\n${t.overview || ''}\n\nSources:\n${(t.sources || []).map((s) => '- ' + s.title + ' ' + s.url).join('\n')}`;
      try { await navigator.clipboard.writeText(text); toast('Summary copied.'); } catch { toast('Copy blocked by browser.'); }
    };
    $('#share-btn').onclick = () => shareTopic(t);
    const notes = $('#notes');
    let h;
    if (notes) notes.oninput = () => {
      const w = notes.value.trim() ? notes.value.trim().split(/\s+/).length : 0;
      $('#notes-state').textContent = 'Saving… · ' + w + ' words';
      clearTimeout(h);
      h = setTimeout(async () => {
        await patchTopic(t.id, { notes: notes.value }, { silent: true });
        const ns = $('#notes-state');
        if (ns) ns.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + ' · ' + w + ' words';
      }, 700);
    };
    const nc = $('#notes-copy');
    if (nc) nc.onclick = async () => { try { await navigator.clipboard.writeText(notes.value || ''); toast('Notes copied.'); } catch { toast('Copy blocked by browser.'); } };
    const nmd = $('#notes-md-toggle');
    if (nmd) nmd.onclick = () => {
      const prev = $('#notes-preview');
      if (prev.style.display === 'none') { prev.style.display = 'block'; prev.innerHTML = renderMarkdown(notes.value || ''); nmd.textContent = 'Edit'; }
      else { prev.style.display = 'none'; nmd.textContent = 'Preview Markdown'; }
    };
    // tag add
    const ta = $('#tag-add');
    if (ta) ta.onclick = async () => {
      const inp = $('#tag-input'); const v = inp.value.trim();
      if (!v) return;
      const tags = [...new Set([...(t.tags || []), v])];
      await patchTopic(t.id, { tags }, { silent: true });
      toast('Tag added.'); render();
    };
    $$('[data-rmtag]').forEach((b) => (b.onclick = async () => {
      const tags = (t.tags || []).filter((x) => x !== b.dataset.rmtag);
      await patchTopic(t.id, { tags }, { silent: true }); render();
    }));
    // review buttons
    $$('[data-review]').forEach((b) => (b.onclick = async () => {
      const t2 = findTopic(t.id);
      if (b.dataset.review === 'easy') { t2.reviewInterval = Math.min((t2.reviewInterval || 2) * 2, 60); t2.reviewDueAt = Date.now() + t2.reviewInterval * 86400000; }
      else if (b.dataset.review === 'hard') { t2.reviewInterval = 1; t2.reviewDueAt = Date.now() + 86400000; }
      else { t2.archived = true; }
      await patchTopic(t.id, { reviewInterval: t2.reviewInterval, reviewDueAt: t2.reviewDueAt, archived: t2.archived }, { silent: true });
      toast('Updated.'); render();
    }));
    bindStory(t);
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
  } else if (state.route === 'discover') {
    main.innerHTML = discoverHTML();
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
    const s = $('#surprise-btn');
    if (s) s.onclick = () => capture(s.dataset.query);
    const r = $('#random-btn');
    if (r) r.onclick = () => {
      const ts = allTopics();
      if (!ts.length) { toast('Capture a topic first.'); return; }
      const t = ts[Math.floor(Math.random() * ts.length)];
      const threads = (state.stories[storyKey(t)]?.threads || []);
      const pick = threads.length ? threads[Math.floor(Math.random() * threads.length)] : null;
      capture(pick ? pick.title : t.title);
    };
  } else {
    const meta = { library: ['My Library', 'Everything you have saved'] }[state.route] || ['Library', ''];
    const showStatus = state.route === 'library';
    if (!showStatus) state.filter.status = 'all';
    main.innerHTML = libraryHTML(meta[0], meta[1], showStatus);
    bindToolbar(); bindCapture(); renderList();
    const ex = $('#export-btn');
    if (ex) ex.onclick = exportLibrary;
    const exm = $('#export-md-btn');
    if (exm) exm.onclick = exportMarkdown;
    const im = $('#import-btn');
    if (im) im.onclick = () => $('#import-file')?.click();
    const imf = $('#import-file');
    if (imf) imf.onchange = (e) => importBackupFile(e.target.files && e.target.files[0]);
    // drag and drop
    main.ondragover = (e) => { e.preventDefault(); main.classList.add('drag'); };
    main.ondragleave = () => main.classList.remove('drag');
    main.ondrop = (e) => { e.preventDefault(); main.classList.remove('drag'); const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f) importBackupFile(f); };
  }
  // input kind + status
  const ci = $('#cap-input');
  if (ci && !ci.oninput) ci.oninput = () => { const k = $('#cap-kind'); if (k) { k.style.display = ci.value.trim() ? 'inline-block' : 'none'; k.textContent = inputKind(ci.value); } };
  main.setAttribute('aria-busy', 'false');
  // focus management — only claim focus when nothing meaningful holds it
  const focused = document.activeElement;
  if (!focused || focused === document.body || focused === main) {
    try { main.focus({ preventScroll: true }); } catch {}
  }
  // onboarding
  if (!prefs.onboarded && allTopics().length === 0 && state.route === 'home') { setTimeout(() => startOnboarding(), 600); }
}

/* ---------- capture binding ---------- */
function bindCapture() {
  const btn = $('#cap-btn'), input = $('#cap-input');
  if (!btn || !input) return;
  const goCap = () => capture(input.value);
  btn.onclick = goCap;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goCap(); } };
  if (window.matchMedia('(pointer:fine)').matches) input.focus();
}

/* ---------- backup & restore ---------- */
const BACKUP_APP = 'curio';
const BACKUP_VERSION = 2;
const cloneTopic = (t) => JSON.parse(JSON.stringify(t || {}));
const emptyField = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);
const normKey = (s) => String(s || '').toLowerCase().replace(/[\s_]+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();
function topicStamp(v, fallback) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function backupTopic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const src = raw.topic && typeof raw.topic === 'object' && raw.topic.title ? raw.topic : raw;
  const title = String(src.title || '').trim();
  if (!title) return null;
  const now = Date.now();
  const t = cloneTopic(src);
  t.createdAt = topicStamp(src.createdAt, now);
  t.updatedAt = topicStamp(src.updatedAt, t.createdAt);
  if (!t.id || typeof t.id !== 'string') t.id = uid();
  t.title = title;
  t.input = String(src.input || '');
  t.inputType = ['topic', 'question', 'link'].includes(src.inputType) ? src.inputType : 'topic';
  t.category = String(src.category || 'Curiosity');
  t.status = ['unread', 'exploring', 'completed'].includes(src.status) ? src.status : 'exploring';
  t.overview = String(src.overview || '');
  t.notes = String(src.notes || '');
  t.keyFacts = Array.isArray(src.keyFacts) ? src.keyFacts.filter((x) => typeof x === 'string' && x.trim()) : [];
  t.sources = Array.isArray(src.sources) ? src.sources.filter((s) => s && s.url).map((s) => ({ title: String(s.title || ''), url: String(s.url), publisher: String(s.publisher || ''), snippet: String(s.snippet || '') })) : [];
  t.related = Array.isArray(src.related) ? src.related.filter((r) => r && r.title).map((r) => ({ title: String(r.title), reason: String(r.reason || '') })) : [];
  t.wikiTitle = src.wikiTitle ? String(src.wikiTitle) : null;
  t.wikiUrl = src.wikiUrl ? String(src.wikiUrl) : null;
  t.simple = src.simple && src.simple.overview ? { overview: String(src.simple.overview), url: src.simple.url ? String(src.simple.url) : null } : null;
  t.archived = Boolean(src.archived);
  t.aiPowered = Boolean(src.aiPowered);
  t.tags = Array.isArray(src.tags) ? src.tags.filter((x) => typeof x === 'string') : [];
  t.readPct = Number.isFinite(src.readPct) ? src.readPct : 0;
  if (src.disputed) t.disputed = String(src.disputed); else delete t.disputed;
  if (Number.isFinite(topicStamp(src.lastOpenedAt, NaN))) t.lastOpenedAt = topicStamp(src.lastOpenedAt, NaN); else delete t.lastOpenedAt;
  if (Number.isFinite(src.reviewDueAt)) t.reviewDueAt = src.reviewDueAt;
  if (Number.isFinite(src.reviewInterval)) t.reviewInterval = src.reviewInterval;
  return t;
}
function backupTopics(data) {
  const list = Array.isArray(data) ? data : (data && Array.isArray(data.topics) ? data.topics : null);
  if (!list) throw new Error('That file doesn’t look like a Curio backup.');
  const topics = list.map(backupTopic).filter(Boolean);
  if (!topics.length) throw new Error('No topics found in that backup.');
  return topics;
}
function sameTopic(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  if (a.wikiTitle && b.wikiTitle && normKey(a.wikiTitle) === normKey(b.wikiTitle)) return true;
  const ta = normKey(a.title), tb = normKey(b.title);
  return Boolean(ta) && ta === tb;
}
function fillMissing(target, incoming) {
  let filled = 0;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === 'id' || k === 'createdAt' || k === 'updatedAt' || k === 'lastOpenedAt') continue;
    if (emptyField(v) || !emptyField(target[k])) continue;
    target[k] = v; filled++;
  }
  if (!target.createdAt || incoming.createdAt < target.createdAt) target.createdAt = incoming.createdAt;
  if (incoming.updatedAt > (target.updatedAt || 0)) target.updatedAt = incoming.updatedAt;
  if (incoming.lastOpenedAt && incoming.lastOpenedAt > (target.lastOpenedAt || 0)) target.lastOpenedAt = incoming.lastOpenedAt;
  return filled;
}
function planImport(incoming) {
  const work = allTopics().map(cloneTopic);
  const added = [];
  let merged = 0, filled = 0;
  for (const inc of incoming) {
    const dup = work.find((e) => sameTopic(e, inc));
    if (!dup) { work.push(inc); added.push(inc); continue; }
    merged++; filled += fillMissing(dup, inc);
  }
  return { work, added, merged, filled };
}
function persistLibrary(list) {
  if (state.user) state.topics = list;
  else { state.guest = list; saveGuest(); }
}
function backupPayload() { const topics = allTopics().map(cloneTopic); return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), count: topics.length, topics }; }
function backupFileName() { const d = new Date(); return `curio-library-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`; }
function exportLibrary() {
  const payload = backupPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = backupFileName(); a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Backed up ${payload.count} ${payload.count === 1 ? 'topic' : 'topics'}.`);
}
function exportMarkdown() {
  const topics = allTopics();
  const md = topics.map((t) => `# ${t.title}\n\n${t.overview || ''}\n\n${(t.keyFacts || []).map((f) => '- ' + f).join('\n')}\n\n${(t.sources || []).map((s) => `- [${s.title}](${s.url})`).join('\n')}\n\n---\n`).join('\n');
  const blob = new Blob([md], { type: 'text/markdown' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'curio-library.md'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Exported as Markdown.');
}
function exportHTML() {
  const topics = allTopics();
  const html = `<!doctype html><html><head><meta charset=utf-8><title>Curio export</title><style>body{font-family:system-ui;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.6}h1{font-family:Georgia}hr{margin:32px 0}</style></head><body><h1>Curio library</h1>${topics.map((t) => `<article><h2>${esc(t.title)}</h2><p>${esc(t.overview || '')}</p><ul>${(t.keyFacts || []).map((f) => `<li>${esc(f)}</li>`).join('')}</ul></article>`).join('<hr>')}</body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'curio-library.html'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Exported as HTML.');
}
function openImportPreview(plan, fileName) {
  const root = $('#modal-root');
  const parts = [];
  if (plan.added.length) parts.push(`${plan.added.length} new`);
  if (plan.merged) parts.push(`${plan.merged} already here`);
  if (plan.filled) parts.push(`${plan.filled} empty ${plan.filled === 1 ? 'field' : 'fields'} filled in`);
  const action = plan.added.length ? `Import ${plan.added.length} new ${plan.added.length === 1 ? 'topic' : 'topics'}` : 'Fill in the gaps';
  root.innerHTML = `<div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="Import backup"><h3>Import backup</h3>
    <p class="hint">${esc(fileName || 'Backup file')} · ${esc(parts.join(' · '))}</p>
    <p class="hint">Nothing already in your library is overwritten — matching topics keep what you have and only pick up what's missing.</p>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost small" id="i-cancel">Cancel</button><button class="btn primary small" id="i-confirm">${esc(action)}</button></div></div></div>`;
  const close = () => { root.innerHTML = ''; };
  $('#i-cancel').onclick = close;
  $('#i-confirm').onclick = () => {
    persistLibrary(plan.work);
    close();
    refreshDiscover().then(render).catch(render);
    toast(plan.added.length ? `Imported ${plan.added.length} ${plan.added.length === 1 ? 'topic' : 'topics'}.` : 'Library updated.');
  };
  const wrap = root.querySelector('.modal-wrap');
  wrap.onkeydown = (e) => { if (e.key === 'Escape') close(); };
  trapFocus(wrap);
  $('#i-confirm').focus();
}
async function importBackupFile(file) {
  if (!file) return;
  const input = $('#import-file');
  try {
    let data;
    try { data = JSON.parse(await file.text()); } catch { throw new Error('That file isn’t valid JSON.'); }
    const plan = planImport(backupTopics(data));
    if (!plan.added.length && !plan.filled) { toast('Everything in that backup is already here.'); return; }
    openImportPreview(plan, file.name);
  } catch (e) {
    toast(e.message || 'Could not read that backup.');
  } finally {
    if (input) input.value = '';
  }
}

/* ---------- focus trap ---------- */
function trapFocus(root) {
  const focusable = () => [...root.querySelectorAll('button,a,input,textarea,select,[tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
  root.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const els = focusable();
    if (!els.length) return;
    const first = els[0], last = els[els.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ---------- markdown (tiny) ---------- */
function renderMarkdown(md) {
  let html = esc(md);
  html = html.replace(/^### (.*)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*)$/gm, '<h1>$1</h1>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/^- (.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
  html = html.replace(/\n\n/g, '</p><p>');
  return '<p>' + html + '</p>';
}

/* ---------- share ---------- */
async function shareTopic(t) {
  const shared = Object.assign({}, t, { notes: '' });
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify(shared))));
  const url = location.origin + location.pathname + '#/share/' + payload;
  try { await navigator.clipboard.writeText(url); toast('Link copied.'); } catch { toast('Copy blocked.'); }
  if (navigator.share) { try { await navigator.share({ title: t.title, text: t.overview, url }); } catch {} }
}

/* ---------- stats ---------- */
function showStats() {
  const topics = allTopics();
  const words = topics.reduce((n, t) => n + (t.overview || '').split(/\s+/).filter(Boolean).length, 0);
  const completed = topics.filter((t) => t.status === 'completed').length;
  const streak = computeStreak();
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal" style="max-width:520px" role="dialog" aria-modal="true"><h3>Your curiosity, by the numbers</h3>
    <div class="stats-grid">
      <div class="stat"><div class="num">${topics.length}</div><div class="lbl">topics saved</div></div>
      <div class="stat"><div class="num">${completed}</div><div class="lbl">completed</div></div>
      <div class="stat"><div class="num">${words.toLocaleString()}</div><div class="lbl">words researched</div></div>
      <div class="stat"><div class="num">${streak}</div><div class="lbl">day streak</div></div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn small" id="st-close">Close</button></div></div></div>`;
  trapFocus(root.querySelector('.modal-wrap'));
  $('#st-close').onclick = () => (root.innerHTML = '');
}
function computeStreak() {
  const days = new Set(allTopics().map((t) => new Date(t.createdAt).toDateString()));
  let streak = 0; const d = new Date();
  while (days.has(d.toDateString())) { streak++; d.setDate(d.getDate() - 1); }
  return streak;
}

/* ---------- onboarding ---------- */
function startOnboarding(force) {
  if (!force && prefs.onboarded) return;
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal" role="dialog" aria-modal="true" aria-label="Welcome"><h3>Welcome to Curio</h3>
    <p>Curio turns a half-formed thought into a researched story.</p>
    <ul style="margin:0 0 16px 18px;color:var(--muted);font-size:13.5px;line-height:1.7">
      <li><strong>Capture</strong> anything — a topic, a question, a link.</li>
      <li><strong>Read</strong> the full story, timeline, and sources.</li>
      <li><strong>Track</strong> your journey from unread to completed.</li>
    </ul>
    <div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost small" id="ob-skip">Skip</button><button class="btn primary small" id="ob-go">Capture your first curiosity</button></div></div></div>`;
  trapFocus(root.querySelector('.modal-wrap'));
  const close = () => { root.innerHTML = ''; prefs.onboarded = true; savePrefs(); };
  $('#ob-skip').onclick = close;
  $('#ob-go').onclick = () => { close(); setTimeout(() => $('#cap-input')?.focus(), 200); };
}

/* ---------- shortcuts modal ---------- */
function showShortcuts() {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal" style="max-width:520px" role="dialog" aria-modal="true"><h3>Keyboard shortcuts</h3>
    <div style="font-size:13px;color:var(--muted);line-height:1.9">
      <div><kbd class="kbd">/</kbd> Focus capture / search</div>
      <div><kbd class="kbd">⌘K</kbd> Command palette</div>
      <div><kbd class="kbd">?</kbd> This help</div>
      <div><kbd class="kbd">g h</kbd> / <kbd class="kbd">g l</kbd> / <kbd class="kbd">g d</kbd> Home / Library / Discover</div>
      <div><kbd class="kbd">n</kbd> New capture</div>
      <div><kbd class="kbd">Esc</kbd> Close modal / palette</div>
      <div><kbd class="kbd">j</kbd> / <kbd class="kbd">k</kbd> Move through cards</div>
      <div><kbd class="kbd">Enter</kbd> Open selected</div>
      <div><kbd class="kbd">r</kbd> Full story on/off · <kbd class="kbd">f</kbd> Focus mode · <kbd class="kbd">s</kbd> Reading settings</div>
    </div>
    <div style="margin-top:16px;display:flex;justify-content:flex-end"><button class="btn small" id="sc-close">Close</button></div></div></div>`;
  trapFocus(root.querySelector('.modal-wrap'));
  $('#sc-close').onclick = () => (root.innerHTML = '');
}

/* ---------- command palette ---------- */
function openPalette() {
  state.cmdOpen = true;
  const root = $('#modal-root');
  root.innerHTML = `<div class="palette-wrap" id="palette-wrap"><div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
    <input id="palette-input" placeholder="Search topics, actions…" autofocus>
    <div class="results" id="palette-results"></div>
  </div></div>`;
  const input = $('#palette-input');
  const wrap = $('#palette-wrap');
  const close = () => { root.innerHTML = ''; state.cmdOpen = false; };
  wrap.onclick = (e) => { if (e.target === wrap) close(); };
  let activeIdx = 0;
  function renderResults(q) {
    const ql = (q || '').toLowerCase();
    const topics = allTopics().filter((t) => !ql || (t.title + ' ' + t.category).toLowerCase().includes(ql)).slice(0, 8);
    const actions = [
      { label: 'Capture new topic', icon: '✦', run: () => { go('home'); setTimeout(() => $('#cap-input')?.focus(), 200); } },
      { label: 'Go to Library', icon: '▤', run: () => go('library') },
      { label: 'Go to Discover', icon: '✧', run: () => go('discover') },
      { label: 'Toggle theme', icon: '◐', run: () => cycleTheme() },
      { label: 'Export library (JSON)', icon: '↓', run: () => exportLibrary() },
      { label: 'Export Markdown', icon: '↓', run: () => exportMarkdown() },
      { label: 'Import backup', icon: '↑', run: () => $('#import-file')?.click() },
      { label: 'Show stats', icon: '📊', run: () => showStats() },
      { label: 'Keyboard shortcuts', icon: '?', run: () => showShortcuts() },
    ].filter((a) => !ql || a.label.toLowerCase().includes(ql));
    const groups = [];
    if (topics.length) groups.push({ name: 'Topics', items: topics.map((t) => ({ label: t.title, sub: t.category, icon: '○', run: () => { go('library'); setTimeout(() => { location.hash = '#/topic/' + encodeURIComponent(t.id); }, 100); } })) });
    if (actions.length) groups.push({ name: 'Actions', items: actions });
    const flat = groups.flatMap((g) => g.items);
    activeIdx = Math.min(activeIdx, flat.length - 1);
    if (activeIdx < 0) activeIdx = 0;
    $('#palette-results').innerHTML = groups.map((g) => `<div class="group">${esc(g.name)}</div>` + g.items.map((it, i) => {
      const gi = flat.indexOf(it);
      return `<div class="item ${gi === activeIdx ? 'active' : ''}" data-idx="${gi}"><span class="ico">${it.icon}</span><span>${esc(it.label)}</span><span class="sub">${esc(it.sub || '')}</span></div>`;
    }).join('')).join('') || '<div class="hint" style="padding:16px">No results.</div>';
    $$('#palette-results .item').forEach((el) => {
      el.onclick = () => { const it = flat[+el.dataset.idx]; if (it) { close(); it.run(); } };
    });
  }
  renderResults('');
  input.oninput = () => { activeIdx = 0; renderResults(input.value); };
  input.onkeydown = (e) => {
    const items = $$('#palette-results .item');
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, items.length - 1); renderResults(input.value); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); renderResults(input.value); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[activeIdx]; if (it) it.click(); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  trapFocus(wrap);
}

/* ---------- global keys ---------- */
let gPrefixTimer = null;
document.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  const typing = /INPUT|TEXTAREA/.test(tag || '');
  if (e.key === 'Escape') {
    if (state.cmdOpen) { $('#modal-root').innerHTML = ''; state.cmdOpen = false; return; }
    if ($('#modal-root').innerHTML.trim()) { $('#modal-root').innerHTML = ''; return; }
    if (state.moreOpen) { closeMore(); return; }
    const p = $('#reading-settings'); if (p) p.style.display = 'none';
    return;
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (!state.cmdOpen) openPalette(); return; }
  if (e.key === '?' && !typing) { e.preventDefault(); showShortcuts(); return; }
  if (e.key === 'n' && !typing) { e.preventDefault(); go('home'); setTimeout(() => $('#cap-input')?.focus(), 200); return; }
  if (e.key === '/' && !typing) {
    e.preventDefault();
    const i = state.route === 'library' ? ($('#f-q') || $('#cap-input')) : ($('#cap-input') || $('#f-q'));
    if (i) { i.focus(); i.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else { go('home'); setTimeout(() => $('#cap-input')?.focus(), 200); }
    return;
  }
  if (!typing && (e.key === 'g')) {
    // wait for next key
    if (gPrefixTimer) clearTimeout(gPrefixTimer);
    gPrefixTimer = setTimeout(() => { gPrefixTimer = null; }, 800);
    const handler = (ev) => {
      document.removeEventListener('keydown', handler);
      if (gPrefixTimer) { clearTimeout(gPrefixTimer); gPrefixTimer = null; }
      if (ev.key === 'h') go('home');
      else if (ev.key === 'l') go('library');
      else if (ev.key === 'd') go('discover');
    };
    document.addEventListener('keydown', handler, { once: true });
    return;
  }
  // library shortcuts
  if (state.route === 'library' && !typing) {
    if (e.key === 'j' || e.key === 'k') {
      e.preventDefault();
      const cards = $$('#list-host .card');
      if (!cards.length) return;
      state.selectedCard = Math.max(0, Math.min(cards.length - 1, state.selectedCard + (e.key === 'j' ? 1 : -1)));
      cards[state.selectedCard]?.scrollIntoView({ block: 'nearest' });
      cards.forEach((c, i) => c.style.outline = i === state.selectedCard ? '2px solid var(--accent)' : '');
    } else if (e.key === 'Enter') {
      const cards = $$('#list-host .card');
      const c = cards[state.selectedCard];
      if (c) location.hash = '#/topic/' + encodeURIComponent(c.dataset.open);
    } else if (e.key === 'v') {
      state.filter.view = state.filter.view === 'grid' ? 'list' : 'grid';
      prefs.view = state.filter.view; savePrefs(); render();
    }
  }
  // reading shortcuts
  if (state.route === 'topic' && !typing && e.key === 'r') {
    const b = $('#story-hide') || $('#story-btn');
    if (b) { e.preventDefault(); b.click(); }
    return;
  }
  if (state.route === 'topic' && state.storyOpen.has(state.topicId) && !typing) {
    if (e.key === 'f') { document.body.classList.toggle('focus-mode'); }
    else if (e.key === 's') { const p = $('#reading-settings'); if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none'; }
    else if (e.key === '[' || e.key === ']') {
      const secs = [...document.querySelectorAll('#story-panel [data-sec]')];
      if (!secs.length) return;
      // find the section currently most in view
      let idx = 0;
      const tops = secs.map((s) => {
        const el = document.getElementById('rd-sec-' + s.dataset.sec);
        return el ? el.getBoundingClientRect().top : 9999;
      });
      // current = last section whose top <= 120
      for (let i = 0; i < tops.length; i++) { if (tops[i] <= 120) idx = i; else break; }
      const next = e.key === ']' ? Math.min(idx + 1, secs.length - 1) : Math.max(idx - 1, 0);
      const el = document.getElementById('rd-sec-' + secs[next].dataset.sec);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (e.key === 't') { $('#rd-body')?.scrollIntoView({ block: 'start' }); }
  }
});

/* ---------- boot ---------- */
async function boot() {
  // handle share link on initial load
  const h0 = location.hash || '#/';
  if (h0.startsWith('#/share/')) {
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(h0.slice('#/share/'.length)))));
      const t = backupTopic(payload);
      if (t) {
        const dup = state.guest.find((x) => sameTopic(x, t));
        if (!dup) { state.guest.unshift(t); saveGuest(); }
        location.hash = '#/topic/' + encodeURIComponent(t.id);
        toast('Saved to your library.');
      }
    } catch {}
  }
  applyTheme();
  window.addEventListener('hashchange', render);
  document.addEventListener('click', (e) => {
    const m = $('#more-menu');
    if (m && m.style.display !== 'none' && !m.contains(e.target) && e.target.id !== 'more-btn' && !e.target.closest('#more-btn')) {
      closeMore();
    }
  });
  // share route handling lives in the hashchange listener below
  render();
  state.authChecked = true;
  await refreshDiscover();
  render();
  // service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  // first-run onboarding check
}
document.addEventListener('DOMContentLoaded', boot);

// share link handling on hashchange
window.addEventListener('hashchange', () => {
  const h = location.hash || '#/';
  if (h.startsWith('#/share/')) {
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(h.slice('#/share/'.length)))));
      const t = backupTopic(payload);
      if (t) {
        const dup = state.guest.find((x) => sameTopic(x, t));
        if (!dup) { state.guest.unshift(t); saveGuest(); }
        location.hash = '#/topic/' + encodeURIComponent(t.id);
        toast('Saved to your library.');
      }
    } catch {}
  }
}, { capture: true });
