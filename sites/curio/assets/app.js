/* Curio — personal curiosity library SPA (UX pass 2: decluttered, progressive disclosure) */
const $ = (s, r = document) => r.querySelector(s);
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
const readMins = (t) => {
  const story = state.stories[storyKey(t)];
  const words = story
    ? story.words
    : (String(t?.overview || '') + ' ' + (t?.keyFacts || []).join(' ')).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
};

const PREFS_KEY = 'curio_prefs_v1';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}
const prefs = Object.assign({ view: 'grid', sort: 'newest', summaryMode: 'full' }, loadPrefs());
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ view: prefs.view, sort: prefs.sort, summaryMode: prefs.summaryMode })); } catch {} }

const state = {
  user: null, authChecked: false,
  route: 'home', topicId: null,
  topics: [], categories: [],
  guest: loadGuest(),
  filter: { q: '', status: 'all', category: 'All', sort: prefs.sort, view: prefs.view, showArchived: false },
  discover: null, discoverEmpty: false, rediscover: [],
  capturing: false,
  stories: {}, storyOpen: new Set(),
};
function loadGuest() {
  try { return JSON.parse(localStorage.getItem('curio_guest_v1') || '[]'); } catch { return []; }
}
function saveGuest() { localStorage.setItem('curio_guest_v1', JSON.stringify(state.guest)); }

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

/* ---------- library source (server or guest) ---------- */
function allTopics() {
  return state.user ? state.topics : state.guest;
}
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

/* ---------- research (runs in the browser, no server) ---------- */
const WIKI = 'https://en.wikipedia.org';
function stripTags(html) {
  const d = document.createElement('div');
  d.innerHTML = String(html || '');
  return (d.textContent || '').replace(/\s+/g, ' ').trim();
}
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
function articleURL(lang, title) {
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/ /g, '_'))}`;
}
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
    } catch { /* keep the raw text */ }
  }
  const cleaned = q.replace(/\?+$/, '')
    .replace(/^(why|how|what|when|where|who|which)\s+(is|are|was|were|did|does|do|can|could|would|should|has|have)?\s*/i, '')
    .replace(/^the\s+/i, '')
    .trim();
  return cleaned || String(input).trim();
}
async function wikiSearchPages(q, limit = 6) {
  const d = await getJSON(`${WIKI}/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=${limit}`);
  return (d && d.pages ? d.pages : []).map((p) => ({
    title: p.title,
    description: stripTags(p.description || ''),
    excerpt: stripTags(p.excerpt || ''),
    url: articleURL('en', p.title),
  }));
}
async function wikiSummary(lang, title) {
  const d = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(title).replace(/ /g, '_'))}`);
  if (!d || !d.extract || d.type === 'disambiguation') return null;
  return {
    title: d.title,
    overview: d.extract,
    description: d.description || '',
    url: (d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page) || articleURL(lang, d.title),
  };
}
async function wikiIntro(title) {
  const d = await getJSON(`${WIKI}/w/api.php?action=query&format=json&origin=*&prop=extracts&exintro=1&explaintext=1&redirects=1&titles=${encodeURIComponent(title)}`);
  const pages = d && d.query && d.query.pages ? Object.values(d.query.pages) : [];
  return pages[0] && pages[0].extract ? pages[0].extract.trim() : '';
}
function sentences(text) {
  return (String(text || '').replace(/\s+/g, ' ').match(/[^.!?]+[.!?]+/g) || []).map((s) => s.trim()).filter((s) => s.length > 40);
}

