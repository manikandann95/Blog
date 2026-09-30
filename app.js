/* ==========================================================
   MY PERSONAL BLOG — app.js
   Auth: Supabase + GitHub OAuth
   Storage: Supabase PostgreSQL (per-user, Row Level Security)
   Features: EasyMDE editor, marked.js rendering,
             writing prompts, dark/light mode, search
   ========================================================== */

'use strict';

/* ── Config check ──────────────────────────────────────── */
if (typeof SUPABASE_URL === 'undefined' || SUPABASE_URL.includes('YOUR_')) {
  document.getElementById('loadingOverlay').innerHTML =
    '<div style="text-align:center;padding:40px;font-family:sans-serif;color:#333">' +
    '<h2>⚙️ Setup Required</h2>' +
    '<p style="margin:12px 0">Please open <strong>config.js</strong> and fill in your Supabase URL and anon key.</p>' +
    '<p><a href="SETUP.md" style="color:#6c5ce7">Read SETUP.md for instructions</a></p>' +
    '</div>';
  throw new Error('config.js not configured');
}

/* ── Supabase Client ───────────────────────────────────── */
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ── Constants ─────────────────────────────────────────── */
const THEME_KEY        = 'myBlog_theme_v1';
const LOCAL_NOTES_KEY  = 'myBlog_notes_v1';
const IMPORT_DISMISSED = 'myBlog_importDismissed';

const MODULES = [
  { id: 'daytoday',       label: '🗓 Day to Day'   },
  { id: 'tamil-culture',  label: '🎭 Tamil Culture' },
  { id: 'spirituality',   label: '🕉 Spirituality'  },
  { id: 'manifestation',  label: '✨ Manifestation'  },
  { id: 'md104',          label: '💻 MD-104'         },
];

const PROMPTS = {
  'daytoday': [
    "What's the one thing that stood out most today?",
    "How am I feeling right now, and why?",
    "What am I grateful for today?",
    "What challenged me today, and what did I learn from it?",
    "What's been on my mind lately that I haven't talked about?",
    "What small win did I have today?",
    "What do I want to do differently tomorrow?",
    "One thing I observed about the world around me today…",
    "What conversation or moment made me think today?",
    "If today had a title, what would it be?",
  ],
  'tamil-culture': [
    "A Tamil proverb (thirukural or otherwise) that resonates with me and why…",
    "A tradition from my family or community that I want to document…",
    "Thoughts on a Tamil poem, novel, or literary work I read recently…",
    "A cultural festival or ritual I participated in — its significance to me…",
    "Something about Tamil history or heritage I recently discovered…",
    "A Tamil song or film that deeply moved me — what it means to me…",
    "How does Tamil culture shape my daily life and values?",
    "A Tamil word or phrase that has no translation — and its beauty…",
  ],
  'spirituality': [
    "An insight from my meditation or prayer practice today…",
    "A spiritual principle I am exploring or questioning right now…",
    "How do I feel connected (or disconnected) to something greater today?",
    "A moment of stillness or peace I experienced recently…",
    "What does faith mean to me right now, in this season of life?",
    "A lesson life seems to be teaching me over and over…",
    "A scripture, verse, or teaching that spoke to me today…",
    "How am I growing spiritually compared to a year ago?",
  ],
  'manifestation': [
    "My clearest vision for 1 year from now — what does life look, feel, sound like?",
    "Things I am consciously calling into my life this month…",
    "How will I feel when I have achieved my deepest goals?",
    "An affirmation that is resonating strongly with me right now…",
    "Evidence of manifestation I have witnessed in my life recently…",
    "A limiting belief I am choosing to release today — and what replaces it…",
    "The version of me I am becoming — describe them in detail…",
    "What am I focusing my energy on today, and why does it matter?",
  ],
  'md104': [
    "Key concepts I learned or revised today in MD-104…",
    "A topic I need to revisit and understand more deeply…",
    "Practice questions I got wrong — and the correct reasoning…",
    "My study plan and focus areas for this week…",
    "How would I apply today's learning in a real-world Microsoft 365 scenario?",
    "Progress check: which exam domains am I strong in vs. where do I need work?",
    "A command, policy, or configuration I want to memorize — write it out…",
    "What's my biggest knowledge gap right now, and how will I close it?",
  ],
};

