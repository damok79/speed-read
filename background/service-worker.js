// Speed Read - Background Service Worker

// Handle extension icon click shortcut command
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'activate-speed-read') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      await extractAndRead(tab.id);
    }
  }
});

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'readCurrentPage') {
    handleReadCurrentPage(msg.tabId).then(sendResponse);
    return true;
  }

  if (msg.action === 'readText') {
    handleReadText(msg.text, msg.title).then(sendResponse);
    return true;
  }
});

async function handleReadCurrentPage(tabId) {
  try {
    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/content.js'],
    });

    // Extract text
    const [result] = await chrome.tabs.sendMessage(tabId, { action: 'extractText' })
      .then(r => [r])
      .catch(() => [null]);

    if (!result || !result.text) {
      return { error: 'Could not extract text from this page' };
    }

    // Store text and open reader
    await chrome.storage.local.set({
      readerText: result.text,
      readerTitle: result.title,
    });

    // Open reader in new tab
    await chrome.tabs.create({
      url: chrome.runtime.getURL('reader/reader.html?source=page'),
    });

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function handleReadText(text, title) {
  try {
    await chrome.storage.local.set({
      readerText: text,
      readerTitle: title || 'Article',
    });

    await chrome.tabs.create({
      url: chrome.runtime.getURL('reader/reader.html?source=readwise'),
    });

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

async function extractAndRead(tabId) {
  await handleReadCurrentPage(tabId);
}