/* ---------- the whole story: full article, timeline, threads ---------- */
const STORY_SKIP_SECTION = /^(see also|references|external links|further reading|notes|citations|bibliography|sources|footnotes|works cited|general references|explanatory notes|gallery)$/i;
function splitSections(text) {
  const out = [];
  let cur = { heading: 'The lead', level: 2, blocks: [] };
  let skip = false;
  for (const raw of String(text || '').replace(/\u00a0/g, ' ').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const h = line.match(/^(={2,6})\s*(.+?)\s*\1$/);
    if (h) {
      const level = h[1].length;
      if (level === 2) {
        if (cur.blocks.length) out.push(cur);
        skip = STORY_SKIP_SECTION.test(h[2]);
        cur = { heading: h[2], level, blocks: [] };
      } else if (!skip) {
        cur.blocks.push({ t: 'h', text: h[2] });
      }
      continue;
    }
    if (!skip) cur.blocks.push({ t: 'p', text: line });
  }
  if (cur.blocks.length) out.push(cur);
  return out;
}
function storyTimeline(sections) {
  const seen = new Set();
  const rows = [];
  for (const s of sections) for (const b of s.blocks) {
    if (b.t !== 'p') continue;
    for (const raw of sentences(b.text)) {
      if (/retrieved|archived from the original|doi:|isbn|issn/i.test(raw)) continue;
      // the opening "Name (1943–2025) was a…" definition line is already the overview
      if (/^[A-Z][^()]{2,90}\([^)]*\b(?:1[5-9]\d{2}|20\d{2})\b[^)]*\)\s*(?:was|is|were)\b/.test(raw)) continue;
      const m = raw.match(/\b(1[5-9]\d{2}|20\d{2})\b/);
      if (!m) continue;
      const clipped = raw.replace(/^["'”“)\]]+\s*/, '');
      const text = clipped.length > 320 ? clipped.slice(0, 320).trim() + '…' : clipped;
      const key = text.slice(0, 70).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ year: Number(m[1]), text });
    }
  }
  rows.sort((a, b) => a.year - b.year);
  return rows.slice(0, 18);
}
function wikitextThreads(wt, title) {
  const body = String(wt || '')
    .replace(/<ref[^>]*\/>/g, ' ')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, ' ')
    .replace(/\{\{[\s\S]*?\}\}/g, ' ');
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
  return [...counts.entries()]
    .filter(([name, n]) => n >= 2 && name.toLowerCase() !== self && !PUBLISHERS.test(name))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, n]) => ({ title: name, reason: `Comes up ${n} times in the article` }));
}
const CATEGORY_NOISE = /^(articles|short description|use .*english|use mdy|use dmy|all wikipedia|pages using|webarchive|cs1 |good articles|featured articles|comics infobox|template)/i;
function cleanCategory(c) {
  return String(c || '').replace(/_/g, ' ').replace(/\s*\(.*?\)\s*$/, '').trim();
}
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
  try {
    [full, parsed] = await Promise.all([getJSON(fullURL, 20000), getJSON(parseURL, 20000).catch(() => null)]);
  } catch {
    throw new Error('Couldn’t reach Wikipedia for the full article. Check your connection and try again.');
  }
  const page = full && full.query && full.query.pages ? Object.values(full.query.pages)[0] : null;
  if (!page || !page.extract) throw new Error('Wikipedia has no full article text for that page yet.');
  const all = splitSections(page.extract);
  const timeline = storyTimeline(all);
  const p = parsed && parsed.parse;
  const words = page.extract.split(/\s+/).filter(Boolean).length;
  return {
    title: page.title,
    url: articleURL('en', page.title),
    sections: all.filter((s) => s.heading !== 'The lead'),
    lead: all.find((s) => s.heading === 'The lead') || null,
    timeline,
    threads: p ? wikitextThreads(p.wikitext && p.wikitext['*'], page.title) : [],
    categories: p && p.categories ? [...new Set(p.categories.map((c) => cleanCategory(c['*'])).filter((c) => c && !CATEGORY_NOISE.test(c)))].slice(0, 12) : [],
    elsewhere: p ? dedupeLinks(p.externallinks) : [],
    words,
  };
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
function guessCategory(text) {
  for (const [name, rx] of CATEGORY_RULES) if (rx.test(text)) return name;
  return 'Curiosity';
}
async function localResearch(input) {
  const kind = inputKind(input);
  const q = searchQuery(input);
  let pages = [];
  try {
    pages = await wikiSearchPages(q);
    if (!pages.length && q !== input) pages = await wikiSearchPages(input);
  } catch {
    throw new Error('Couldn’t reach Wikipedia. Check your connection and try again.');
  }
  if (!pages.length) throw new Error('No Wikipedia article matched that. Try rewording it.');
  const best = pages[0];
  const [summary, simple, intro] = await Promise.all([
    wikiSummary('en', best.title).catch(() => null),
    wikiSummary('simple', best.title).catch(() => null),
    wikiIntro(best.title).catch(() => ''),
  ]);
  const overview = (summary && summary.overview) || intro || best.excerpt || best.description;
  if (!overview) throw new Error('Wikipedia has no summary for that page yet. Try another wording.');
  const flat = overview.replace(/\s+/g, ' ');
  const keyFacts = sentences(intro).filter((s) => !flat.includes(s.slice(0, 50))).slice(0, 4);
  if (!keyFacts.length && best.excerpt) keyFacts.push(best.excerpt);
  const sources = [];
  if (summary) sources.push({ title: summary.title + ' — Wikipedia', url: summary.url, publisher: 'Wikipedia', snippet: (summary.description || best.excerpt || '').slice(0, 220) });
  if (kind === 'link') {
    let host = 'link';
    try { host = new URL(input).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    sources.push({ title: 'The link you saved', url: input, publisher: host, snippet: 'Your original link' });
  }
  pages.slice(1, 5).forEach((p) => sources.push({ title: p.title, url: p.url, publisher: 'Wikipedia', snippet: (p.description || p.excerpt || '').slice(0, 220) }));
  return {
    title: (summary && summary.title) || best.title,
    inputType: kind,
    category: guessCategory([overview, best.description, q].join(' ')),
    overview,
    keyFacts,
    wiki: summary ? { title: summary.title, url: summary.url } : { title: best.title, url: best.url },
    simple: simple ? { overview: simple.overview, url: simple.url } : null,
    sources,
    related: pages.slice(1, 4).map((p) => ({ title: p.title, reason: p.description || 'A nearby article worth a look.' })),
    aiPowered: false,
  };
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
      state.topics.unshift(d.topic);
      await refreshDiscover();
      location.hash = '#/topic/' + d.topic.id;
    } else {
      setStatusText('Researching…');
      const r = await localResearch(input);
      const now = Date.now();
      const topic = {
        id: 'g_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
        title: r.title, input, inputType: r.inputType, category: r.category, status: 'exploring',
        overview: r.overview, keyFacts: r.keyFacts, wikiUrl: r.wiki?.url || null, wikiTitle: r.wiki?.title || null,
        sources: r.sources, related: r.related, simple: r.simple || null, notes: '', aiPowered: r.aiPowered, archived: false,
        createdAt: now, updatedAt: now,
      };
      state.guest.unshift(topic); saveGuest();
      await refreshDiscover();
      location.hash = '#/topic/' + topic.id;
    }
  } catch (e) {
    setStatusText(e.message);
    toast(e.message);
  } finally {
    state.capturing = false;
    updateCaptureUI(false);
  }
}
function setStatusText(msg) {
  const el = $('#cap-status');
  if (el) el.textContent = msg;
}
function setStatusHTML(html) {
  const el = $('#cap-status');
  if (el) el.innerHTML = html;
}
function updateCaptureUI(busy) {
  const btn = $('#cap-btn');
  if (btn) { btn.disabled = busy; btn.innerHTML = busy ? '<span class="spin"></span> Researching…' : 'Explore ✦'; }
  const input = $('#cap-input');
  if (input) input.disabled = busy;
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
    const d = await api('/api/topics/' + id, { method: 'DELETE' }).catch(() => null);
    if (d && d._unauth) { state.user = null; render(); return; }
    state.topics = state.topics.filter((x) => x.id !== id);
  } else {
    state.guest = state.guest.filter((x) => x.id !== id);
    saveGuest();
  }
  await refreshDiscover();
  location.hash = '#/library';
  toast('Deleted.');
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
  { id: 'inbox', label: 'Inbox', icon: '◍' },
  { id: 'library', label: 'My Library', icon: '▤' },
  { id: 'exploring', label: 'Exploring', icon: '◐' },
  { id: 'completed', label: 'Completed', icon: '✓' },
  { id: 'discover', label: 'Feed Your Curiosity', icon: '✧' },
];
function counts() {
  const ts = allTopics().filter((t) => !t.archived);
  return {
    inbox: ts.filter((t) => t.status === 'unread').length,
    library: ts.length,
    exploring: ts.filter((t) => t.status === 'exploring').length,
    completed: ts.filter((t) => t.status === 'completed').length,
  };
}
function parseRoute() {
  const h = location.hash || '#/';
  const parts = h.replace(/^#\//, '').split('/');
  if (parts[0] === 'topic' && parts[1]) { state.route = 'topic'; state.topicId = decodeURIComponent(parts[1]); }
  else { state.route = parts[0] || 'home'; state.topicId = null; }
  if (!['home', 'inbox', 'library', 'exploring', 'completed', 'discover', 'topic'].includes(state.route)) state.route = 'home';
}
function go(id) { location.hash = '#/' + (id === 'home' ? '' : id); }

/* ---------- render shell ---------- */
function renderSide() {
  const c = counts();
  const badge = (n) => (n ? `<span class="count">${n}</span>` : '');
  const active = (id) => (state.route === id || (state.route === 'topic' && id === 'library') ? 'active' : '');
  $('#side').innerHTML = `
    <div class="brand"><div class="brand-mark">C</div><div><div class="brand-name">Curio</div><div class="brand-tag">Never lose a thought</div></div></div>
    <button class="nav-item ${state.route === 'home' ? 'active' : ''}" data-nav="home" ${state.route === 'home' ? 'aria-current="page"' : ''}><span class="ico">✦</span>Capture</button>
    <div class="nav-label">Library</div>
    ${NAV.slice(1, 5).map((n) => `<button class="nav-item ${active(n.id)}" data-nav="${n.id}"><span class="ico">${n.icon}</span>${n.label}${badge(c[n.id])}</button>`).join('')}
    <div class="nav-label">Discovery</div>
    <button class="nav-item ${active('discover')}" data-nav="discover"><span class="ico">✧</span>Feed Your Curiosity</button>
    <div class="side-foot">
      <div class="hint">Your library lives in this browser. Use Export in My Library to keep a backup.</div>
    </div>`;
  $('#side').querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  const bn = $('#bottomnav');
  const items = [NAV[0], NAV[2], NAV[3], NAV[5]];
  bn.innerHTML = items.map((n) => `<button class="${active(n.id) ? 'active' : ''}" data-nav="${n.id}" aria-label="${esc(n.label)}"><span class="bi">${n.icon}</span>${n.label.split(' ')[0] === 'Feed' ? 'Discover' : n.label.split(' ')[0] === 'My' ? 'Library' : n.label}</button>`).join('') +
    '';
  bn.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
}

/* ---------- cards & lists ---------- */
function cardHTML(t) {
  const mins = readMins(t);
  const srcs = (t.sources || []).length;
  return `<article class="card" data-open="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
    <div class="card-actions">
      ${t.status !== 'completed' ? `<button class="icon-btn" data-done="${esc(t.id)}" title="Mark completed">✓</button>` : ''}
      <button class="icon-btn" data-archive="${esc(t.id)}" title="${t.archived ? 'Unarchive' : 'Archive'}">▢</button>
      <button class="icon-btn" data-del="${esc(t.id)}" title="Delete">×</button>
    </div>
    <div class="cat">${esc(t.category)} · ${mins} min</div>
    <h3>${esc(t.title)}</h3>
    <p class="desc">${esc(t.overview || '')}</p>
    <div class="card-meta"><span class="pill ${esc(t.status)}">${esc(t.status)}</span><span>${timeAgo(t.createdAt)}</span>${srcs ? `<span>· ${srcs} sources</span>` : ''}</div>
  </article>`;
}
function filteredTopics(base) {
  const f = state.filter;
  let list = f.showArchived ? [...base] : base.filter((t) => !t.archived);
  if (state.route === 'inbox') list = list.filter((t) => t.status === 'unread');
  if (state.route === 'exploring') list = list.filter((t) => t.status === 'exploring');
  if (state.route === 'completed') list = list.filter((t) => t.status === 'completed');
  if (!f.showArchived) list = list.filter((t) => !t.archived);
  if (state.route === 'library' && f.status !== 'all') list = list.filter((t) => t.status === f.status);
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter((t) => (t.title + ' ' + t.overview + ' ' + t.category + ' ' + (t.input || '')).toLowerCase().includes(q)); }
  if (f.category !== 'All') list = list.filter((t) => t.category === f.category);
  if (f.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (f.sort === 'oldest') list = [...list].sort((a, b) => a.createdAt - b.createdAt);
  else list = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return list;
}
function toolbarHTML(showStatus) {
  const cats = ['All', ...new Set(allTopics().map((t) => t.category).filter(Boolean))];
  const total = filteredTopics(allTopics()).length;
  return `<div class="toolbar">
    <label class="search"><span>⌕</span><input id="f-q" placeholder="Search library…  ( / )" value="${esc(state.filter.q)}" aria-label="Search library"></label>
    ${showStatus ? `<div class="seg" id="f-status" role="tablist" aria-label="Status filter">
      ${['all', 'unread', 'exploring', 'completed'].map((s) => `<button data-s="${s}" class="${state.filter.status === s ? 'active' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>` : ''}
    <select id="f-cat" aria-label="Category">${cats.map((c) => `<option ${state.filter.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="f-sort" aria-label="Sort">
      <option value="newest" ${state.filter.sort === 'newest' ? 'selected' : ''}>Newest</option>
      <option value="oldest" ${state.filter.sort === 'oldest' ? 'selected' : ''}>Oldest</option>
      <option value="title" ${state.filter.sort === 'title' ? 'selected' : ''}>Title A–Z</option>
    </select>
    <div class="seg" id="f-view" aria-label="View"><button data-v="grid" class="${state.filter.view === 'grid' ? 'active' : ''}">Grid</button><button data-v="list" class="${state.filter.view === 'list' ? 'active' : ''}">List</button></div>
    <button class="chip ${state.filter.showArchived ? 'on' : ''}" id="f-arch" title="Show archived">${state.filter.showArchived ? 'Archived ✓' : 'Archived'}</button>
  </div>
  <div class="result-count">${total} ${total === 1 ? 'topic' : 'topics'}${state.filter.showArchived ? ' · including archived' : ''}</div>`;
}
function bindToolbar() {
  const q = $('#f-q');
  if (q) q.oninput = (e) => { state.filter.q = e.target.value; renderList(); };
  const st = $('#f-status');
  if (st) st.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.status = b.dataset.s; render(); }));
  const cat = $('#f-cat');
  if (cat) cat.onchange = (e) => { state.filter.category = e.target.value; renderList(); };
  const sort = $('#f-sort');
  if (sort) sort.onchange = (e) => { state.filter.sort = e.target.value; prefs.sort = e.target.value; savePrefs(); renderList(); };
  const vw = $('#f-view');
  if (vw) vw.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.view = b.dataset.v; prefs.view = b.dataset.v; savePrefs(); render(); }));
  const arch = $('#f-arch');
  if (arch) arch.onclick = () => { state.filter.showArchived = !state.filter.showArchived; render(); };
}
function bindCards(root) {
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-del]') || e.target.closest('[data-archive]') || e.target.closest('[data-done]')) return;
      location.hash = '#/topic/' + encodeURIComponent(el.dataset.open);
    };
    el.onkeydown = (e) => { if (e.key === 'Enter') location.hash = '#/topic/' + encodeURIComponent(el.dataset.open); };
  });
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); deleteTopic(b.dataset.del); }));
  root.querySelectorAll('[data-archive]').forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    const t = findTopic(b.dataset.archive);
    await patchTopic(b.dataset.archive, { archived: !t?.archived }, { silent: true });
    toast(t?.archived ? 'Unarchived.' : 'Archived.');
    render();
  }));
  root.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async (e) => {
    e.stopPropagation();
    await patchTopic(b.dataset.done, { status: 'completed' }, { silent: true });
    toast('Marked completed.');
    render();
  }));
}
function emptyHTML(msg, cta) {
  return `<div class="empty"><div class="big">○</div><p>${esc(msg)}</p>${cta || ''}</div>`;
}
function renderList(limit) {
  const host = $('#list-host');
  if (!host) return;
  let list = filteredTopics(allTopics());
  if (state.route === 'library' && state.filter.status !== 'all') list = list.filter((t) => t.status === state.filter.status);
  if (typeof limit === 'number') list = list.slice(0, limit);
  host.className = 'grid' + (state.filter.view === 'list' ? ' list' : '');
  host.innerHTML = list.length ? list.map(cardHTML).join('') : emptyHTML(
    state.filter.q ? 'No matches. Try a different search.' : 'Nothing here yet.',
    state.route === 'home' ? '' : `<br><button class="btn small" onclick="location.hash='#/'">Capture your first curiosity</button>`
  );
  bindCards(host);
}

