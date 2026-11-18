/* Curio — personal curiosity library SPA */
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

/* GitHub Pages mirror: static frontend. Research calls the live Curio API;
   the library stays in this browser (localStorage). For accounts + synced
   library use the full app: https://curio-oqu69z.freebuff.site */
const API_BASE = location.hostname.endsWith('github.io') ? 'https://curio-oqu69z.freebuff.site' : '';
const STATIC_MODE = location.hostname.endsWith('github.io');
const FULL_APP = 'https://curio-oqu69z.freebuff.site';

const state = {
  user: null, authChecked: false,
  route: 'home', topicId: null,
  topics: [], categories: [],
  guest: loadGuest(),
  filter: { q: '', status: 'all', category: 'All', sort: 'newest', view: 'grid' },
  discover: null, rediscover: [],
  capturing: false,
};
function loadGuest() {
  try { return JSON.parse(localStorage.getItem('curio_guest_v1') || '[]'); } catch { return []; }
}
function saveGuest() { localStorage.setItem('curio_guest_v1', JSON.stringify(state.guest)); }

async function api(path, opts = {}) {
  const r = await fetch(API_BASE + path, { ...opts, headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) } });
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
      if (!d._unauth) { state.discover = d.discover; }
      const r = await api('/api/rediscover');
      if (!r._unauth) state.rediscover = r.items || [];
    } catch { /* offline */ }
  } else {
    state.discover = localDiscover(state.guest);
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
const EXAMPLES = ['Why did the Library of Alexandria disappear?', 'The psychology of déjà vu', 'The Fermi paradox', 'Something I heard on a podcast about ancient civilizations'];
async function capture(input) {
  input = (input || '').trim();
  if (!input || state.capturing) return;
  state.capturing = true;
  setStatus('Saving and researching…');
  try {
    if (state.user) {
      const d = await api('/api/topics', { method: 'POST', body: JSON.stringify({ input }) });
      if (d._unauth) { state.user = null; render(); return; }
      state.topics.unshift(d.topic);
      setStatus('Saved. Research ready.', true);
      location.hash = '#/topic/' + d.topic.id;
    } else {
      setStatus('Researching… (sign in to save across devices)');
      const d = await api('/api/research', { method: 'POST', body: JSON.stringify({ input }) });
      const r = d.result;
      const now = Date.now();
      const topic = {
        id: 'g_' + now.toString(36) + Math.random().toString(36).slice(2, 7),
        title: r.title, input, inputType: r.inputType, category: r.category, status: 'exploring',
        overview: r.overview, keyFacts: r.keyFacts, wikiUrl: r.wiki?.url || null, wikiTitle: r.wiki?.title || null,
        sources: r.sources, related: r.related, notes: '', aiPowered: r.aiPowered, archived: false,
        createdAt: now, updatedAt: now,
      };
      state.guest.unshift(topic); saveGuest();
      setStatus('Saved to this device. <span class="ai">Sign in to keep it everywhere.</span>', true);
      location.hash = '#/topic/' + topic.id;
    }
  } catch (e) {
    setStatus(esc(e.message));
    toast(e.message);
  } finally { state.capturing = false; }
}
function setStatus(html, done) {
  const el = $('#cap-status');
  if (el) el.innerHTML = done ? html : esc(html).replace(/&lt;[^&]*&gt;/g, '') || html;
  if (el && !done) el.textContent = html.replace(/<[^>]*>/g, '');
  if (el && done) el.innerHTML = html;
}

/* ---------- mutations ---------- */
async function patchTopic(id, patch) {
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
  render();
}
async function deleteTopic(id) {
  if (!confirm('Delete this topic? This cannot be undone.')) return;
  if (state.user && !String(id).startsWith('g_')) {
    const d = await api('/api/topics/' + id, { method: 'DELETE' }).catch(() => null);
    if (d && d._unauth) { state.user = null; render(); return; }
    state.topics = state.topics.filter((t) => t.id !== id);
  } else {
    state.guest = state.guest.filter((t) => t.id !== id);
    saveGuest();
  }
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
  $('#side').innerHTML = `
    <div class="brand"><div class="brand-mark">C</div><div><div class="brand-name">Curio</div><div class="brand-tag">Never lose a thought</div></div></div>
    <div class="nav-label">Capture</div>
    ${NAV.slice(0, 1).map((n) => `<button class="nav-item ${state.route === n.id ? 'active' : ''}" data-nav="${n.id}"><span class="ico">${n.icon}</span>${n.label}</button>`).join('')}
    <div class="nav-label">Library</div>
    ${NAV.slice(1, 5).map((n) => `<button class="nav-item ${state.route === n.id || (state.route === 'topic' && n.id === 'library') ? 'active' : ''}" data-nav="${n.id}"><span class="ico">${n.icon}</span>${n.label}${badge(c[n.id])}</button>`).join('')}
    <div class="nav-label">Discovery</div>
    ${NAV.slice(5).map((n) => `<button class="nav-item ${state.route === n.id ? 'active' : ''}" data-nav="${n.id}"><span class="ico">${n.icon}</span>${n.label}</button>`).join('')}
    <div class="side-foot">
      ${state.user ? `<div class="user-row"><span class="avatar">${state.user.picture ? `<img src="${esc(state.user.picture)}" alt="">` : '◉'}</span><span>${esc(state.user.name || state.user.email || 'Curious mind')}</span></div>
      <form method="post" action="/auth/freebuff/signout"><button class="btn ghost small" type="submit">Sign out</button></form>`
      : STATIC_MODE
        ? `<a class="btn primary small" href="${FULL_APP}" target="_blank" rel="noopener">Open the full app ↗</a>
         <div class="hint">GitHub mirror: library stays in this browser. Accounts + sync live in the full app.</div>`
        : `<a class="btn primary small" href="/auth/freebuff/signin?returnTo=${encodeURIComponent(location.hash || '#/')}">Sign in with Freebuff</a>
         <div class="hint">Sign in to sync your library. Or keep exploring on this device.</div>`}
    </div>`;
  $('#side').querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
  const bn = $('#bottomnav');
  const items = [NAV[0], NAV[2], NAV[3], NAV[5]];
  bn.innerHTML = items.map((n) => `<button class="${(state.route === n.id || (state.route === 'topic' && n.id === 'library')) ? 'active' : ''}" data-nav="${n.id}"><span class="bi">${n.icon}</span>${n.label.split(' ')[0] === 'Feed' ? 'Discover' : n.label.split(' ')[0] === 'My' ? 'Library' : n.label}</button>`).join('') +
    (state.user ? '' : STATIC_MODE ? `<a href="${FULL_APP}" target="_blank" rel="noopener"><span class="bi">○</span>Full app</a>` : `<a href="/auth/freebuff/signin?returnTo=${encodeURIComponent(location.hash || '#/')}"><span class="bi">○</span>Sign in</a>`);
  bn.querySelectorAll('[data-nav]').forEach((b) => (b.onclick = () => go(b.dataset.nav)));
}

/* ---------- views ---------- */
function cardHTML(t) {
  return `<article class="card" data-open="${esc(t.id)}" tabindex="0" role="link" aria-label="${esc(t.title)}">
    <div class="card-actions">
      <button class="icon-btn" data-archive="${esc(t.id)}" title="${t.archived ? 'Unarchive' : 'Archive'}">▢</button>
      <button class="icon-btn" data-del="${esc(t.id)}" title="Delete">×</button>
    </div>
    <div class="cat">${esc(t.category)}</div>
    <h3>${esc(t.title)}</h3>
    <p class="desc">${esc(t.overview || '')}</p>
    <div class="card-meta"><span class="pill ${esc(t.status)}">${esc(t.status)}</span><span>${timeAgo(t.createdAt)}</span></div>
  </article>`;
}
function filteredTopics(base) {
  const f = state.filter;
  let list = base.filter((t) => !t.archived);
  if (state.route === 'inbox') list = list.filter((t) => t.status === 'unread');
  if (state.route === 'exploring') list = list.filter((t) => t.status === 'exploring');
  if (state.route === 'completed') list = list.filter((t) => t.status === 'completed');
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter((t) => (t.title + ' ' + t.overview + ' ' + t.category).toLowerCase().includes(q)); }
  if (f.category !== 'All') list = list.filter((t) => t.category === f.category);
  if (f.sort === 'title') list = [...list].sort((a, b) => a.title.localeCompare(b.title));
  else if (f.sort === 'oldest') list = [...list].sort((a, b) => a.createdAt - b.createdAt);
  else list = [...list].sort((a, b) => b.createdAt - a.createdAt);
  return list;
}
function toolbarHTML(showStatus) {
  const cats = ['All', ...new Set(allTopics().filter((t) => !t.archived).map((t) => t.category))];
  return `<div class="toolbar">
    <label class="search"><span>⌕</span><input id="f-q" placeholder="Search saved topics…" value="${esc(state.filter.q)}"></label>
    ${showStatus ? `<div class="seg" id="f-status">
      ${['all', 'unread', 'exploring', 'completed'].map((s) => `<button data-s="${s}" class="${state.filter.status === s ? 'active' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>` : ''}
    <select id="f-cat">${cats.map((c) => `<option ${state.filter.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
    <select id="f-sort">
      <option value="newest" ${state.filter.sort === 'newest' ? 'selected' : ''}>Newest</option>
      <option value="oldest" ${state.filter.sort === 'oldest' ? 'selected' : ''}>Oldest</option>
      <option value="title" ${state.filter.sort === 'title' ? 'selected' : ''}>Title A–Z</option>
    </select>
    <div class="seg" id="f-view"><button data-v="grid" class="${state.filter.view === 'grid' ? 'active' : ''}">Grid</button><button data-v="list" class="${state.filter.view === 'list' ? 'active' : ''}">List</button></div>
  </div>`;
}
function bindToolbar() {
  const q = $('#f-q');
  if (q) q.oninput = (e) => { state.filter.q = e.target.value; renderList(); };
  const st = $('#f-status');
  if (st) st.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.status = b.dataset.s; render(); }));
  const cat = $('#f-cat');
  if (cat) cat.onchange = (e) => { state.filter.category = e.target.value; renderList(); };
  const sort = $('#f-sort');
  if (sort) sort.onchange = (e) => { state.filter.sort = e.target.value; renderList(); };
  const vw = $('#f-view');
  if (vw) vw.querySelectorAll('button').forEach((b) => (b.onclick = () => { state.filter.view = b.dataset.v; render(); }));
}
function bindCards(root) {
  root.querySelectorAll('[data-open]').forEach((el) => {
    el.onclick = (e) => {
      if (e.target.closest('[data-del]') || e.target.closest('[data-archive]') || e.target.closest('[data-edit]')) return;
      location.hash = '#/topic/' + encodeURIComponent(el.dataset.open);
    };
    el.onkeydown = (e) => { if (e.key === 'Enter') location.hash = '#/topic/' + encodeURIComponent(el.dataset.open); };
  });
  root.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); deleteTopic(b.dataset.del); }));
  root.querySelectorAll('[data-archive]').forEach((b) => (b.onclick = (e) => { e.stopPropagation(); patchTopic(b.dataset.archive, { archived: true }); toast('Archived.'); }));
}
function renderList() {
  const host = $('#list-host');
  if (!host) return;
  let list = filteredTopics(allTopics());
  if (state.route === 'library' && state.filter.status !== 'all') list = list.filter((t) => t.status === state.filter.status);
  host.className = 'grid' + (state.filter.view === 'list' ? ' list' : '');
  host.innerHTML = list.length ? list.map(cardHTML).join('') : `<div class="empty"><div class="big">○</div><p>Nothing here yet. Capture your first curiosity above.</p></div>`;
  bindCards(host);
}

