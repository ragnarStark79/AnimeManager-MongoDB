import type {
  TitleCreateInput,
  TitleUpdateInput,
  CollectionCreateInput,
  CollectionUpdateInput,
  BookmarkCreateInput,
  BookmarkUpdateInput,
  ImportCommitInput,
  ImportSearchResponse,
  ImportDraft,
  ImportSearchResultItem,
  MediaType,
  BookmarkStatus,
} from '@animemanager/shared';

export type { ImportSearchResultItem, ImportDraft };

export interface SingleResponse<T> {
  data: T;
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  meta?: {
    requestId?: string;
    timestamp?: string;
  };
}

export interface TitleSummary {
  id: string;
  ownerId: string;
  mediaType: MediaType;
  englishTitle: string;
  originalTitle: string | null;
  synopsis: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  coverSourceType: string;
  releaseYear: number | null;
  publicationStatus: string | null;
  episodeCount: number | null;
  chapterCount: number | null;
  sourceScore: number | null;
  sourceRank: number | null;
  createdAt: string;
  updatedAt: string;
  bookmark: {
    id: string;
    status: BookmarkStatus;
    progress: number;
    progressUnit: string;
    progressTotal: number | null;
    personalRating: number | null;
  } | null;
}

export interface TitleDetail extends TitleSummary {
  background: string | null;
  startDate: string | null;
  endDate: string | null;
  sourcePopularity: number | null;
  aliases: Array<{ id: string; alias: string; languageCode: string | null; aliasType: string | null }>;
  genres: Array<{ id: string; name: string; slug: string }>;
  tags: Array<{ id: string; name: string; slug: string }>;
  collections: Array<{ id: string; name: string; icon: string | null; color: string | null }>;
  bookmark: {
    id: string;
    status: BookmarkStatus;
    progress: number;
    progressUnit: string;
    progressTotal: number | null;
    priority: number | null;
    personalRating: number | null;
    notes: string | null;
    startedAt: string | null;
    completedAt: string | null;
  } | null;
  externalSources: Array<{ id: string; provider: string; externalId: string; sourceUrl: string | null }>;
}

export interface CollectionSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  icon: string | null;
  color: string | null;
  sortMode: string;
  titleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CollectionDetail extends CollectionSummary {
  titles: Array<{
    id: string;
    englishTitle: string;
    originalTitle: string | null;
    mediaType: MediaType;
    coverUrl: string | null;
    position: number | null;
    addedAt: string;
  }>;
}

export interface BookmarkListItem {
  id: string;
  ownerId: string;
  titleId: string;
  status: BookmarkStatus;
  progress: number;
  progressUnit: string;
  progressTotal: number | null;
  priority: number | null;
  personalRating: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  title: {
    id: string;
    englishTitle: string;
    originalTitle: string | null;
    mediaType: MediaType;
    coverUrl: string | null;
    episodeCount: number | null;
    chapterCount: number | null;
  };
}

export class ApiError extends Error {
  statusCode: number;
  code: string;
  details?: unknown;
  requestId?: string;

  constructor(statusCode: number, code: string, message: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

// Token storage key
const TOKEN_STORAGE_KEY = 'animemanager_auth_token';

function parseJwtPayload(token: string): { exp?: number; sub?: string } | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwtPayload(token);
  if (!payload || !payload.exp) return false;
  // 10 second safety buffer before actual token expiration
  return payload.exp * 1000 <= Date.now() + 10000;
}

class ApiClient {
  private baseUrl: string;
  private token: string | null = null;
  private onUnauthorizedCallbacks: Set<() => void> = new Set();

  constructor() {
    this.baseUrl = (import.meta.env.VITE_API_BASE_URL as string) || '/api/v1';
    // Initialize token from localStorage; prune if expired
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(TOKEN_STORAGE_KEY);
      if (stored && isTokenExpired(stored)) {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        this.token = null;
      } else {
        this.token = stored || null;
      }
    }
  }