/* ---------- views ---------- */
function continueReading() {
  return allTopics()
    .filter((t) => t.lastOpenedAt && !t.archived && t.status !== 'completed')
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    .slice(0, 3);
}
function homeHTML() {
  const red = state.rediscover;
  const cont = continueReading();
  const total = allTopics().filter((t) => !t.archived).length;
  return `<section class="hero compact">
    <h1>What's on <em>your mind?</em></h1>
    <p>Capture it — research builds itself. <span class="kbd-hint">press <kbd>/</kbd></span></p>
  </section>
  <div class="capture">
    <textarea id="cap-input" rows="2" placeholder="A topic, a question, a half-formed thought, a link…"></textarea>
    <div class="capture-row"><span class="hint" id="cap-mode">${state.user ? 'Auto-saves to your library' : 'Guest mode — saves on this device'}</span><span class="spacer"></span><button class="btn primary" id="cap-btn">Explore ✦</button></div>
  </div>
  <div class="examples">${EXAMPLES.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  <div class="status-line" id="cap-status" role="status"></div>
  ${cont.length ? `<section class="section tight"><div class="section-head"><h2>Pick up where you left off</h2><p>${cont.length === 1 ? 'one story in progress' : cont.length + ' stories in progress'}</p></div>
    <div class="strip">${cont.map((t) => `<article class="strip-card" data-open="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}"><div class="cat">Last read ${esc(timeAgo(t.lastOpenedAt))} · ${readMins(t)} min read</div><h3>${esc(t.title)}</h3><div class="card-meta"><span class="pill ${esc(t.status)}">${esc(t.status)}</span>${(t.notes || '').trim() ? '<span>· has notes</span>' : ''}</div></article>`).join('')}</div></section>` : ''}
  ${red.length ? `<section class="section tight"><div class="section-head"><h2>Gently resurfacing</h2><p>no pressure — just wonder</p></div>
    <div class="strip">${red.map(({ topic, prompt }) => `<article class="strip-card" data-open="${esc(topic.id)}" tabindex="0"><div class="cat">${esc(prompt)}</div><h3>${esc(topic.title)}</h3><div class="card-meta"><span class="pill ${esc(topic.status)}">${esc(topic.status)}</span><span>${timeAgo(topic.createdAt)}</span></div></article>`).join('')}</div></section>` : ''}
  <section class="section tight"><div class="section-head"><h2>Recent curiosities</h2><p>${total} saved</p><span class="spacer"></span><button class="link" data-nav="library">View all →</button></div>
    <div class="grid" id="list-host"></div></section>`;
}

