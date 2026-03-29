// Speed Read - Popup Script

const api = new ReadwiseAPI();
let currentLocation = 'new';
let nextPageCursor = null;
let searchTimeout = null;

// DOM elements
const els = {
  tabs: document.querySelectorAll('.tab'),
  tabPage: document.getElementById('tab-page'),
  tabReadwise: document.getElementById('tab-readwise'),
  readPageBtn: document.getElementById('read-page-btn'),
  settingsBtn: document.getElementById('settings-btn'),
  readwiseAuth: document.getElementById('readwise-auth'),
  readwiseBrowser: document.getElementById('readwise-browser'),
  connectBtn: document.getElementById('connect-readwise-btn'),
  searchInput: document.getElementById('search-input'),
  locTabs: document.querySelectorAll('.loc-tab'),
  articles: document.getElementById('articles'),
  loading: document.getElementById('loading'),
  loadMore: document.getElementById('load-more'),
  statusBar: document.getElementById('status-bar'),
};

// Tab switching
els.tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const target = tab.dataset.tab;
    if (target === 'page') {
      els.tabPage.classList.add('active');
    } else {
      els.tabReadwise.classList.add('active');
      checkReadwiseAuth();
    }
  });
});

// Extract Readwise Reader document ID from URL if on a Reader page
function getReadwiseDocId(url) {
  // Matches URLs like https://read.readwise.io/.../read/DOCUMENT_ID
  const match = url.match(/read\.readwise\.io\/.*\/read\/([a-z0-9]+)$/i);
  return match ? match[1] : null;
}

// Read current page
els.readPageBtn.addEventListener('click', async () => {
  els.readPageBtn.disabled = true;
  els.readPageBtn.querySelector('span:last-child').textContent = 'Extracting...';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // If we're on a Readwise Reader page, fetch via API for clean content
    const tabUrl = tab.url || '';
    const rwDocId = getReadwiseDocId(tabUrl);
    const hasToken = !!(await api.getToken());
    console.log('[SpeedRead] URL:', tabUrl, '| DocID:', rwDocId, '| Token:', hasToken);

    if (rwDocId && hasToken) {
      try {
        els.readPageBtn.querySelector('span:last-child').textContent = 'Fetching from Readwise...';
        const details = await api.getDocument(rwDocId);
        console.log('[SpeedRead] API response:', details ? `"${details.title}" (${details.content?.length || 0} chars)` : 'null');

        if (details && details.content) {
          const text = ReadwiseAPI.markdownToText(details.content);
          const response = await chrome.runtime.sendMessage({
            action: 'readText',
            text: text,
            title: details.title || 'Readwise Article',
          });

          if (response.error) {
            showStatus(response.error, true);
          } else {
            window.close();
            return;
          }
        } else {
          showStatus('No content found via API, extracting from page...', false);
        }
      } catch (apiErr) {
        console.error('[SpeedRead] Readwise API error:', apiErr);
        showStatus('API error: ' + apiErr.message, true);
        els.readPageBtn.disabled = false;
        els.readPageBtn.querySelector('span:last-child').textContent = 'Speed Read This Page';
        return;
      }
    } else {
      console.log('[SpeedRead] Skipping Readwise API path');
    }

    const response = await chrome.runtime.sendMessage({
      action: 'readCurrentPage',
      tabId: tab.id,
    });

    if (response.error) {
      showStatus(response.error, true);
    } else {
      window.close();
    }
  } catch (e) {
    showStatus('Failed to extract text: ' + e.message, true);
  }

  els.readPageBtn.disabled = false;
  els.readPageBtn.querySelector('span:last-child').textContent = 'Speed Read This Page';
});

// Settings
els.settingsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Readwise auth check
async function checkReadwiseAuth() {
  const token = await api.getToken();
  if (token) {
    els.readwiseAuth.classList.add('hidden');
    els.readwiseBrowser.classList.remove('hidden');
    loadArticles();
  } else {
    els.readwiseAuth.classList.remove('hidden');
    els.readwiseBrowser.classList.add('hidden');
  }
}

// Connect Readwise
els.connectBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// Location tabs
els.locTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    els.locTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentLocation = tab.dataset.location;
    nextPageCursor = null;
    els.articles.innerHTML = '';
    loadArticles();
  });
});

// Search
els.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    nextPageCursor = null;
    els.articles.innerHTML = '';
    loadArticles();
  }, 400);
});

// Load articles
async function loadArticles() {
  els.loading.classList.remove('hidden');
  els.loadMore.classList.add('hidden');

  try {
    const query = els.searchInput.value.trim();
    let data;

    if (query) {
      data = await api.searchDocuments(query);
    } else {
      data = await api.listDocuments({
        location: currentLocation,
        pageCursor: nextPageCursor,
      });
    }

    const results = data.results || [];
    nextPageCursor = data.nextPageCursor || null;

    results.forEach(doc => {
      els.articles.appendChild(createArticleItem(doc));
    });

    if (nextPageCursor) {
      els.loadMore.classList.remove('hidden');
    }

    if (results.length === 0 && !nextPageCursor) {
      els.articles.innerHTML = '<div style="text-align:center;padding:20px;color:rgba(255,255,255,0.3)">No articles found</div>';
    }
  } catch (e) {
    showStatus('Failed to load articles: ' + e.message, true);
  }

  els.loading.classList.add('hidden');
}

// Load more button
els.loadMore.addEventListener('click', loadArticles);

// Create article list item
function createArticleItem(doc) {
  const item = document.createElement('div');
  item.className = 'article-item';

  const title = doc.title || 'Untitled';
  const author = doc.author || '';
  const wordCount = doc.word_count ? `${Math.round(doc.word_count / 1000)}k words` : '';
  const meta = [author, wordCount].filter(Boolean).join(' · ');

  item.innerHTML = `
    <div class="article-title">${escapeHtml(title)}</div>
    <div class="article-meta">${escapeHtml(meta)}</div>
  `;

  item.addEventListener('click', () => openReadwiseArticle(doc));
  return item;
}

// Open a Readwise article in the reader
async function openReadwiseArticle(doc) {
  showStatus('Loading article...');

  try {
    // Get full document with content
    const details = await api.getDocument(doc.id);
    if (!details) {
      showStatus('Article not found', true);
      return;
    }

    let text = '';
    if (details.content) {
      text = ReadwiseAPI.markdownToText(details.content);
    } else if (details.summary) {
      text = details.summary;
    }

    if (!text) {
      showStatus('No readable content found', true);
      return;
    }

    // Send to reader via background script
    const response = await chrome.runtime.sendMessage({
      action: 'readText',
      text: text,
      title: doc.title || 'Readwise Article',
    });

    if (response.error) {
      showStatus(response.error, true);
    } else {
      window.close();
    }
  } catch (e) {
    showStatus('Failed to load article: ' + e.message, true);
  }
}

function showStatus(msg, isError = false) {
  els.statusBar.textContent = msg;
  els.statusBar.className = isError ? 'error' : '';
  if (!isError) {
    setTimeout(() => { els.statusBar.textContent = ''; }, 3000);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// Init
checkReadwiseAuth();