function homeHTML() {
  const red = state.rediscover;
  return `<section class="hero">
    <h1>What's on <em>your mind?</em></h1>
    <p>Capture something you're curious about. We'll help you explore it.</p>
  </section>
  <div class="capture">
    <textarea id="cap-input" rows="2" placeholder="A topic, a question, a half-formed thought, a link…"></textarea>
    <div class="capture-row"><span class="hint" id="cap-mode">${state.user ? 'Auto-saves to your library' : 'Browsing as guest — sign in to sync'}</span><span class="spacer"></span><button class="btn primary" id="cap-btn">Explore ✦</button></div>
  </div>
  <div class="examples">${EXAMPLES.map((e) => `<button class="chip" data-ex="${esc(e)}">${esc(e)}</button>`).join('')}</div>
  <div class="status-line" id="cap-status"></div>
  ${red.length ? `<section class="section"><div class="section-head"><h2>Gently resurfacing</h2><p>no pressure — just wonder</p></div>
    <div class="grid">${red.map(({ topic, prompt }) => `<article class="card" data-open="${esc(topic.id)}"><div class="cat">${esc(prompt)}</div><h3>${esc(topic.title)}</h3><p class="desc">${esc(topic.overview || '')}</p><div class="card-meta"><span class="pill ${esc(topic.status)}">${esc(topic.status)}</span><span>${timeAgo(topic.createdAt)}</span></div></article>`).join('')}</div></section>` : ''}
  <section class="section"><div class="section-head"><h2>Recent curiosities</h2><p>${allTopics().filter((t) => !t.archived).length} saved</p></div>
    <div class="grid" id="list-host"></div></section>`;
}