/* ── State ─────────────────────────────────────────────── */
let state = {
  currentModule:  'daytoday',
  selectedDate:   null,
  editingNoteId:  null,
  deleteTargetId: null,
  searchQuery:    '',
  notes:          {},       // { [moduleId]: [note, …] }
  currentUser:    null,
};

let easyMDE = null;

/* ── Init ──────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  applyTheme(localStorage.getItem(THEME_KEY) || 'light');
  configureMarked();
  bindEvents();

  /* Listen for auth state changes (handles OAuth callback redirect) */
  sb.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user) {
      state.currentUser = session.user;
      await initApp();
    } else {
      showLoginScreen();
    }
  });

  /* Check existing session on load */
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    hideLoading();
    showLoginScreen();
  }
  /* If session exists, onAuthStateChange above handles it */
});

/* ── Auth ──────────────────────────────────────────────── */
async function signInWithGitHub() {
  const btn = document.getElementById('githubLoginBtn');
  btn.disabled = true;
  btn.textContent = 'Redirecting to GitHub…';
  const { error } = await sb.auth.signInWithOAuth({
    provider: 'github',
    options: { redirectTo: window.location.href }
  });
  if (error) {
    btn.disabled = false;
    btn.innerHTML = '<svg viewBox="0 0 16 16" fill="currentColor" class="github-icon"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg> Sign in with GitHub';
    alert('Login error: ' + error.message);
  }
}

async function signOut() {
  showLoading('Signing out…');
  await sb.auth.signOut();
  state.currentUser = null;
  state.notes = {};
  hideLoading();
  showLoginScreen();
}

async function initApp() {
  showLoading('Loading your notes…');
  updateUserInfo();
  await loadAllNotes();
  hideLoading();
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('mainApp').classList.remove('hidden');
  checkLocalImport();
  render();
}

/* ── User Info in Header ───────────────────────────────── */
function updateUserInfo() {
  const user  = state.currentUser;
  const meta  = user.user_metadata || {};
  const name  = meta.full_name || meta.user_name || meta.login || 'User';
  const avatar= meta.avatar_url || '';
  document.getElementById('userName').textContent = name;
  const img = document.getElementById('userAvatar');
  if (avatar) { img.src = avatar; img.style.display = 'block'; }
  else { img.style.display = 'none'; }
}

/* ── Loading Helpers ───────────────────────────────────── */
function showLoading(msg) {
  document.getElementById('loadingMsg').textContent = msg || 'Loading…';
  document.getElementById('loadingOverlay').classList.remove('hidden');
}
function hideLoading() {
  document.getElementById('loadingOverlay').classList.add('hidden');
}
function showLoginScreen() {
  document.getElementById('mainApp').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
}