function libraryHTML(title, sub, showStatus) {
  const archivedCount = allTopics().filter((t) => t.archived).length;
  return `<section class="page-head"><div class="section-head"><h2>${esc(title)}</h2><p>${esc(sub)}${archivedCount && !state.filter.showArchived ? ` · ${archivedCount} archived` : ''}</p><span class="spacer"></span>
    <button class="btn small ghost" id="export-btn" title="Download your library as JSON">Export</button></div>
  ${toolbarHTML(showStatus)}<div class="grid" id="list-host"></div></section>
  <section class="section tight"><div class="section-head"><h2>Capture another</h2></div>
  <div class="capture slim"><textarea id="cap-input" rows="2" placeholder="What are you curious about now?"></textarea>
  <div class="capture-row"><span class="hint">Auto-saves${state.user ? '' : ' on this device'}</span><span class="spacer"></span><button class="btn primary" id="cap-btn">Explore ✦</button></div></div>
  <div class="status-line" id="cap-status" role="status"></div></section>`;
}

function discoverHTML() {
  const d = state.discover;
  if (!d) return `<section class="section"><div class="section-head"><h2>Feed Your Curiosity</h2></div><div class="skel"></div><div class="skel"></div></section>`;
  const col = (title, items) => `<div class="disc-col"><h4>${esc(title)}</h4>${items.map((r) => `<button class="rec" data-query="${esc(r.query || r.title)}"><h5>${esc(r.title)}</h5><p class="why">${esc(r.reason || '')}</p></button>`).join('') || '<p class="hint">Save a few topics to unlock this.</p>'}</div>`;
  const all = [...(d.related || []), ...(d.unexpected || []), ...(d.newCuriosities || [])];
  const surprise = all.length ? all[Math.floor(Math.random() * all.length)] : null;
  return `<section class="page-head"><div class="section-head"><h2>Feed Your Curiosity</h2><p>${state.discoverEmpty ? 'starter picks — save topics to personalize' : 'based on your library · no key needed'}</p><span class="spacer"></span>
    ${surprise ? `<button class="btn small primary" id="surprise-btn" data-query="${esc(surprise.query || surprise.title)}">Surprise me ✦</button>` : ''}</div>
  <div class="disc-grid">${col('Go deeper', d.related)}${col('Unexpected connections', d.unexpected)}${col('Try something new', d.newCuriosities)}</div></section>`;
}

