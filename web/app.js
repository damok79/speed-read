// Speed Read PWA - Main App

const api = new ReadwiseAPI();
let currentLocation = 'new';
let nextPageCursor = null;
let searchTimeout = null;
let pinBuffer = '';
let pinMode = 'unlock'; // 'setup', 'unlock', 'change-old', 'change-new', 'change-confirm'
let newPinTemp = '';

// ---- PIN Authentication ----

async function hashPin(pin) {
  const data = new TextEncoder().encode(pin + 'speed-read-salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hasPinSet() {
  return !!localStorage.getItem('pinHash');
}

function isUnlocked() {
  return sessionStorage.getItem('unlocked') === 'true';
}

function unlock() {
  sessionStorage.setItem('unlocked', 'true');
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('app').classList.add('active');
  handlePendingUrl();
}

function lock() {
  sessionStorage.removeItem('unlocked');
  document.getElementById('app').classList.remove('active');
  document.getElementById('settings-panel').classList.remove('active');
  document.getElementById('lock-screen').classList.remove('hidden');
  pinBuffer = '';
  pinMode = 'unlock';
  updatePinDots();
  document.getElementById('lock-subtitle').textContent = 'Enter PIN';
}

function updatePinDots() {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinBuffer.length);
    dot.classList.remove('error');
  });
}

function showPinError(msg) {
  const dots = document.querySelectorAll('#pin-dots .pin-dot');
  dots.forEach(d => d.classList.add('error'));
  document.getElementById('pin-status').textContent = msg;
  document.getElementById('pin-status').className = 'pin-status error';
  pinBuffer = '';
  setTimeout(() => {
    updatePinDots();
    document.getElementById('pin-status').textContent = '';
    document.getElementById('pin-status').className = 'pin-status';
  }, 1000);
}

async function handlePinComplete() {
  const pin = pinBuffer;

  if (pinMode === 'setup') {
    if (!newPinTemp) {
      newPinTemp = pin;
      pinBuffer = '';
      updatePinDots();
      document.getElementById('lock-subtitle').textContent = 'Confirm PIN';
      return;
    }
    if (pin === newPinTemp) {
      const hash = await hashPin(pin);
      localStorage.setItem('pinHash', hash);
      newPinTemp = '';
      unlock();
    } else {
      newPinTemp = '';
      showPinError('PINs did not match');
      document.getElementById('lock-subtitle').textContent = 'Choose a 4-digit PIN';
    }
    return;
  }

  if (pinMode === 'unlock') {
    const stored = localStorage.getItem('pinHash');
    const hash = await hashPin(pin);
    if (hash === stored) {
      unlock();
    } else {
      showPinError('Wrong PIN');
    }
    return;
  }

  if (pinMode === 'change-old') {
    const stored = localStorage.getItem('pinHash');
    const hash = await hashPin(pin);
    if (hash === stored) {
      pinBuffer = '';
      pinMode = 'change-new';
      updatePinDots();
      document.getElementById('lock-subtitle').textContent = 'New PIN';
    } else {
      showPinError('Wrong PIN');
    }
    return;
  }

  if (pinMode === 'change-new') {
    newPinTemp = pin;
    pinBuffer = '';
    pinMode = 'change-confirm';
    updatePinDots();
    document.getElementById('lock-subtitle').textContent = 'Confirm New PIN';
    return;
  }

  if (pinMode === 'change-confirm') {
    if (pin === newPinTemp) {
      const hash = await hashPin(pin);
      localStorage.setItem('pinHash', hash);
      newPinTemp = '';
      unlock();
    } else {
      newPinTemp = '';
      pinMode = 'change-new';
      showPinError('PINs did not match');
      document.getElementById('lock-subtitle').textContent = 'New PIN';
    }
    return;
  }
}

// PIN pad events
document.getElementById('pin-pad').addEventListener('click', (e) => {
  const btn = e.target.closest('.pin-key');
  if (!btn || btn.classList.contains('empty')) return;

  const key = btn.dataset.key;
  if (key === 'del') {
    pinBuffer = pinBuffer.slice(0, -1);
    updatePinDots();
    return;
  }

  if (pinBuffer.length < 4) {
    pinBuffer += key;
    updatePinDots();
    if (pinBuffer.length === 4) {
      setTimeout(handlePinComplete, 150);
    }
  }
});

// ---- Tab Switching ----

document.querySelectorAll('.tabs .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tabs .tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    const target = tab.dataset.tab;
    document.getElementById('tab-' + target).classList.add('active');
    if (target === 'readwise') checkReadwiseAuth();
  });
});

// ---- URL Reading ----

// Extract Readwise Reader document ID from URL
function getReadwiseDocId(url) {
  const match = url.match(/read\.readwise\.io\/.*\/read\/([a-z0-9]+)$/i);
  return match ? match[1] : null;
}