function libraryHTML(title, sub, showStatus) {
  return `<section class="section" style="margin-top:8px"><div class="section-head"><h2>${esc(title)}</h2><p>${esc(sub)}</p></div>
  ${toolbarHTML(showStatus)}<div class="grid" id="list-host"></div></section>
  <section class="section"><div class="section-head"><h2>Capture another</h2></div>
  <div class="capture"><textarea id="cap-input" rows="2" placeholder="What are you curious about now?"></textarea>
  <div class="capture-row"><span class="hint">Auto-saves to your library</span><span class="spacer"></span><button class="btn primary" id="cap-btn">Explore ✦</button></div></div>
  <div class="status-line" id="cap-status"></div></section>`;
}

function discoverHTML() {
  const d = state.discover;
  if (!d) return `<section class="section"><div class="section-head"><h2>Feed Your Curiosity</h2></div><div class="skel"></div><div class="skel"></div></section>`;
  const col = (title, items) => `<div class="disc-col"><h4>${esc(title)}</h4>${items.map((r) => `<button class="rec" data-query="${esc(r.query || r.title)}"><h5>${esc(r.title)}</h5><p class="why">${esc(r.reason || '')}</p></button>`).join('') || '<p class="hint">Save a few topics to unlock this.</p>'}</div>`;
  return `<section class="section" style="margin-top:8px"><div class="section-head"><h2>Feed Your Curiosity</h2><p>based on your library · no key needed</p></div>
  <div class="disc-grid">${col('Related discoveries', d.related)}${col('Unexpected connections', d.unexpected)}${col('New curiosities', d.newCuriosities)}</div></section>`;
}