function stepsHTML(t) {
  const order = ['unread', 'exploring', 'completed'];
  const idx = order.indexOf(t.status);
  return `<div class="steps" role="group" aria-label="Progress">${order.map((s, i) => `<button class="step ${i <= idx ? 'done' : ''} ${t.status === s ? 'now' : ''}" data-status="${s}"><span class="dot">${i < idx ? '✓' : (i + 1)}</span>${s}</button>${i < 2 ? '<span class="bar"></span>' : ''}`).join('')}</div>`;
}

function storyKey(t) { return t.wikiTitle || t.title; }
function storyPanelHTML(t) {
  const story = state.stories[storyKey(t)];
  if (story && state.storyOpen.has(t.id)) return `<section class="reader" id="story-panel" aria-label="The whole story">${storyBodyHTML(t)}</section>`;
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
  const elsewhere = story.elsewhere.length ? `<div class="story-block"><h4>Reported elsewhere</h4><p class="hint" style="margin-bottom:8px">The sources the article itself cites — go to the primary reporting.</p>${story.elsewhere.map((s, i) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="src-n">${i + 1}</span><span class="src-body"><span class="src-p">${esc(s.publisher)}</span><span class="src-t">${esc(s.title)}</span></span><span class="src-go">↗</span></a>`).join('')}</div>` : '';
  const q = encodeURIComponent(story.title);
  const dig = `<div class="story-block"><h4>Keep digging</h4><div class="rel-grid">
    <a class="rel" href="https://duckduckgo.com/?q=${q}" target="_blank" rel="noopener"><span>Search the wider web<small>News, interviews, forums — anything newer than the article</small></span><span>↗</span></a>
    <a class="rel" href="https://news.google.com/search?q=${q}" target="_blank" rel="noopener"><span>Search the news<small>Latest coverage and follow-ups</small></span><span>↗</span></a>
    <a class="rel" href="https://en.wikipedia.org/w/index.php?title=Special:WhatLinksHere&target=${q}" target="_blank" rel="noopener"><span>What links here<small>Every article that mentions this one — the wider web of the story</small></span><span>↗</span></a>
  </div></div>`;
  return `<div class="rd-stage"><div class="rd-top">
      <div class="rd-meta"><strong id="rd-left">${Math.max(1, Math.round(story.words / 200))} min read</strong><span class="rd-dot rd-extra">·</span><span class="rd-extra">${story.words.toLocaleString()} words</span><span class="rd-dot rd-extra">·</span><span class="rd-extra">${article.length} sections</span></div>
      <span class="spacer"></span><button class="btn small ghost" id="story-start">Start reading</button><button class="btn small ghost" id="story-refresh">Refresh</button><button class="btn small ghost" id="story-hide">Close</button>
      <div class="rd-progress"><i id="rd-bar"></i></div>
    </div>
    <div class="rd-grid">
      <div class="rd-main">
        <nav class="rd-toc" aria-label="In this story"><div class="rd-toc-head"><h4>In this story</h4><span class="hint">tap a section to jump</span></div><div class="rd-toc-list">${toc}</div></nav>
        <article class="rd-body" id="rd-body">${body}</article>
      </div>
      <aside class="rd-rail">${tl}${cats}</aside>
    </div></div>
    <div class="rd-after">${threads}${elsewhere}${dig}</div>
    <p class="hint" style="margin-top:22px">All of this comes from the Wikipedia article <a href="${esc(story.url)}" target="_blank" rel="noopener">${esc(story.title)} ↗</a>.</p>`;
}
function detachProgress() {
  if (state._progress) { state._progress(); state._progress = null; }
}
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
  };
  const onScroll = () => { if (!raf) raf = requestAnimationFrame(paint); };
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
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
  const panel = $('#story-panel');
  if (panel) {
    panel.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
    panel.querySelectorAll('[data-sec]').forEach((b) => (b.onclick = () => {
      panel.querySelectorAll('[data-sec]').forEach((x) => x.classList.toggle('on', x === b));
      document.getElementById('rd-sec-' + b.dataset.sec)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
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
    return `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="src-n">${i + 1}</span><span class="src-body"><span class="src-p">${esc(s.publisher || host)}</span><span class="src-t">${esc(s.title)}</span>${s.snippet ? `<span class="src-s">${esc(s.snippet)}</span>` : ''}</span><span class="src-go">↗</span></a>`;
  }).join('');
  const hasSimple = Boolean(t.simple?.overview);
  const mode = hasSimple ? (prefs.summaryMode === 'simple' ? 'simple' : 'full') : 'full';
  const overviewText = mode === 'simple' && hasSimple ? t.simple.overview : (t.overview || 'No overview yet.');
  const words = (t.notes || '').trim() ? (t.notes || '').trim().split(/\s+/).length : 0;
  const storyReady = Boolean(state.storyOpen.has(t.id) && state.stories[storyKey(t)]);
  return `<button class="back" id="back-btn">← Back</button>
  <div class="topic-hero">
    <div class="topic-top"><div class="cat">${esc(t.category)} · ${esc(t.inputType || 'topic')} · ${readMins(t)} min read</div>
    ${t.archived ? '<span class="pill">archived</span>' : ''}</div>
    <h1>${esc(t.title)}</h1>
    <div class="date">Saved ${fmtDate(t.createdAt)} · updated ${timeAgo(t.updatedAt || t.createdAt)}</div>
    <div class="topic-links"><span class="badge plain">○ Curio research · Wikipedia + web</span>
    ${t.wikiUrl ? `<a class="badge plain link" href="${esc(t.wikiUrl)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}
    ${hasSimple && t.simple.url ? `<a class="badge plain link" href="${esc(t.simple.url)}" target="_blank" rel="noopener">Simple Wikipedia ↗</a>` : ''}</div>
    ${stepsHTML(t)}
    <div class="status-row" id="status-row">
      <button class="btn small ghost" id="copy-btn">Copy summary</button>
      <button class="btn small ghost" id="edit-btn">Rename</button>
      <button class="btn small ghost" id="arch-btn">${t.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn small ghost danger" id="del-btn">Delete</button>
    </div>
  </div>
  ${storyReady ? storyPanelHTML(t) : ''}
  <div class="topic-layout">
    <div class="prose">
      <div class="panel"><div class="panel-head"><h3>Overview</h3>
        ${hasSimple ? `<div class="seg sm" id="sum-toggle" role="tablist" aria-label="Summary style"><button data-m="full" class="${mode === 'full' ? 'active' : ''}">Full</button><button data-m="simple" class="${mode === 'simple' ? 'active' : ''}">Plain English</button></div>` : ''}
      </div><p>${esc(overviewText)}</p>
        ${hasSimple && mode === 'simple' ? `<p class="hint" style="margin-top:10px">Plain-language version from Simple English Wikipedia. <a href="${esc(t.simple.url || '#')}" target="_blank" rel="noopener">Read there ↗</a></p>` : ''}
        ${t.disputed ? `<details class="note"><summary>Established vs debated</summary><p>${esc(t.disputed)}</p></details>` : ''}</div>
      ${storyReady ? '' : storyPanelHTML(t)}
      ${facts ? `<div class="panel"><h3>Key facts</h3><ul class="facts">${facts}</ul></div>` : ''}
      <div class="panel"><div class="panel-head"><h3>Sources & further reading</h3><span class="hint">${(t.sources || []).length} links</span></div>${srcs || '<p class="hint">No sources found yet.</p>'}</div>
      ${(t.related || []).length ? `<div class="panel"><h3>Rabbit holes</h3><p class="hint" style="margin-bottom:12px">Each one opens fresh research — your current notes stay put.</p><div class="rel-grid">${t.related.map((r) => `<button class="rel" data-query="${esc(r.title)}"><span>${esc(r.title)}<small>${esc(r.reason || '')}</small></span><span>→</span></button>`).join('')}</div></div>` : ''}
    </div>
    <aside class="topic-side">
      <div class="panel side-card"><h3>Your take</h3>
        <textarea class="notes-area" id="notes" placeholder="What struck you? What do you want to remember or follow up on?">${esc(t.notes || '')}</textarea>
        <div class="notes-foot"><span class="save-note" id="notes-state">Autosaves · ${words} words</span><button class="btn small ghost" id="notes-copy">Copy notes</button></div>
      </div>
      <div class="panel side-card"><h3>Details</h3>
        <dl class="meta"><dt>Status</dt><dd>${esc(t.status)}</dd><dt>Category</dt><dd>${esc(t.category)}</dd><dt>Added</dt><dd>${esc(fmtDate(t.createdAt))}</dd>${t.wikiTitle ? `<dt>Wikipedia</dt><dd>${esc(t.wikiTitle)}</dd>` : ''}</dl>
      </div>
    </aside>
  </div>`;
}