// Extract readable text from HTML
function extractTextFromHtml(html, url) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove scripts, styles, nav, footer, ads
  doc.querySelectorAll('script, style, nav, footer, header, aside, .ad, .ads, .sidebar, .navigation, .menu, .comments, [role="navigation"], [role="banner"], [role="complementary"]').forEach(el => el.remove());

  // Try semantic selectors first
  const selectors = ['article', '[role="main"]', 'main', '.post-content', '.article-content', '.entry-content', '.content'];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el && el.textContent.trim().length > 200) {
      return el.textContent.replace(/\s+/g, ' ').trim();
    }
  }

  // Fallback: body text
  const body = doc.body;
  if (body) {
    return body.textContent.replace(/\s+/g, ' ').trim();
  }
  return '';
}

// Get page title from HTML
function extractTitleFromHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : '';
}

async function fetchAndReadUrl(url) {
  const statusEl = document.getElementById('url-status');
  const btn = document.getElementById('btn-read-url');

  btn.disabled = true;
  statusEl.textContent = 'Fetching article...';
  statusEl.className = 'url-status';

  try {
    // Check if it's a Readwise URL
    const rwDocId = getReadwiseDocId(url);
    if (rwDocId && api.getToken()) {
      statusEl.textContent = 'Fetching from Readwise...';
      const details = await api.getDocument(rwDocId);
      if (details && details.content) {
        const text = ReadwiseAPI.markdownToText(details.content);
        if (text) {
          openReader(text, details.title || 'Readwise Article');
          return;
        }
      }
      statusEl.textContent = 'No Readwise content, trying direct fetch...';
    }

    // Fetch via CORS proxy (try multiple)
    let html = null;
    const proxies = [
      (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
      (u) => 'https://corsproxy.io/?' + encodeURIComponent(u),
    ];

    for (const makeProxy of proxies) {
      try {
        statusEl.textContent = 'Fetching article...';
        const resp = await fetch(makeProxy(url));
        if (resp.ok) {
          html = await resp.text();
          break;
        }
      } catch (proxyErr) {
        // Try next proxy
      }
    }

    if (!html) throw new Error('Could not fetch the page. The site may block external access.');

    const text = extractTextFromHtml(html, url);

    if (!text || text.length < 50) {
      throw new Error('Could not extract readable text from this page');
    }

    const title = extractTitleFromHtml(html) || new URL(url).hostname;
    openReader(text, title);
  } catch (e) {
    statusEl.textContent = e.message;
    statusEl.className = 'url-status error';
  } finally {
    btn.disabled = false;
  }
}

document.getElementById('btn-read-url').addEventListener('click', () => {
  let url = document.getElementById('url-input').value.trim();
  if (!url) return;
  // Auto-add https:// if missing
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  document.getElementById('url-input').value = url;
  fetchAndReadUrl(url);
});

// Allow Enter key to submit URL
document.getElementById('url-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('btn-read-url').click();
  }
});

// ---- Paste & Read ----

document.getElementById('btn-read-paste').addEventListener('click', () => {
  const text = document.getElementById('paste-area').value.trim();
  if (!text) return;
  openReader(text, 'Pasted Text');
});

function openReader(text, title) {
  sessionStorage.setItem('readerText', text);
  sessionStorage.setItem('readerTitle', title);
  window.location.href = 'reader.html';
}

// ---- Readwise ----

function checkReadwiseAuth() {
  const token = api.getToken();
  if (token) {
    document.getElementById('rw-auth').classList.add('hidden');
    document.getElementById('rw-browser').classList.remove('hidden');
    loadArticles();
  } else {
    document.getElementById('rw-auth').classList.remove('hidden');
    document.getElementById('rw-browser').classList.add('hidden');
  }
}

document.getElementById('btn-connect-rw').addEventListener('click', openSettings);

document.querySelectorAll('.loc-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.loc-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentLocation = tab.dataset.location;
    nextPageCursor = null;
    document.getElementById('articles').innerHTML = '';
    loadArticles();
  });
});

document.getElementById('rw-search').addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    nextPageCursor = null;
    document.getElementById('articles').innerHTML = '';
    loadArticles();
  }, 400);
});

document.getElementById('btn-load-more').addEventListener('click', loadArticles);

async function loadArticles() {
  const loading = document.getElementById('rw-loading');
  const loadMore = document.getElementById('load-more');
  loading.classList.remove('hidden');
  loadMore.classList.add('hidden');

  try {
    const query = document.getElementById('rw-search').value.trim();
    let data;
    if (query) {
      data = await api.searchDocuments(query);
    } else {
      data = await api.listDocuments({ location: currentLocation, pageCursor: nextPageCursor });
    }

    const results = data.results || [];
    nextPageCursor = data.nextPageCursor || null;

    const container = document.getElementById('articles');
    results.forEach(doc => container.appendChild(createArticleItem(doc)));

    if (nextPageCursor) loadMore.classList.remove('hidden');

    if (results.length === 0 && !nextPageCursor && container.children.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:rgba(255,255,255,0.2)">No articles found</div>';
    }
  } catch (e) {
    showRwStatus(e.message, true);
  }

  loading.classList.add('hidden');
}

