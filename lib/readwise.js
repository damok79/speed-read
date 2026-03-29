// Speed Read - Readwise Reader API Client

class ReadwiseAPI {
  constructor() {
    this.baseUrl = 'https://readwise.io/api/v3';
    this.token = null;
  }

  async getToken() {
    if (this.token) return this.token;
    const data = await chrome.storage.sync.get(['readwiseToken']);
    this.token = data.readwiseToken || null;
    return this.token;
  }

  async setToken(token) {
    this.token = token;
    await chrome.storage.sync.set({ readwiseToken: token });
  }

  async request(endpoint, params = {}) {
    const token = await this.getToken();
    if (!token) throw new Error('No Readwise token configured');

    const url = new URL(this.baseUrl + endpoint);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Token ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('Invalid Readwise token');
      throw new Error(`Readwise API error: ${response.status}`);
    }

    return response.json();
  }

  // List documents from Reader
  async listDocuments({ location = 'new', category, pageCursor } = {}) {
    const params = {};
    if (location) params.location = location;
    if (category) params.category = category;
    if (pageCursor) params.pageCursor = pageCursor;

    return this.request('/list/', params);
  }

  // Get document details with content
  async getDocument(documentId) {
    const data = await this.request('/list/', { id: documentId });
    return data.results && data.results[0] ? data.results[0] : null;
  }

  // Search documents
  async searchDocuments(query) {
    return this.request('/list/', { query });
  }

  // Validate token
  async validateToken() {
    try {
      await this.request('/list/', { page_size: 1 });
      return true;
    } catch (e) {
      return false;
    }
  }

  // Convert markdown content to plain text for RSVP
  static markdownToText(markdown) {
    if (!markdown) return '';

    return markdown
      // Remove images
      .replace(/!\[.*?\]\(.*?\)/g, '')
      // Convert links to just text
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      // Remove headers markers
      .replace(/^#{1,6}\s+/gm, '')
      // Remove bold/italic
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
      // Remove code blocks
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      // Remove blockquotes
      .replace(/^>\s+/gm, '')
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, '')
      // Remove list markers
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      // Clean up whitespace
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.ReadwiseAPI = ReadwiseAPI;
}
