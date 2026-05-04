import { getCachePolicy, makeApiCacheKey } from './apiCache';

const API_BASE = '/api';
const responseCache = new Map<string, { expiresAt: number; data: any }>();
const inFlightRequests = new Map<string, Promise<any>>();

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let token = localStorage.getItem('admin_token') || '';
  const cachePolicy = getCachePolicy(path, options);
  const cacheKey = makeApiCacheKey(path);

  if (cachePolicy.cacheable) {
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.data as T;

    const inFlight = inFlightRequests.get(cacheKey);
    if (inFlight) return inFlight as Promise<T>;
  }

  const doFetch = async (authToken: string) => {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...options?.headers,
      },
    });
    return res.json();
  };

  const run = async () => {
    let data = await doFetch(token);

    if (!data.success && data.error?.code === 'UNAUTHORIZED') {
      token = window.prompt('Admin token required:') || '';
      if (token) {
        localStorage.setItem('admin_token', token);
        data = await doFetch(token);
      }
    }

    if (!data.success) {
      throw new Error(data.error?.message || 'API request failed');
    }

    if (cachePolicy.cacheable) {
      responseCache.set(cacheKey, {
        data,
        expiresAt: Date.now() + cachePolicy.ttlMs,
      });
    }

    return data;
  };

  if (!cachePolicy.cacheable) return run();

  const promise = run().finally(() => {
    inFlightRequests.delete(cacheKey);
  });
  inFlightRequests.set(cacheKey, promise);
  return promise;
}

export const api = {
  // Health
  getHealth: () => request<any>('/health'),

  // Sources
  getSources: () => request<any>('/sources'),
  getSource: (id: string) => request<any>(`/sources/${id}`),
  createSource: (data: any) => request<any>('/sources', { method: 'POST', body: JSON.stringify(data) }),
  updateSource: (id: string, data: any) => request<any>(`/sources/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSource: (id: string) => request<any>(`/sources/${id}`, { method: 'DELETE' }),
  toggleSource: (id: string) => request<any>(`/sources/${id}/toggle`, { method: 'POST' }),
  detectSource: (url: string) => request<any>('/sources/detect', { method: 'POST', body: JSON.stringify({ url }) }),

  // Articles
  getArticles: (params?: { page?: number; limit?: number; sourceId?: string; status?: string; date?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.sourceId) qs.set('sourceId', params.sourceId);
    if (params?.status) qs.set('status', params.status);
    if (params?.date) qs.set('date', params.date);
    return request<any>(`/articles?${qs}`);
  },
  getArticleDates: (sourceId?: string) => {
    const qs = new URLSearchParams();
    if (sourceId) qs.set('sourceId', sourceId);
    return request<any>(`/articles/dates?${qs}`);
  },
  getArticle: (id: string) => request<any>(`/articles/${id}`),
  resetArticleSummary: (id: string) => request<any>(`/articles/${id}/reset-summary`, { method: 'POST' }),
  rescrapeArticle: (id: string) => request<any>(`/articles/${id}/rescrape`, { method: 'POST' }),
  deleteArticle: (id: string) => request<any>(`/articles/${id}`, { method: 'DELETE' }),

  // Digests
  getLatestDigest: (lang?: string) => request<any>(`/digests/latest?lang=${lang || 'vi'}`),
  getDigests: (page?: number) => request<any>(`/digests?page=${page || 1}`),
  getDigest: (id: string) => request<any>(`/digests/${id}`),
  deleteDigest: (id: string) => request<any>(`/digests/${id}`, { method: 'DELETE' }),

  // AI Providers
  getAiProviders: () => request<any>('/ai-providers'),
  getAiProvider: (id: string) => request<any>(`/ai-providers/${id}`),
  createAiProvider: (data: any) => request<any>('/ai-providers', { method: 'POST', body: JSON.stringify(data) }),
  updateAiProvider: (id: string, data: any) => request<any>(`/ai-providers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAiProvider: (id: string) => request<any>(`/ai-providers/${id}`, { method: 'DELETE' }),
  activateAiProvider: (id: string) => request<any>(`/ai-providers/${id}/activate`, { method: 'POST' }),
  testAiProvider: (id: string) => request<any>(`/ai-providers/${id}/test`, { method: 'POST' }),

  // Admin triggers
  triggerScrape: () => request<any>('/health/trigger/scrape', { method: 'POST' }),
  triggerSummarize: () => request<any>('/health/trigger/summarize', { method: 'POST' }),
  triggerDigest: () => request<any>('/health/trigger/digest', { method: 'POST' }),
};
