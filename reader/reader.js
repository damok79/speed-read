// Speed Read - RSVP Engine

class RSVPReader {
  constructor() {
    this.words = [];
    this.sentences = []; // indices of sentence starts
    this.currentIndex = 0;
    this.wpm = 300;
    this.isPlaying = false;
    this.timer = null;
    this.title = '';

    this.els = {
      wordBefore: document.getElementById('word-before'),
      wordOrp: document.getElementById('word-orp'),
      wordAfter: document.getElementById('word-after'),
      wordContainer: document.getElementById('word-container'),
      btnPlay: document.getElementById('btn-play'),
      btnPrev: document.getElementById('btn-prev'),
      btnNext: document.getElementById('btn-next'),
      wpmDisplay: document.getElementById('wpm-display'),
      wpmDown: document.getElementById('wpm-down'),
      wpmUp: document.getElementById('wpm-up'),
      progressBar: document.getElementById('progress-bar'),
      wordCount: document.getElementById('word-count'),
      closeBtn: document.getElementById('close-btn'),
      articleTitle: document.getElementById('article-title'),
    };

    this.bindEvents();
    this.loadSettings();
    this.loadContent();
  }

  async loadSettings() {
    try {
      const data = await chrome.storage.sync.get(['wpm', 'fontSize']);
      if (data.wpm) this.wpm = data.wpm;
      if (data.fontSize) {
        document.getElementById('word-container').style.fontSize = data.fontSize + 'px';
      }
      this.updateWpmDisplay();
    } catch (e) {
      // Running outside extension context (testing)
    }
  }

  async loadContent() {
    // Get text from URL params or chrome storage
    const params = new URLSearchParams(window.location.search);
    const source = params.get('source');

    try {
      if (source === 'page') {
        // Content was stored by background script
        const data = await chrome.storage.local.get(['readerText', 'readerTitle']);
        if (data.readerText) {
          this.setText(data.readerText, data.readerTitle || 'Current Page');
        }
      } else if (source === 'readwise') {
        const data = await chrome.storage.local.get(['readerText', 'readerTitle']);
        if (data.readerText) {
          this.setText(data.readerText, data.readerTitle || 'Readwise Article');
        }
      }
    } catch (e) {
      // Testing mode - show idle state
      this.showIdle();
    }
  }

