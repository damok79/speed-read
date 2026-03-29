// Speed Read PWA - Readwise API Client (localStorage version)

class ReadwiseAPI {
  constructor() {
    this.baseUrl = 'https://readwise.io/api/v3';
    this.token = null;
  }

  getToken() {
    if (this.token) return this.token;
    this.token = localStorage.getItem('readwiseToken') || null;
    return this.token;
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('readwiseToken', token);
  }

  removeToken() {
    this.token = null;
    localStorage.removeItem('readwiseToken');
  }

  async request(endpoint, params = {}) {
    const token = this.getToken();
    if (!token) throw new Error('No Readwise token configured');

    const url = new URL(this.baseUrl + endpoint);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });

    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Token ${token}` },
    });

    if (!response.ok) {
      if (response.status === 401) throw new Error('Invalid Readwise token');
      throw new Error(`Readwise API error: ${response.status}`);
    }

    return response.json();
  }

  async listDocuments({ location = 'new', category, pageCursor } = {}) {
    const params = {};
    if (location) params.location = location;
    if (category) params.category = category;
    if (pageCursor) params.pageCursor = pageCursor;
    return this.request('/list/', params);
  }

  async getDocument(documentId) {
    const data = await this.request('/list/', { id: documentId });
    return data.results && data.results[0] ? data.results[0] : null;
  }

  async searchDocuments(query) {
    return this.request('/list/', { query });
  }

  async validateToken() {
    try {
      await this.request('/list/', { page_size: 1 });
      return true;
    } catch (e) {
      return false;
    }
  }

  static markdownToText(markdown) {
    if (!markdown) return '';
    return markdown
      .replace(/!\[.*?\]\(.*?\)/g, '')
      .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*{1,3}(.*?)\*{1,3}/g, '$1')
      .replace(/_{1,3}(.*?)_{1,3}/g, '$1')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^>\s+/gm, '')
      .replace(/^[-*_]{3,}\s*$/gm, '')
      .replace(/^[\s]*[-*+]\s+/gm, '')
      .replace(/^[\s]*\d+\.\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