function topicHTML(t) {
  const facts = (t.keyFacts || []).map((f) => `<li>${esc(f)}</li>`).join('');
  const srcs = (t.sources || []).map((s) => `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener"><span class="src-p">${esc(s.publisher || 'source')}</span><span class="src-t">${esc(s.title)}</span>${s.snippet ? `<span class="src-s">${esc(s.snippet)}</span>` : ''}</a>`).join('');
  return `<button class="back" id="back-btn">← Back to library</button>
  <div class="topic-hero">
    <div class="cat">${esc(t.category)} · ${esc(t.inputType || 'topic')}</div>
    <h1>${esc(t.title)}</h1>
    <div class="date">Saved ${fmtDate(t.createdAt)} · ${esc(t.status)}</div>
    <div><span class="badge plain">○ Curio research · Wikipedia + web</span>
    ${t.wikiUrl ? `<a class="badge plain" style="text-decoration:none" href="${esc(t.wikiUrl)}" target="_blank" rel="noopener">Wikipedia ↗</a>` : ''}</div>
    <div class="status-row" id="status-row">
      ${['unread', 'exploring', 'completed'].map((s) => `<button class="btn small ${t.status === s ? 'primary' : 'ghost'}" data-status="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
      <span style="flex:1"></span>
      <button class="btn small ghost" id="edit-btn">Rename</button>
      <button class="btn small ghost" id="arch-btn">${t.archived ? 'Unarchive' : 'Archive'}</button>
      <button class="btn small ghost" id="del-btn">Delete</button>
    </div>
  </div>
  <div class="prose">
    <div class="panel"><h3>Overview</h3><p>${esc(t.overview || 'No overview yet.')}</p>
      ${t.disputed ? `<p style="margin-top:12px;font-size:13.5px;color:var(--muted)"><em>Established vs debated:</em> ${esc(t.disputed)}</p>` : ''}</div>
    ${facts ? `<div class="panel"><h3>Key facts</h3><ul class="facts">${facts}</ul></div>` : ''}
    <div class="panel"><h3>Sources & further reading</h3>${srcs || '<p class="hint">No sources found yet.</p>'}</div>
    ${(t.related || []).length ? `<div class="panel"><h3>Rabbit holes</h3><div class="rel-grid">${t.related.map((r) => `<button class="rel" data-query="${esc(r.title)}"><span>${esc(r.title)}<small>${esc(r.reason || '')}</small></span><span>→</span></button>`).join('')}</div></div>` : ''}
    <div class="panel"><h3>Personal notes <span class="hint" style="font-family:var(--sans)">· autosaves</span></h3>
      <textarea class="notes-area" id="notes" placeholder="What struck you? What do you want to remember or follow up on?">${esc(t.notes || '')}</textarea>
      <div class="save-note" id="notes-state">Notes stay on this ${state.user ? 'account' : 'device'}.</div></div>
  </div>`;
}

/* ---------- render ---------- */
function render() {
  parseRoute();
  renderSide();
  const main = $('#main');
  if (state.route === 'home') {
    main.innerHTML = homeHTML();
    bindCapture(); renderList();
    bindCards(main);
    main.querySelectorAll('[data-ex]').forEach((b) => (b.onclick = () => { $('#cap-input').value = b.dataset.ex; capture(b.dataset.ex); }));
  } else if (state.route === 'topic') {
    const t = findTopic(state.topicId);
    if (!t) { main.innerHTML = `<div class="empty"><div class="big">?</div><p>That topic isn't here. It may have been deleted.</p><br><button class="btn" onclick="location.hash='#/library'">Back to library</button></div>`; return; }
    main.innerHTML = topicHTML(t);
    $('#back-btn').onclick = () => history.length > 1 ? history.back() : (location.hash = '#/library');
    $('#status-row').querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => patchTopic(t.id, { status: b.dataset.status })));
    $('#del-btn').onclick = () => deleteTopic(t.id);
    $('#arch-btn').onclick = () => { patchTopic(t.id, { archived: !t.archived }); toast(t.archived ? 'Unarchived.' : 'Archived.'); };
    $('#edit-btn').onclick = () => openRename(t);
    const notes = $('#notes');
    let h;
    notes.oninput = () => {
      $('#notes-state').textContent = 'Saving…';
      clearTimeout(h);
      h = setTimeout(async () => {
        await patchTopicSilent(t.id, { notes: notes.value });
        $('#notes-state').textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      }, 700);
    };
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => { location.hash = '#/'; setTimeout(() => capture(b.dataset.query), 150); }));
  } else if (state.route === 'discover') {
    main.innerHTML = discoverHTML();
    main.querySelectorAll('[data-query]').forEach((b) => (b.onclick = () => { location.hash = '#/'; setTimeout(() => capture(b.dataset.query), 150); }));
  } else {
    const meta = { inbox: ['Inbox', 'Newly saved — not yet explored'], library: ['My Library', 'Everything you have saved'], exploring: ['Exploring', 'Currently being researched'], completed: ['Completed', 'Finished exploring'] }[state.route];
    main.innerHTML = libraryHTML(meta[0], meta[1], state.route === 'library');
    bindToolbar(); bindCapture(); renderList();
  }
}
async function patchTopicSilent(id, patch) {
  const t = findTopic(id);
  if (!t) return;
  if (state.user && !String(id).startsWith('g_')) {
    try {
      const d = await api('/api/topics/' + id, { method: 'PATCH', body: JSON.stringify(patch) });
      if (!d._unauth) Object.assign(t, d.topic);
    } catch { /* keep local */ }
  } else { Object.assign(t, patch, { updatedAt: Date.now() }); saveGuest(); }
}
function bindCapture() {
  const btn = $('#cap-btn'), input = $('#cap-input');
  if (!btn || !input) return;
  const goCap = () => capture(input.value);
  btn.onclick = goCap;
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); goCap(); } };
  input.focus();
}
function openRename(t) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-wrap"><div class="modal"><h3>Rename topic</h3><p>Give it a name you'll recognize later.</p>
    <input id="rename-input" value="${esc(t.title)}"><div style="display:flex;gap:10px;justify-content:flex-end"><button class="btn ghost small" id="m-cancel">Cancel</button><button class="btn primary small" id="m-save">Save</button></div></div></div>`;
  $('#m-cancel').onclick = () => (root.innerHTML = '');
  $('#m-save').onclick = async () => { const v = $('#rename-input').value.trim(); if (v) await patchTopic(t.id, { title: v }); root.innerHTML = ''; };
}

/* ---------- boot ---------- */
async function boot() {
  window.addEventListener('hashchange', render);
  render();
  if (!STATIC_MODE) {
    try {
      const me = await api('/api/me');
      if (!me._unauth && me.user) state.user = me.user;
    } catch { /* signed out or DB not attached yet */ }
    if (state.user) await refreshLibrary();
  }
  state.authChecked = true;
  await refreshDiscover();
  render();
}
document.addEventListener('DOMContentLoaded', boot);