/* ── Supabase Notes CRUD ───────────────────────────────── */
async function loadAllNotes() {
  MODULES.forEach(m => { state.notes[m.id] = []; });
  const userId = state.currentUser.id;
  const { data, error } = await sb.from('notes').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) { console.error('Load error:', error); return; }
  (data || []).forEach(row => {
    const module = row.module;
    if (!state.notes[module]) state.notes[module] = [];
    state.notes[module].push({
      id:        row.id,
      title:     row.title || '',
      content:   row.content || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  });
}

async function dbInsertNote(moduleId, note) {
  const { error } = await sb.from('notes').insert({
    id:         note.id,
    user_id:    state.currentUser.id,
    module:     moduleId,
    title:      note.title,
    content:    note.content,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  });
  if (error) throw error;
}

async function dbUpdateNote(noteId, title, content, updatedAt) {
  const { error } = await sb.from('notes').update({ title, content, updated_at: updatedAt })
    .eq('id', noteId).eq('user_id', state.currentUser.id);
  if (error) throw error;
}

async function dbDeleteNote(noteId) {
  const { error } = await sb.from('notes').delete()
    .eq('id', noteId).eq('user_id', state.currentUser.id);
  if (error) throw error;
}

/* ── Local Import ──────────────────────────────────────── */
function checkLocalImport() {
  if (localStorage.getItem(IMPORT_DISMISSED)) return;
  const raw = localStorage.getItem(LOCAL_NOTES_KEY);
  if (!raw) return;
  try {
    const local = JSON.parse(raw);
    let count = 0;
    MODULES.forEach(m => { count += (local[m.id] || []).length; });
    if (count > 0) {
      document.getElementById('importBanner').classList.remove('hidden');
    }
  } catch(e) {}
}

async function importLocalNotes() {
  const raw = localStorage.getItem(LOCAL_NOTES_KEY);
  if (!raw) return;
  let local;
  try { local = JSON.parse(raw); } catch(e) { return; }
  showLoading('Importing your local notes to cloud…');
  let imported = 0, failed = 0;
  for (const m of MODULES) {
    const notes = local[m.id] || [];
    for (const note of notes) {
      try {
        /* Check if already exists */
        const exists = (state.notes[m.id] || []).some(n => n.id === note.id);
        if (!exists) {
          await dbInsertNote(m.id, note);
          state.notes[m.id].unshift(note);
          imported++;
        }
      } catch(e) { failed++; }
    }
  }
  hideLoading();
  document.getElementById('importBanner').classList.add('hidden');
  localStorage.setItem(IMPORT_DISMISSED, '1');
  alert(imported + ' notes imported to cloud!' + (failed ? '\n' + failed + ' failed (may already exist).' : ''));
  render();
}

/* ── marked.js ─────────────────────────────────────────── */
function configureMarked() {
  if (typeof marked === 'undefined') return;
  marked.setOptions({ breaks: true, gfm: true });
}

/* ── Theme ─────────────────────────────────────────────── */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  localStorage.setItem(THEME_KEY, theme);
}
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ── Event Bindings ────────────────────────────────────── */
function bindEvents() {
  /* Login */
  document.getElementById('githubLoginBtn').addEventListener('click', signInWithGitHub);
  /* Sign out */
  document.getElementById('signOutBtn').addEventListener('click', signOut);
  /* Nav tabs */
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentModule = btn.dataset.module;
      state.selectedDate  = null;
      clearSearch();
      render();
    });
  });
  /* Theme */
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);
  /* Export */
  document.getElementById('exportBtn').addEventListener('click', exportNotes);
  /* Search */
  const si = document.getElementById('searchInput');
  si.addEventListener('input', () => {
    state.searchQuery = si.value.trim();
    document.getElementById('clearSearchBtn').classList.toggle('hidden', !state.searchQuery);
    render();
  });
  document.getElementById('clearSearchBtn').addEventListener('click', () => { si.value = ''; clearSearch(); });
  /* New Note */
  document.getElementById('newNoteBtn').addEventListener('click', openNewNote);
  /* Modal save/cancel/close */
  document.getElementById('saveNoteBtn').addEventListener('click', saveNote);
  document.getElementById('cancelNoteBtn').addEventListener('click', closeModal);
  document.getElementById('closeModalBtn').addEventListener('click', closeModal);
  document.getElementById('modalBackdrop').addEventListener('click', closeModal);
  /* Writing Prompts toggle */
  document.getElementById('promptsToggle').addEventListener('click', () => {
    const panel = document.getElementById('promptsPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderPrompts(state.currentModule);
  });
  /* Delete confirm */
  document.getElementById('confirmDeleteBtn').addEventListener('click', executeDelete);
  document.getElementById('cancelDeleteBtn').addEventListener('click', closeConfirm);
  document.getElementById('confirmBackdrop').addEventListener('click', closeConfirm);
  /* Import banner */
  document.getElementById('importLocalBtn').addEventListener('click', importLocalNotes);
  document.getElementById('dismissImportBtn').addEventListener('click', () => {
    document.getElementById('importBanner').classList.add('hidden');
    localStorage.setItem(IMPORT_DISMISSED, '1');
  });
  /* Keyboard Escape */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeConfirm(); }
  });
}