/* ---------- render ---------- */
function render() {
  parseRoute();
  detachProgress();
  renderSide();
  const main = $('#main');
  if (state.route === 'home') {
    main.innerHTML = homeHTML();
    bindCapture(); renderList(6);
    bindCards(main);
    main.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => capture(b.dataset.ex)));
    main.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  } else if (state.route === 'topic') {
    const t = findTopic(state.topicId);
    if (!t) { main.innerHTML = `<div class="empty"><div class="big">?</div><p>That topic isn't here. It may have been deleted.</p><br><button class="btn" onclick="location.hash='#/library'">Back to library</button></div>`; return; }
    markOpened(t);
    main.innerHTML = topicHTML(t);
    $('#back-btn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/library');
    $('#status-row').querySelectorAll('.step').forEach((b) => (b.onclick = () => patchTopic(t.id, { status: b.dataset.status })));
    const tog = $('#sum-toggle');
    if (tog) tog.querySelectorAll('button').forEach((b) => (b.onclick = () => { prefs.summaryMode = b.dataset.m; savePrefs(); render(); }));
    $('#del-btn').onclick = () => deleteTopic(t.id);
    $('#arch-btn').onclick = async () => { await patchTopic(t.id, { archived: !t.archived }, { silent: true }); toast(t.archived ? 'Unarchived.' : 'Archived.'); render(); };
    $('#edit-btn').onclick = () => openRename(t);
    $('#copy-btn').onclick = async () => {
      const text = `${t.title}\n\n${t.overview || ''}\n\nSources:\n${(t.sources || []).map((s) => '- ' + s.title + ' ' + s.url).join('\n')}`;
      try { await navigator.clipboard.writeText(text); toast('Summary copied.'); } catch { toast('Copy blocked by browser.'); }
    };
    const notes = $('#notes');
    let h;
    notes.oninput = () => {
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
    bindStory(t);
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
  } else if (state.route === 'discover') {
    main.innerHTML = discoverHTML();
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => capture(b.dataset.query)));
    const s = $('#surprise-btn');
    if (s) s.onclick = () => capture(s.dataset.query);
  } else {
    const meta = { inbox: ['Inbox', 'New arrivals — triage into exploring or completed'], library: ['My Library', 'Everything you have saved'], exploring: ['Exploring', 'Actively being researched'], completed: ['Completed', 'Finished — revisit anytime'] }[state.route];
    const showStatus = state.route === 'library';
    if (!showStatus) state.filter.status = 'all';
    main.innerHTML = libraryHTML(meta[0], meta[1], showStatus);
    bindToolbar(); bindCapture(); renderList();
    const ex = $('#export-btn');
    if (ex) ex.onclick = exportLibrary;
  }
}
async function patchTopicSilent(id, patch) {
  return patchTopic(id, patch, { silent: true });
}
function exportLibrary() {
  const data = JSON.stringify(allTopics().map((t) => ({ title: t.title, category: t.category, status: t.status, overview: t.overview, sources: t.sources, notes: t.notes, createdAt: new Date(t.createdAt).toISOString() })), null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'curio-library.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Library exported.');
}
function bindCapture() {
  const btn = $('#cap-btn'), input = $('#cap-input');
  if (!btn || !input) return;
  const goCap = () => capture(input.value);
  btn.onclick = goCap;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goCap(); } };
  if (window.matchMedia('(pointer:fine)').matches) input.focus();
}
function openRename(t) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal" role="dialog" aria-label="Rename topic"><h3>Rename topic</h3><p>Give it a name you'll recognize later.</p>
    <input id="rename-input" value="${esc(t.title)}" maxlength="200"><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost small" id="m-cancel">Cancel</button><button class="btn primary small" id="m-save">Save</button></div></div></div>`;
  const inp = $('#rename-input');
  inp.focus(); inp.select();
  $('#m-cancel').onclick = () => (root.innerHTML = '');
  const save = async () => { const v = inp.value.trim(); root.innerHTML = ''; if (v && v !== t.title) await patchTopic(t.id, { title: v }); };
  $('#m-save').onclick = save;
  inp.onkeydown = (e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') root.innerHTML = ''; };
}

/* ---------- global keys ---------- */
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !/INPUT|TEXTAREA/.test(document.activeElement?.tagName || '')) {
    e.preventDefault();
    const i = $('#cap-input');
    if (i) { i.focus(); i.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else { location.hash = '#/'; setTimeout(() => $('#cap-input')?.focus(), 200); }
  }
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (!['library', 'inbox', 'exploring', 'completed'].includes(state.route)) location.hash = '#/library';
    setTimeout(() => $('#f-q')?.focus(), 200);
  }
});

/* ---------- boot ---------- */
async function boot() {
  window.addEventListener('hashchange', render);
  render();
  state.authChecked = true;
  await refreshDiscover();
  render();
}
document.addEventListener('DOMContentLoaded', boot);