function createArticleItem(doc) {
  const item = document.createElement('div');
  item.className = 'article-item';
  const title = doc.title || 'Untitled';
  const author = doc.author || '';
  const wordCount = doc.word_count ? `${Math.round(doc.word_count / 1000)}k words` : '';
  const meta = [author, wordCount].filter(Boolean).join(' \u00B7 ');
  item.innerHTML = `
    <div class="article-title">${escapeHtml(title)}</div>
    <div class="article-meta">${escapeHtml(meta)}</div>
  `;
  item.addEventListener('click', () => openReadwiseArticle(doc));
  return item;
}

async function openReadwiseArticle(doc) {
  showRwStatus('Loading article...');
  try {
    const details = await api.getDocument(doc.id);
    if (!details) { showRwStatus('Article not found', true); return; }

    let text = '';
    if (details.content) {
      text = ReadwiseAPI.markdownToText(details.content);
    } else if (details.summary) {
      text = details.summary;
    }

    if (!text) { showRwStatus('No readable content', true); return; }
    openReader(text, doc.title || 'Readwise Article');
  } catch (e) {
    showRwStatus('Failed: ' + e.message, true);
  }
}

function showRwStatus(msg, isError = false) {
  const el = document.getElementById('rw-status');
  el.textContent = msg;
  el.className = 'status-bar' + (isError ? ' error' : '');
  if (!isError) setTimeout(() => { el.textContent = ''; }, 3000);
}

// ---- Settings ----

function openSettings() {
  document.getElementById('app').classList.remove('active');
  document.getElementById('settings-panel').classList.add('active');
  loadSettings();
}

function closeSettings() {
  document.getElementById('settings-panel').classList.remove('active');
  document.getElementById('app').classList.add('active');
}

function loadSettings() {
  const token = localStorage.getItem('readwiseToken') || '';
  document.getElementById('set-rw-token').value = token;

  const wpm = parseInt(localStorage.getItem('wpm')) || 300;
  document.getElementById('set-wpm').value = wpm;
  document.getElementById('set-wpm-val').textContent = wpm;

  const font = parseInt(localStorage.getItem('fontSize')) || 72;
  document.getElementById('set-font').value = font;
  document.getElementById('set-font-val').textContent = font;
}

document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('btn-close-settings').addEventListener('click', closeSettings);

document.getElementById('btn-save-token').addEventListener('click', () => {
  const token = document.getElementById('set-rw-token').value.trim();
  if (!token) { showTokenStatus('Enter a token', 'error'); return; }
  api.setToken(token);
  showTokenStatus('Saved!', 'success');
});

document.getElementById('btn-test-token').addEventListener('click', async () => {
  const token = document.getElementById('set-rw-token').value.trim();
  if (!token) { showTokenStatus('Enter a token first', 'error'); return; }
  showTokenStatus('Testing...');
  api.token = token;
  const valid = await api.validateToken();
  showTokenStatus(valid ? 'Connected!' : 'Invalid token', valid ? 'success' : 'error');
});

function showTokenStatus(msg, type = '') {
  const el = document.getElementById('token-status');
  el.textContent = msg;
  el.className = 'setting-status ' + type;
}

document.getElementById('set-wpm').addEventListener('input', (e) => {
  const v = e.target.value;
  document.getElementById('set-wpm-val').textContent = v;
  localStorage.setItem('wpm', v);
});

document.getElementById('set-font').addEventListener('input', (e) => {
  const v = e.target.value;
  document.getElementById('set-font-val').textContent = v;
  localStorage.setItem('fontSize', v);
});

document.getElementById('btn-change-pin').addEventListener('click', () => {
  closeSettings();
  document.getElementById('app').classList.remove('active');
  document.getElementById('lock-screen').classList.remove('hidden');
  pinBuffer = '';
  pinMode = 'change-old';
  newPinTemp = '';
  updatePinDots();
  document.getElementById('lock-subtitle').textContent = 'Enter Current PIN';
});

document.getElementById('btn-lock').addEventListener('click', lock);

document.getElementById('btn-reset-all').addEventListener('click', () => {
  if (confirm('Reset everything? This removes your PIN, Readwise token, and all settings.')) {
    localStorage.clear();
    sessionStorage.clear();
    location.reload();
  }
});

// ---- URL Parameter Handling ----

let pendingUrl = null;

function handlePendingUrl() {
  if (!pendingUrl) return;
  const url = pendingUrl;
  pendingUrl = null;

  // Pre-fill the URL input and auto-fetch
  document.getElementById('url-input').value = url;

  // Clean URL params from address bar
  history.replaceState(null, '', window.location.pathname);

  // Small delay so the UI renders first
  setTimeout(() => fetchAndReadUrl(url), 200);
}

// ---- Init ----

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function init() {
  // Check for ?url= parameter
  const params = new URLSearchParams(window.location.search);
  const urlParam = params.get('url');
  if (urlParam) {
    pendingUrl = urlParam;
  }

  if (!hasPinSet()) {
    pinMode = 'setup';
    document.getElementById('lock-subtitle').textContent = 'Choose a 4-digit PIN';
  } else if (isUnlocked()) {
    unlock();
  }
  // else: show lock screen (default), pendingUrl will be handled after PIN entry
}

// Register service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

init();