/* ── Prompts ───────────────────────────────────────────── */
function renderPrompts(moduleId) {
  const prompts = PROMPTS[moduleId] || PROMPTS['daytoday'];
  const list    = document.getElementById('promptsList');
  list.innerHTML = prompts.map((p, i) =>
    `<button class="prompt-chip" data-idx="${i}" type="button">${escHtml(p)}</button>`
  ).join('');
  list.querySelectorAll('.prompt-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const txt = prompts[parseInt(chip.dataset.idx)];
      if (easyMDE) {
        const cur = easyMDE.value().trim();
        easyMDE.value(cur ? cur + '\n\n' + txt + '\n' : txt + '\n');
        const cm = easyMDE.codemirror;
        cm.focus();
        cm.setCursor(cm.lineCount(), 0);
      }
      document.getElementById('promptsPanel').classList.add('hidden');
    });
  });
}

/* ── EasyMDE ───────────────────────────────────────────── */
function initEasyMDE() {
  if (easyMDE) return;
  easyMDE = new EasyMDE({
    element: document.getElementById('noteContent'),
    autofocus: false,
    spellChecker: false,
    placeholder: 'Write your thoughts here in Markdown…\n\nTip: **bold**, *italic*, # Heading, - list, > quote',
    toolbar: ['bold','italic','strikethrough','|','heading-1','heading-2','heading-3','|',
              'quote','unordered-list','ordered-list','|','link','table','horizontal-rule','|',
              'preview','side-by-side','fullscreen','|','guide'],
    status: false,
    minHeight: '240px',
    renderingConfig: { singleLineBreaks: true },
  });
}

/* ── Render ────────────────────────────────────────────── */
function render() {
  updateNavTabs();
  updateSidebar();
  if (state.searchQuery) showSearchResults();
  else showModuleView();
}
function updateNavTabs() {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.module === state.currentModule);
  });
}

