// Speed Read PWA - RSVP Engine (localStorage version)

class RSVPReader {
  constructor() {
    this.words = [];
    this.sentences = [];
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

  loadSettings() {
    const wpm = parseInt(localStorage.getItem('wpm'));
    if (wpm) this.wpm = wpm;
    const fontSize = parseInt(localStorage.getItem('fontSize'));
    if (fontSize) this.els.wordContainer.style.fontSize = fontSize + 'px';
    this.updateWpmDisplay();
  }

  loadContent() {
    const text = sessionStorage.getItem('readerText');
    const title = sessionStorage.getItem('readerTitle');
    if (text) {
      this.setText(text, title || 'Article');
    } else {
      this.showIdle();
    }
  }

  setText(text, title = '') {
    this.title = title;
    this.els.articleTitle.textContent = title;

    // Mark paragraph boundaries before collapsing whitespace
    text = text.replace(/\n{2,}/g, ' \u00B6 ');
    text = text.replace(/\s+/g, ' ').trim();
    this.words = text.split(' ').filter(w => w.length > 0);
    this.currentIndex = 0;

    // Build sentence index
    this.sentences = [0];
    for (let i = 0; i < this.words.length; i++) {
      const w = this.words[i];
      if (/[.!?]$/.test(w) && i + 1 < this.words.length) {
        this.sentences.push(i + 1);
      }
    }

    this.els.progressBar.max = this.words.length - 1;
    this.updateProgress();

    // Restore progress
    this.restoreProgress();
  }

  restoreProgress() {
    const key = 'progress_' + this.hashTitle(this.title);
    const saved = localStorage.getItem(key);
    let index = 0;
    if (saved && parseInt(saved) < this.words.length) {
      index = parseInt(saved);
    }
    this.currentIndex = index;
    this.displayWord(index);
    this.updateProgress();
  }

  saveProgress() {
    const key = 'progress_' + this.hashTitle(this.title);
    localStorage.setItem(key, this.currentIndex.toString());
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
    this.els.wordOrp.textContent = 'Tap play to start';
    this.els.wordAfter.textContent = '';
  }

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

    // Position so ORP letter aligns with guide lines at viewport center
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

  getWordDelay(word) {
    const baseDelay = 60000 / this.wpm;
    let multiplier = 1;
    if (word.length > 8) multiplier += 0.2;
    if (word.length > 12) multiplier += 0.2;
    const lastChar = word[word.length - 1];
    if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
      multiplier += 0.5;
    } else if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
      multiplier += 1.0;
    }
    if (word === '\u00B6') multiplier += 1.5;
    return baseDelay * multiplier;
  }

  play() {
    if (this.words.length === 0) return;
    if (this.currentIndex >= this.words.length - 1) this.currentIndex = 0;
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
    this.isPlaying ? this.pause() : this.play();
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
    localStorage.setItem('wpm', this.wpm.toString());
  }

  updateWpmDisplay() {
    this.els.wpmDisplay.textContent = this.wpm + ' wpm';
  }

  updateProgress() {
    this.els.progressBar.value = this.currentIndex;
    this.els.wordCount.textContent = (this.currentIndex + 1) + ' / ' + this.words.length;
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
    window.location.href = 'index.html';
  }

  bindEvents() {
    this.els.btnPlay.addEventListener('click', () => this.togglePlay());
    this.els.btnPrev.addEventListener('click', () => this.skipPrev());
    this.els.btnNext.addEventListener('click', () => this.skipNext());
    this.els.wpmDown.addEventListener('click', () => this.setWpm(this.wpm - 50));
    this.els.wpmUp.addEventListener('click', () => this.setWpm(this.wpm + 50));
    this.els.closeBtn.addEventListener('click', () => this.close());

    this.els.progressBar.addEventListener('input', (e) => {
      this.seekTo(parseInt(e.target.value));
    });

    // Keyboard controls (for iPad with keyboard, or desktop testing)
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
          this.pause();
          this.displayWord(0);
          break;
      }
    });

    // Tap center of screen to play/pause (touch-friendly)
    document.getElementById('display-area').addEventListener('click', (e) => {
      if (e.target.closest('#controls') || e.target.closest('#title-bar')) return;
      this.togglePlay();
    });
  }
}

// Check auth before allowing access
if (!sessionStorage.getItem('unlocked')) {
  window.location.href = 'index.html';
} else {
  const reader = new RSVPReader();
}
