// Speed Read - Content Script
// Extracts clean readable text from the current page

(function () {
  if (window.__speedReadInjected) return;
  window.__speedReadInjected = true;
  function extractText() {
    // Try to find the main article content
    const selectors = [
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.content',
      '#content',
      '.post-body',
      '.story-body',
    ];

    let contentEl = null;

    // First check if user has selected text
    const selection = window.getSelection().toString().trim();
    if (selection.length > 50) {
      return { text: selection, title: document.title };
    }

    // Try semantic selectors
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 200) {
        contentEl = el;
        break;
      }
    }

    // Fallback: use body but try to strip nav/header/footer
    if (!contentEl) {
      contentEl = document.body.cloneNode(true);

      // Remove non-content elements
      const removeSelectors = [
        'nav', 'header', 'footer', 'aside', 'script', 'style', 'noscript',
        '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
        '.sidebar', '.nav', '.menu', '.footer', '.header', '.ad',
        '.advertisement', '.social-share', '.comments', '.related',
      ];

      for (const sel of removeSelectors) {
        contentEl.querySelectorAll(sel).forEach(el => el.remove());
      }
    }

    // Extract text, preserving paragraph breaks
    let text = '';
    const blocks = contentEl.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote, td');

    if (blocks.length > 0) {
      text = Array.from(blocks)
        .map(el => el.innerText.trim())
        .filter(t => t.length > 0)
        .join('\n\n');
    } else {
      text = contentEl.innerText;
    }

    // Clean up
    text = text
      .replace(/\t/g, ' ')
      .replace(/ {2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return {
      text: text,
      title: document.title,
    };
  }

  // Listen for extraction request from background script
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'extractText') {
      const result = extractText();
      sendResponse(result);
    }
    return true;
  });
})();