/* ── Sidebar ───────────────────────────────────────────── */
function updateSidebar() {
  const sidebar  = document.getElementById('sidebar');
  const dateList = document.getElementById('dateList');
  if (state.currentModule !== 'daytoday' || state.searchQuery) {
    sidebar.classList.add('hidden'); return;
  }
  sidebar.classList.remove('hidden');
  const notes  = state.notes['daytoday'] || [];
  const byDate = groupByDate(notes);
  const dates  = Object.keys(byDate).sort((a,b) => b.localeCompare(a));
  if (dates.length === 0) { dateList.innerHTML = '<p class="sidebar-empty">No entries yet.</p>'; return; }
  dateList.innerHTML = dates.map(d => {
    const count = byDate[d].length;
    return `<div class="date-item ${state.selectedDate === d ? 'active' : ''}" data-date="${d}">
      <span class="date-label">${formatDateLabel(d)}</span>
      <span class="date-count">${count} entr${count===1?'y':'ies'}</span>
    </div>`;
  }).join('');
  dateList.querySelectorAll('.date-item').forEach(el => {
    el.addEventListener('click', () => {
      state.selectedDate = state.selectedDate === el.dataset.date ? null : el.dataset.date;
      render();
    });
  });
}
function groupByDate(notes) {
  const map = {};
  notes.forEach(n => { const d = n.createdAt.slice(0,10); if (!map[d]) map[d]=[]; map[d].push(n); });
  return map;
}
function formatDateLabel(iso) {
  const [y,m,d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

/* ── Module View ───────────────────────────────────────── */
function showModuleView() {
  document.getElementById('searchResults').classList.add('hidden');
  document.getElementById('moduleView').classList.remove('hidden');
  const module = MODULES.find(m => m.id === state.currentModule);
  document.getElementById('moduleTitle').textContent = module.label;
  let notes = [...(state.notes[state.currentModule] || [])];
  if (state.currentModule === 'daytoday' && state.selectedDate) {
    notes = notes.filter(n => n.createdAt.slice(0,10) === state.selectedDate);
  }
  notes.sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  const list = document.getElementById('notesList');
  const empty = document.getElementById('emptyState');
  if (notes.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); list.innerHTML = notes.map(n => buildNoteCard(n, module.label, false)).join(''); attachCardEvents(list); }
}

/* ── Search ────────────────────────────────────────────── */
function showSearchResults() {
  document.getElementById('moduleView').classList.add('hidden');
  document.getElementById('searchResults').classList.remove('hidden');
  const q = state.searchQuery.toLowerCase();
  const results = [];
  MODULES.forEach(m => { (state.notes[m.id]||[]).forEach(n => { if (noteMatchesQuery(n,q)) results.push({note:n,moduleLabel:m.label}); }); });
  results.sort((a,b) => b.note.createdAt.localeCompare(a.note.createdAt));
  document.getElementById('searchResultCount').textContent = `${results.length} result${results.length!==1?'s':''}`;
  const list = document.getElementById('searchResultsList');
  const empty = document.getElementById('searchEmpty');
  if (results.length === 0) { list.innerHTML = ''; empty.classList.remove('hidden'); }
  else { empty.classList.add('hidden'); list.innerHTML = results.map(r => buildNoteCard(r.note, r.moduleLabel, true, q)).join(''); attachCardEvents(list); }
}
function noteMatchesQuery(note, q) {
  const iso = note.createdAt.slice(0,10);
  return (note.title||'').toLowerCase().includes(q) || (note.content||'').toLowerCase().includes(q) ||
    formatDateLabel(iso).toLowerCase().includes(q) || iso.includes(q) || formatFullDateTime(note.createdAt).toLowerCase().includes(q);
}
function clearSearch() {
  state.searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.getElementById('clearSearchBtn').classList.add('hidden');
  render();
}

/* ── Note Card ─────────────────────────────────────────── */
function buildNoteCard(note, moduleLabel, showBadge, highlight) {
  const title  = escHtml(note.title || '');
  const rawMd  = note.content || '';
  const footer = formatFullDateTime(note.createdAt);
  const edited = note.updatedAt && note.updatedAt !== note.createdAt ? ` · Edited ${formatFullDateTime(note.updatedAt)}` : '';
  let bodyHtml = highlight
    ? highlightText(escHtml(rawMd), highlight)
    : (typeof marked !== 'undefined' ? marked.parse(rawMd) : escHtml(rawMd).replace(/\n/g,'<br>'));
  const displayTitle = highlight && title ? highlightText(title, highlight) : (title || '<span class="untitled">Untitled</span>');
  const isLong = rawMd.length > 600;
  return `<article class="note-card" data-id="${note.id}">
    <div class="note-card-header">
      <div class="note-card-title">${displayTitle}</div>
      <div class="note-card-actions">
        <button class="note-action-btn edit-btn" data-id="${note.id}">✏️ Edit</button>
        <button class="note-action-btn delete delete-btn" data-id="${note.id}">🗑</button>
      </div>
    </div>
    <div class="note-card-body ${isLong&&!highlight?'collapsed':''}" id="body-${note.id}">${bodyHtml}</div>
    ${isLong&&!highlight?`<button class="read-more-btn" data-id="${note.id}">Show more ▾</button>`:''}
    <footer class="note-card-footer">
      <span>📝 ${footer}${edited}</span>
      ${showBadge?`<span class="note-module-badge">${escHtml(moduleLabel)}</span>`:''}
    </footer>
  </article>`;
}
function attachCardEvents(container) {
  container.querySelectorAll('.edit-btn').forEach(btn => { btn.addEventListener('click', () => openEditNote(btn.dataset.id)); });
  container.querySelectorAll('.delete-btn').forEach(btn => { btn.addEventListener('click', () => openConfirmDelete(btn.dataset.id)); });
  container.querySelectorAll('.read-more-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const body = document.getElementById(`body-${btn.dataset.id}`);
      const nowCollapsed = body.classList.toggle('collapsed');
      btn.textContent = nowCollapsed ? 'Show more ▾' : 'Show less ▴';
    });
  });
}