  setToken(token: string | null): void {
    this.token = token;
    if (typeof window !== 'undefined') {
      if (token && !isTokenExpired(token)) {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
  }

  getToken(): string | null {
    return this.token;
  }

  onUnauthorized(cb: () => void): () => void {
    this.onUnauthorizedCallbacks.add(cb);
    return () => this.onUnauthorizedCallbacks.delete(cb);
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers = new Headers(options.headers || {});

    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const res = await fetch(url, {
      ...options,
      headers,
    });

    if (res.status === 204) {
      return undefined as unknown as T;
    }

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      if (!res.ok) {
        throw new ApiError(
          res.status,
          'NETWORK_ERROR',
          `HTTP ${res.status}: Failed to parse JSON response from server`
        );
      }
      return undefined as unknown as T;
    }

    if (!res.ok) {
      const errObj = (json as { error?: { code?: string; message?: string; details?: unknown }; meta?: { requestId?: string } }) || {};
      const code = errObj.error?.code || 'UNKNOWN_ERROR';
      const message = errObj.error?.message || `Request failed with status ${res.status}`;
      const details = errObj.error?.details;
      const requestId = errObj.meta?.requestId;

      if (res.status === 401) {
        this.onUnauthorizedCallbacks.forEach((cb) => cb());
      }

      throw new ApiError(res.status, code, message, details, requestId);
    }

    return json as T;
  }

  // --- Titles ---
  titles = {
    list: (params?: {
      page?: number;
      pageSize?: number;
      search?: string;
      mediaType?: string;
      collectionId?: string;
      bookmarkStatus?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }): Promise<PaginatedResponse<TitleSummary>> => {
      const sp = new URLSearchParams();
      if (params?.page) sp.set('page', String(params.page));
      if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
      if (params?.search) sp.set('search', params.search);
      if (params?.mediaType && params.mediaType !== 'all') sp.set('mediaType', params.mediaType);
      if (params?.collectionId) sp.set('collectionId', params.collectionId);
      if (params?.bookmarkStatus && params.bookmarkStatus !== 'all') sp.set('bookmarkStatus', params.bookmarkStatus);
      if (params?.sortBy) sp.set('sortBy', params.sortBy);
      if (params?.sortOrder) sp.set('sortOrder', params.sortOrder);

      const qs = sp.toString();
      return this.request<PaginatedResponse<TitleSummary>>(`/titles${qs ? `?${qs}` : ''}`);
    },

    get: (id: string): Promise<SingleResponse<TitleDetail>> => {
      return this.request<SingleResponse<TitleDetail>>(`/titles/${id}`);
    },

    create: (data: TitleCreateInput): Promise<SingleResponse<TitleDetail>> => {
      return this.request<SingleResponse<TitleDetail>>('/titles', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: (id: string, data: TitleUpdateInput): Promise<SingleResponse<TitleDetail>> => {
      return this.request<SingleResponse<TitleDetail>>(`/titles/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: (id: string, confirm = true): Promise<void> => {
      return this.request<void>(`/titles/${id}?confirm=${confirm}`, {
        method: 'DELETE',
      });
    },
  };

  // --- Collections ---
  collections = {
    list: (): Promise<SingleResponse<CollectionSummary[]>> => {
      return this.request<SingleResponse<CollectionSummary[]>>('/collections');
    },

    get: (id: string): Promise<SingleResponse<CollectionDetail>> => {
      return this.request<SingleResponse<CollectionDetail>>(`/collections/${id}`);
    },

    create: (data: CollectionCreateInput): Promise<SingleResponse<CollectionSummary>> => {
      return this.request<SingleResponse<CollectionSummary>>('/collections', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: (id: string, data: CollectionUpdateInput): Promise<SingleResponse<CollectionSummary>> => {
      return this.request<SingleResponse<CollectionSummary>>(`/collections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: (id: string): Promise<void> => {
      return this.request<void>(`/collections/${id}`, {
        method: 'DELETE',
      });
    },

    addTitles: (id: string, titleIds: string[]): Promise<SingleResponse<{ addedCount: number; titleCount: number }>> => {
      return this.request<SingleResponse<{ addedCount: number; titleCount: number }>>(`/collections/${id}/titles`, {
        method: 'POST',
        body: JSON.stringify({ titleIds }),
      });
    },

    removeTitle: (id: string, titleId: string): Promise<void> => {
      return this.request<void>(`/collections/${id}/titles/${titleId}`, {
        method: 'DELETE',
      });
    },

    reorder: (id: string, order: Array<{ titleId: string; position: number }>): Promise<SingleResponse<{ updated: boolean }>> => {
      return this.request<SingleResponse<{ updated: boolean }>>(`/collections/${id}/order`, {
        method: 'PATCH',
        body: JSON.stringify({ order }),
      });
    },
  };

  // --- Bookmarks ---
  bookmarks = {
    list: (params?: {
      status?: string;
      mediaType?: string;
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }): Promise<PaginatedResponse<BookmarkListItem>> => {
      const sp = new URLSearchParams();
      if (params?.status && params.status !== 'all') sp.set('status', params.status);
      if (params?.mediaType && params.mediaType !== 'all') sp.set('mediaType', params.mediaType);
      if (params?.page) sp.set('page', String(params.page));
      if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
      if (params?.sortBy) sp.set('sortBy', params.sortBy);
      if (params?.sortOrder) sp.set('sortOrder', params.sortOrder);

      const qs = sp.toString();
      return this.request<PaginatedResponse<BookmarkListItem>>(`/bookmarks${qs ? `?${qs}` : ''}`);
    },

    create: (data: BookmarkCreateInput): Promise<SingleResponse<BookmarkListItem>> => {
      return this.request<SingleResponse<BookmarkListItem>>('/bookmarks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },

    update: (id: string, data: BookmarkUpdateInput): Promise<SingleResponse<BookmarkListItem>> => {
      return this.request<SingleResponse<BookmarkListItem>>(`/bookmarks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },

    delete: (id: string): Promise<void> => {
      return this.request<void>(`/bookmarks/${id}`, {
        method: 'DELETE',
      });
    },

    upsertTitleBookmark: (titleId: string, data: Partial<BookmarkCreateInput>): Promise<SingleResponse<unknown>> => {
      return this.request<SingleResponse<unknown>>(`/titles/${titleId}/bookmark`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
  };

  // --- Import ---
  import = {
    search: (query: { q: string; type: 'anime' | 'manga'; page?: number; limit?: number }): Promise<SingleResponse<ImportSearchResponse['items']> | ImportSearchResponse> => {
      const sp = new URLSearchParams({
        q: query.q,
        type: query.type,
      });
      if (query.page) sp.set('page', String(query.page));
      if (query.limit) sp.set('limit', String(query.limit));

      return this.request<SingleResponse<ImportSearchResponse['items']> | ImportSearchResponse>(`/import/jikan/search?${sp.toString()}`);
    },

    preview: (params: { url?: string; id?: number; type?: 'anime' | 'manga' }): Promise<SingleResponse<ImportDraft>> => {
      const sp = new URLSearchParams();
      if (params.url) sp.set('url', params.url);
      if (params.id) sp.set('id', String(params.id));
      if (params.type) sp.set('type', params.type);

      return this.request<SingleResponse<ImportDraft>>(`/import/preview?${sp.toString()}`);
    },

    commit: (input: ImportCommitInput): Promise<SingleResponse<TitleDetail>> => {
      return this.request<SingleResponse<TitleDetail>>('/import/commit', {
        method: 'POST',
        body: JSON.stringify(input),
      });
    },
  };

  // --- Export ---
  export = {
    jsonUrl: (): string => `${this.baseUrl}/export/json`,
    csvUrl: (): string => `${this.baseUrl}/export/csv`,

    getJson: async (): Promise<unknown> => {
      return this.request<unknown>('/export/json');
    },

    getCsv: async (): Promise<string> => {
      const url = `${this.baseUrl}/export/csv`;
      const headers = new Headers();
      if (this.token) {
        headers.set('Authorization', `Bearer ${this.token}`);
      }
      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new ApiError(res.status, 'EXPORT_FAILED', `Failed to export CSV: ${res.statusText}`);
      }
      return res.text();
    },
  };

  // --- Auth ---
  auth = {
    getDevSession: async (): Promise<{ token: string; ownerId: string; email: string; expiresIn: number; mode: string }> => {
      const res = await this.request<SingleResponse<{ token: string; ownerId: string; email: string; expiresIn: number; mode: string }>>('/auth/dev-session');
      return res.data;
    },
  };
}

export const api = new ApiClient();
