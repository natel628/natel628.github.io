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
  const w = String((t?.overview || '') + ' ' + (t?.keyFacts || []).join(' ')).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(w / 200));
};

const PREFS_KEY = 'curio_prefs_v1';
function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); } catch { return {}; }
}
const prefs = Object.assign({ view: 'grid', sort: 'newest', summaryMode: 'full' }, loadPrefs());
function savePrefs() { try { localStorage.setItem(PREFS_KEY, JSON.stringify({ view: prefs.view, sort: prefs.sort, summaryMode: prefs.summaryMode })); } catch {} }

const IS_MIRROR = typeof location !== 'undefined' && /(^|\.)github\.io$/.test(location.hostname || '');
const API_BASE = IS_MIRROR ? 'https://curio-oqu69z.freebuff.site' : '';
const PUBLIC_API = new Set(['/api/health', '/api/wikipedia', '/api/search', '/api/research']);

const state = {
  user: null, authChecked: false,
  route: 'home', topicId: null,
  topics: [], categories: [],
  guest: loadGuest(),
  filter: { q: '', status: 'all', category: 'All', sort: prefs.sort, view: prefs.view, showArchived: false },
  discover: null, discoverEmpty: false, rediscover: [],
  capturing: false,
};
function loadGuest() {
  try { return JSON.parse(localStorage.getItem('curio_guest_v1') || '[]'); } catch { return []; }
}
function saveGuest() { localStorage.setItem('curio_guest_v1', JSON.stringify(state.guest)); }

async function api(path, opts = {}) {
  const base = path.split('?')[0];
  const url = IS_MIRROR && PUBLIC_API.has(base) ? API_BASE + path : path;
  const r = await fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
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
      setStatusText('Researching… (sign in to sync across devices)');
      const d = await api('/api/research', { method: 'POST', body: JSON.stringify({ input }) });
      const r = d.result;
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
      ${state.user ? `<div class="user-row"><span class="avatar">${state.user.picture ? `<img src="${esc(state.user.picture)}" alt="">` : '◉'}</span><span>${esc(state.user.name || state.user.email || 'Curious mind')}</span></div>
      <form method="post" action="/auth/freebuff/signout"><button class="btn ghost small" type="submit">Sign out</button></form>`
      : IS_MIRROR ? `<a class="btn primary small" href="https://curio-oqu69z.freebuff.site">Open the full synced app</a>
         <div class="hint">This mirror keeps your library in this browser only.</div>`
      : `<a class="btn primary small" href="/auth/freebuff/signin?returnTo=${encodeURIComponent(location.hash || '#/')}">Sign in with Freebuff</a>
         <div class="hint">Sync across devices. Guests save on this device only.</div>`}
    </div>`;
  $('#side').querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  const bn = $('#bottomnav');
  const short = { home: 'Capture', inbox: 'Inbox', library: 'Library', exploring: 'Exploring', completed: 'Done', discover: 'Discover' };
  bn.innerHTML = NAV.map((n) => `<button class="${active(n.id) ? 'active' : ''}" data-nav="${n.id}" aria-label="${esc(n.label)}"><span class="bi">${n.icon}</span>${short[n.id] || n.label}</button>`).join('') +
    (state.user ? '' : IS_MIRROR
      ? `<a href="https://curio-oqu69z.freebuff.site"><span class="bi">✦</span>Full app</a>`
      : `<a href="/auth/freebuff/signin?returnTo=${encodeURIComponent(location.hash || '#/')}"><span class="bi">○</span>Sign in</a>`);
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
function filteredTopics(base, opts = {}) {
  const f = state.filter;
  let list = f.showArchived ? [...base] : base.filter((t) => !t.archived);
  if (state.route === 'inbox') list = list.filter((t) => t.status === 'unread');
  if (state.route === 'exploring') list = list.filter((t) => t.status === 'exploring');
  if (state.route === 'completed') list = list.filter((t) => t.status === 'completed');
  if (!f.showArchived) list = list.filter((t) => !t.archived);
  if (state.route === 'library' && f.status !== 'all') list = list.filter((t) => t.status === f.status);
  if (f.q && !opts.ignoreQ) { const q = f.q.toLowerCase(); list = list.filter((t) => (t.title + ' ' + t.overview + ' ' + t.category + ' ' + (t.input || '')).toLowerCase().includes(q)); }
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
function renderList(limit, opts = {}) {
  const host = $('#list-host');
  if (!host) return;
  let list = filteredTopics(allTopics(), opts);
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
function homeHTML() {
  const red = state.rediscover;
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
  return `<div class="steps" role="group" aria-label="Progress">${order.map((s, i) => `<button type="button" class="step ${i <= idx ? 'done' : ''} ${t.status === s ? 'now' : ''}" data-status="${s}" aria-pressed="${t.status === s}"><span class="dot">${i < idx ? '✓' : (i + 1)}</span>${s}</button>${i < 2 ? '<span class="bar" aria-hidden="true"></span>' : ''}`).join('')}</div>`;
}

function disputedText(t) {
  if (t.disputed) return t.disputed;
  if ((t.sources || []).length) return 'Established: the overview above comes from Wikipedia and the sources linked below. Debated: interpretations and open questions vary — compare the linked sources before treating any claim as settled.';
  return '';
}

function topicHTML(t) {
  const disputed = disputedText(t);
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
  <div class="topic-layout">
    <div class="prose">
      <div class="panel"><div class="panel-head"><h3>Overview</h3>
        ${hasSimple ? `<div class="seg sm" id="sum-toggle" role="tablist" aria-label="Summary style"><button data-m="full" class="${mode === 'full' ? 'active' : ''}">Full</button><button data-m="simple" class="${mode === 'simple' ? 'active' : ''}">Plain English</button></div>` : ''}
      </div><p>${esc(overviewText)}</p>
        ${hasSimple && mode === 'simple' ? `<p class="hint" style="margin-top:10px">Plain-language version from Simple English Wikipedia. <a href="${esc(t.simple.url || '#')}" target="_blank" rel="noopener">Read there ↗</a></p>` : ''}
        ${disputed ? `<details class="note"><summary>Established vs debated</summary><p>${esc(disputed)}</p></details>` : ''}</div>
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
  renderSide();
  const main = $('#main');
  if (state.route === 'home') {
    main.innerHTML = homeHTML();
    bindCapture(); renderList(6, { ignoreQ: true });
    bindCards(main);
    main.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => capture(b.dataset.ex)));
    main.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  } else if (state.route === 'topic') {
    const t = findTopic(state.topicId);
    if (!t) { main.innerHTML = `<div class="empty"><div class="big">?</div><p>That topic isn't here. It may have been deleted.</p><br><button class="btn" onclick="location.hash='#/library'">Back to library</button></div>`; return; }
    main.innerHTML = topicHTML(t);
    $('#back-btn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/library');
    main.querySelectorAll('.steps .step').forEach((b) => (b.onclick = async () => {
      const y = window.scrollY;
      await patchTopic(t.id, { status: b.dataset.status });
      window.scrollTo(0, y);
    }));
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
  if (!IS_MIRROR) {
    try {
      const me = await api('/api/me');
      if (!me._unauth && me.user) state.user = me.user;
    } catch { /* signed out or DB not attached yet */ }
  }
  state.authChecked = true;
  if (state.user) await refreshLibrary();
  await refreshDiscover();
  render();
}
document.addEventListener('DOMContentLoaded', boot);