  async setText(text, title = '') {
    this.title = title;
    this.els.articleTitle.textContent = title;

    // Mark paragraph boundaries before collapsing whitespace
    text = text.replace(/\n{2,}/g, ' \u00B6 '); // pilcrow as paragraph marker
    text = text.replace(/\s+/g, ' ').trim();
    this.words = text.split(' ').filter(w => w.length > 0);
    this.currentIndex = 0;

    // Build sentence index (for skip forward/back)
    this.sentences = [0];
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i];
      if (/[.!?]$/.test(w) && i + 1 < this.words.length) {
        this.sentences.push(i + 1);
      }
    }

    this.els.progressBar.max = this.words.length - 1;
    this.updateProgress();

    // Restore progress or start from beginning
    await this.restoreProgress();
  }

  async restoreProgress() {
    let index = 0;
    try {
      const key = 'progress_' + this.hashTitle(this.title);
      const data = await chrome.storage.local.get([key]);
      if (data[key] && data[key] < this.words.length) {
        index = data[key];
      }
    } catch (e) {}
    this.currentIndex = index;
    this.displayWord(index);
    this.updateProgress();
  }

  async saveProgress() {
    try {
      const key = 'progress_' + this.hashTitle(this.title);
      await chrome.storage.local.set({ [key]: this.currentIndex });
    } catch (e) {}
  }

  hashTitle(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  }

  showIdle() {
    this.els.wordContainer.classList.add('idle');
    this.els.wordBefore.textContent = '';
    this.els.wordOrp.textContent = 'Press Space to start';
    this.els.wordAfter.textContent = '';
  }

  // Calculate ORP (Optimal Recognition Point) index
  // Roughly at 33% of word length, biased toward the start
  getOrpIndex(word) {
    const len = word.length;
    if (len <= 1) return 0;
    if (len <= 3) return 1;
    if (len <= 5) return 1;
    if (len <= 9) return 2;
    if (len <= 13) return 3;
    return Math.floor(len * 0.3);
  }

  displayWord(index) {
    if (index < 0 || index >= this.words.length) return;

    // Skip paragraph markers — show a brief blank
    if (this.words[index] === '\u00B6') {
      this.els.wordBefore.textContent = '';
      this.els.wordOrp.textContent = '';
      this.els.wordAfter.textContent = '';
      this.currentIndex = index;
      this.updateProgress();
      return;
    }

    this.els.wordContainer.classList.remove('idle');
    const word = this.words[index];
    const orpIdx = this.getOrpIndex(word);

    this.els.wordBefore.textContent = word.substring(0, orpIdx);
    this.els.wordOrp.textContent = word[orpIdx];
    this.els.wordAfter.textContent = word.substring(orpIdx + 1);

    // Position so ORP letter aligns with the guide lines at viewport center
    requestAnimationFrame(() => {
      const screenCenter = window.innerWidth / 2;
      const beforeW = this.els.wordBefore.offsetWidth;
      const orpW = this.els.wordOrp.offsetWidth;
      const left = screenCenter - beforeW - (orpW / 2);
      this.els.wordContainer.style.left = left + 'px';
      this.els.wordContainer.style.right = 'auto';
    });

    this.currentIndex = index;
    this.updateProgress();
  }

  // Calculate delay for current word (ms)
  getWordDelay(word) {
    const baseDelay = 60000 / this.wpm;
    let multiplier = 1;

    // Longer words need more time
    if (word.length > 8) multiplier += 0.2;
    if (word.length > 12) multiplier += 0.2;

    // Punctuation pauses
    const lastChar = word[word.length - 1];
    if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
      multiplier += 0.5;
    } else if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
      multiplier += 1.0;
    }

    // Paragraph break marker
    if (word === '\u00B6') {
      multiplier += 1.5;
    }

    return baseDelay * multiplier;
  }

  play() {
    if (this.words.length === 0) return;
    if (this.currentIndex >= this.words.length - 1) {
      this.currentIndex = 0;
    }

    this.isPlaying = true;
    this.els.btnPlay.innerHTML = '&#9646;&#9646;';
    this.scheduleNext();
  }

  pause() {
    this.isPlaying = false;
    this.els.btnPlay.innerHTML = '&#9654;';
    clearTimeout(this.timer);
    this.saveProgress();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  scheduleNext() {
    if (!this.isPlaying) return;

    const word = this.words[this.currentIndex];
    const delay = this.getWordDelay(word);

    this.timer = setTimeout(() => {
      this.currentIndex++;
      if (this.currentIndex >= this.words.length) {
        this.pause();
        this.currentIndex = this.words.length - 1;
        return;
      }
      this.displayWord(this.currentIndex);
      this.scheduleNext();
    }, delay);
  }

  skipPrev() {
    this.pause();
    // Find previous sentence start
    for (let i = this.sentences.length - 1; i >= 0; i--) {
      if (this.sentences[i] < this.currentIndex - 1) {
        this.displayWord(this.sentences[i]);
        return;
      }
    }
    this.displayWord(0);
  }

  skipNext() {
    this.pause();
    // Find next sentence start
    for (let i = 0; i < this.sentences.length; i++) {
      if (this.sentences[i] > this.currentIndex) {
        this.displayWord(this.sentences[i]);
        return;
      }
    }
  }

  setWpm(wpm) {
    this.wpm = Math.max(100, Math.min(1200, wpm));
    this.updateWpmDisplay();
    try {
      chrome.storage.sync.set({ wpm: this.wpm });
    } catch (e) {}
  }

  updateWpmDisplay() {
    this.els.wpmDisplay.textContent = this.wpm + ' wpm';
  }

  updateProgress() {
    this.els.progressBar.value = this.currentIndex;
    this.els.wordCount.textContent =
      (this.currentIndex + 1) + ' / ' + this.words.length;
  }

  seekTo(index) {
    const wasPlaying = this.isPlaying;
    this.pause();
    this.currentIndex = Math.max(0, Math.min(this.words.length - 1, index));
    this.displayWord(this.currentIndex);
    if (wasPlaying) this.play();
  }

  close() {
    this.pause();
    this.saveProgress();
    window.close();
  }

  bindEvents() {
    // Button controls
    this.els.btnPlay.addEventListener('click', () => this.togglePlay());
    this.els.btnPrev.addEventListener('click', () => this.skipPrev());
    this.els.btnNext.addEventListener('click', () => this.skipNext());
    this.els.wpmDown.addEventListener('click', () => this.setWpm(this.wpm - 50));
    this.els.wpmUp.addEventListener('click', () => this.setWpm(this.wpm + 50));
    this.els.closeBtn.addEventListener('click', () => this.close());

    // Progress bar seek
    this.els.progressBar.addEventListener('input', (e) => {
      this.seekTo(parseInt(e.target.value));
    });

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          this.skipPrev();
          break;
        case 'ArrowRight':
          e.preventDefault();
          this.skipNext();
          break;
        case 'ArrowUp':
          e.preventDefault();
          this.setWpm(this.wpm + 50);
          break;
        case 'ArrowDown':
          e.preventDefault();
          this.setWpm(this.wpm - 50);
          break;
        case 'Escape':
          this.close();
          break;
        case 'KeyR':
          // Reset to beginning
          this.pause();
          this.displayWord(0);
          break;
      }
    });
  }
}

// Initialize
const reader = new RSVPReader();

// Allow external text injection (for testing / direct use)
window.setReaderText = (text, title) => reader.setText(text, title);
