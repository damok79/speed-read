// Speed Read - Options Page

const api = new ReadwiseAPI();

const els = {
  token: document.getElementById('readwise-token'),
  saveToken: document.getElementById('save-token'),
  testToken: document.getElementById('test-token'),
  tokenStatus: document.getElementById('token-status'),
  defaultWpm: document.getElementById('default-wpm'),
  wpmValue: document.getElementById('wpm-value'),
  fontSize: document.getElementById('font-size'),
  fontValue: document.getElementById('font-value'),
};

// Load saved settings
async function loadSettings() {
  const data = await chrome.storage.sync.get([
    'readwiseToken', 'wpm', 'fontSize'
  ]);

  if (data.readwiseToken) {
    els.token.value = data.readwiseToken;
  }

  if (data.wpm) {
    els.defaultWpm.value = data.wpm;
    els.wpmValue.textContent = data.wpm;
  }

  if (data.fontSize) {
    els.fontSize.value = data.fontSize;
    els.fontValue.textContent = data.fontSize;
  }
}

// Save token
els.saveToken.addEventListener('click', async () => {
  const token = els.token.value.trim();
  if (!token) {
    showTokenStatus('Please enter a token', 'error');
    return;
  }

  await api.setToken(token);
  showTokenStatus('Token saved!', 'success');
});

// Test token
els.testToken.addEventListener('click', async () => {
  const token = els.token.value.trim();
  if (!token) {
    showTokenStatus('Please enter a token first', 'error');
    return;
  }

  showTokenStatus('Testing...');
  api.token = token;

  const valid = await api.validateToken();
  if (valid) {
    showTokenStatus('Connection successful!', 'success');
  } else {
    showTokenStatus('Invalid token. Check and try again.', 'error');
  }
});

function showTokenStatus(msg, type = '') {
  els.tokenStatus.textContent = msg;
  els.tokenStatus.className = 'status ' + type;
}

// WPM slider
els.defaultWpm.addEventListener('input', async () => {
  const wpm = parseInt(els.defaultWpm.value);
  els.wpmValue.textContent = wpm;
  await chrome.storage.sync.set({ wpm });
});

// Font size slider
els.fontSize.addEventListener('input', async () => {
  const size = parseInt(els.fontSize.value);
  els.fontValue.textContent = size;
  await chrome.storage.sync.set({ fontSize: size });
});

// Init
loadSettings();