/* ── Note CRUD ─────────────────────────────────────────── */
function openNewNote() {
  state.editingNoteId = null;
  document.getElementById('modalHeading').textContent = 'New Entry';
  document.getElementById('noteTitle').value = '';
  document.getElementById('promptsPanel').classList.add('hidden');
  openModal();
  if (easyMDE) { easyMDE.value(''); easyMDE.codemirror.focus(); }
}
function openEditNote(id) {
  const note = findNoteById(id);
  if (!note) return;
  state.editingNoteId = id;
  document.getElementById('modalHeading').textContent = 'Edit Entry';
  document.getElementById('noteTitle').value = note.title || '';
  document.getElementById('promptsPanel').classList.add('hidden');
  openModal();
  if (easyMDE) { easyMDE.value(note.content||''); easyMDE.codemirror.focus(); }
}

async function saveNote() {
  const title   = document.getElementById('noteTitle').value.trim();
  const content = easyMDE ? easyMDE.value().trim() : document.getElementById('noteContent').value.trim();
  if (!content) {
    if (easyMDE) { easyMDE.codemirror.getWrapperElement().style.outline='2px solid var(--danger)'; setTimeout(()=>{easyMDE.codemirror.getWrapperElement().style.outline='';},1500); }
    return;
  }
  const saveBtn = document.getElementById('saveNoteBtn');
  saveBtn.disabled = true; saveBtn.textContent = 'Saving…';
  const now = new Date().toISOString();
  try {
    if (state.editingNoteId) {
      await dbUpdateNote(state.editingNoteId, title, content, now);
      const note = findNoteById(state.editingNoteId);
      if (note) { note.title = title; note.content = content; note.updatedAt = now; }
    } else {
      const note = { id: generateId(), title, content, createdAt: now, updatedAt: now };
      await dbInsertNote(state.currentModule, note);
      state.notes[state.currentModule].unshift(note);
    }
    closeModal();
    render();
  } catch(e) {
    alert('Save failed: ' + e.message);
  } finally {
    saveBtn.disabled = false; saveBtn.textContent = '💾 Save';
  }
}

function openConfirmDelete(id) { state.deleteTargetId = id; document.getElementById('confirmDialog').classList.remove('hidden'); }
function closeConfirm() { state.deleteTargetId = null; document.getElementById('confirmDialog').classList.add('hidden'); }
async function executeDelete() {
  if (!state.deleteTargetId) return;
  const delBtn = document.getElementById('confirmDeleteBtn');
  delBtn.disabled = true; delBtn.textContent = 'Deleting…';
  try {
    await dbDeleteNote(state.deleteTargetId);
    MODULES.forEach(m => { state.notes[m.id] = (state.notes[m.id]||[]).filter(n => n.id !== state.deleteTargetId); });
    closeConfirm(); render();
  } catch(e) { alert('Delete failed: ' + e.message); }
  finally { delBtn.disabled = false; delBtn.textContent = 'Delete'; }
}

/* ── Modal ─────────────────────────────────────────────── */
function openModal() {
  document.getElementById('noteModal').classList.remove('hidden');
  if (!easyMDE) setTimeout(initEasyMDE, 30);
}
function closeModal() { document.getElementById('noteModal').classList.add('hidden'); state.editingNoteId = null; }

/* ── Export ────────────────────────────────────────────── */
function exportNotes() {
  const data = JSON.stringify(state.notes, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `my-notes-${new Date().toISOString().slice(0,10)}.json` });
  a.click(); URL.revokeObjectURL(url);
}

/* ── Utilities ─────────────────────────────────────────── */
function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
function findNoteById(id) {
  for (const m of MODULES) { const n = (state.notes[m.id]||[]).find(n=>n.id===id); if (n) return n; }
  return null;
}
function escHtml(str) { return (str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function highlightText(html, query) {
  if (!query) return html;
  return html.replace(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})`, 'gi'), '<mark>$1</mark>');
}
function formatFullDateTime(isoString) {
  const d = new Date(isoString);
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const ist    = new Date(d.getTime() + 5.5*60*60*1000);
  const hr     = ist.getUTCHours(); const min = ist.getUTCMinutes();
  return `${days[ist.getUTCDay()]}, ${ist.getUTCDate()} ${months[ist.getUTCMonth()]} ${ist.getUTCFullYear()} at ${hr%12||12}:${String(min).padStart(2,'0')} ${hr>=12?'PM':'AM'} IST`;
}
