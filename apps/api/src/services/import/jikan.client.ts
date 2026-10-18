import { config } from '../../config/index.js';
import {
  ExternalProviderRateLimitError,
  ExternalProviderTimeoutError,
  ExternalProviderUnavailableError,
  ExternalResourceNotFoundError,
  BadRequestError,
} from '../../errors/index.js';
import { BoundedTtlCache } from './cache.js';
import { RequestThrottler } from './throttler.js';

export type UpstreamErrorCategory =
  | 'UPSTREAM_DNS_ERROR'
  | 'UPSTREAM_CONNECTION_ERROR'
  | 'UPSTREAM_TLS_ERROR'
  | 'UPSTREAM_TIMEOUT'
  | 'UPSTREAM_RATE_LIMITED'
  | 'UPSTREAM_UNAVAILABLE'
  | 'UPSTREAM_BAD_RESPONSE'
  | 'UPSTREAM_INVALID_PAYLOAD';

export interface UpstreamDiagnosticContext {
  requestId?: string;
}

/**
 * Classifies raw Node fetch, undici, or network errors into structured upstream categories.
 */
export function classifyNetworkError(err: unknown): {
  category: UpstreamErrorCategory;
  message: string;
  isTimeout: boolean;
  rawReason: string;
} {
  const errorObj = err as any;

  // 1. Explicit AbortError from AbortController timeout
  if (errorObj?.name === 'AbortError' || errorObj?.code === 'ABORT_ERR') {
    return {
      category: 'UPSTREAM_TIMEOUT',
      message: 'MyAnimeList API request timed out awaiting response.',
      isTimeout: true,
      rawReason: 'AbortError (timeout)',
    };
  }

  // 2. Trace Node fetch / undici error cause hierarchy
  const causes: any[] = [errorObj];
  let current = errorObj;
  while (current?.cause && causes.length < 5) {
    causes.push(current.cause);
    current = current.cause;
  }

  for (const c of causes) {
    const code = c?.code || c?.name;
    const msg = String(c?.message || '');

    // Timeout errors (ConnectTimeoutError, ETIMEDOUT, UND_ERR_CONNECT_TIMEOUT)
    if (
      code === 'UND_ERR_CONNECT_TIMEOUT' ||
      code === 'ETIMEDOUT' ||
      c?.name === 'ConnectTimeoutError' ||
      msg.includes('Connect Timeout Error') ||
      msg.includes('timed out')
    ) {
      return {
        category: 'UPSTREAM_TIMEOUT',
        message: 'Connection to MyAnimeList timed out. The upstream server is not responding.',
        isTimeout: true,
        rawReason: code || 'ETIMEDOUT',
      };
    }

    // DNS errors (ENOTFOUND, EAI_AGAIN)
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo')) {
      return {
        category: 'UPSTREAM_DNS_ERROR',
        message: 'Unable to resolve MyAnimeList service address (DNS lookup failed).',
        isTimeout: false,
        rawReason: code || 'ENOTFOUND',
      };
    }

    // Connection refused or unreachable (ECONNREFUSED, ECONNRESET, EHOSTUNREACH, ENETUNREACH)
    if (
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      code === 'EHOSTUNREACH' ||
      code === 'ENETUNREACH' ||
      msg.includes('No route to host') ||
      msg.includes('Connection refused')
    ) {
      return {
        category: 'UPSTREAM_CONNECTION_ERROR',
        message: 'Could not connect to MyAnimeList (server unreachable or connection refused).',
        isTimeout: false,
        rawReason: code || 'ECONNREFUSED',
      };
    }

    // TLS negotiation errors
    if (
      code === 'CERT_HAS_EXPIRED' ||
      code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
      code === 'ERR_TLS_CERT_ALTNAME_INVALID' ||
      code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
      msg.includes('SSL') ||
      msg.includes('TLS')
    ) {
      return {
        category: 'UPSTREAM_TLS_ERROR',
        message: 'Failed to establish secure TLS connection to MyAnimeList.',
        isTimeout: false,
        rawReason: code || 'TLS_ERROR',
      };
    }
  }

  return {
    category: 'UPSTREAM_UNAVAILABLE',
    message: 'MyAnimeList metadata service is temporarily unreachable.',
    isTimeout: false,
    rawReason: errorObj?.message || 'Network error',
  };
}

export interface MetadataClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  cacheMaxEntries?: number;
  minIntervalMs?: number;
  fetchFn?: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
}

export type JikanClientOptions = MetadataClientOptions;

export class MetadataClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly cache: BoundedTtlCache<unknown>;
  private readonly throttler: RequestThrottler;
  private readonly fetchFn: typeof fetch;
  private readonly sleepFn: (ms: number) => Promise<void>;

  constructor(options: MetadataClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? config.METADATA_API_BASE_URL ?? config.JIKAN_BASE_URL).replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? config.REQUEST_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? 2; // 1 initial + up to 2 retries = 3 total
    this.cache = new BoundedTtlCache(
      options.cacheTtlMs ?? config.JIKAN_CACHE_TTL_MS,
      options.cacheMaxEntries ?? config.JIKAN_CACHE_MAX_ENTRIES
    );
    this.throttler = new RequestThrottler(options.minIntervalMs ?? config.JIKAN_MIN_REQUEST_INTERVAL_MS);
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.sleepFn = options.sleepFn ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Constructs an upstream request URL safely using URL and URLSearchParams.
   * Defends against malformed paths, double-slashes, and unintended /v4 concatenation.
   */
  private buildRequestUrl(
    mediaType: 'anime' | 'manga',
    subPath?: string | number,
    queryParams?: Record<string, string | number | undefined>
  ): string {
    const cleanBase = this.baseUrl.replace(/\/+$/, '');
    const path = subPath !== undefined ? `${mediaType}/${subPath}` : mediaType;
    const url = new URL(`${cleanBase}/${path}`);

    if (queryParams) {
      for (const [key, value] of Object.entries(queryParams)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }

    return url.toString();
  }

  /**
   * Search anime or manga candidates via provider-neutral API.
   */
  async search(
    mediaType: 'anime' | 'manga',
    query: string,
    page = 1,
    limit = 10,
    context?: UpstreamDiagnosticContext
  ): Promise<any> {
    const trimmed = query.trim();
    if (!trimmed) {
      throw new BadRequestError('Search query cannot be empty');
    }

    const safeLimit = Math.min(Math.max(limit, 1), 25);
    const safePage = Math.max(page, 1);

    const cacheKey = `search:${mediaType}:${safePage}:${safeLimit}:${trimmed.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = this.buildRequestUrl(mediaType, undefined, {
      q: trimmed,
      page: safePage,
      limit: safeLimit,
    });
    const data = await this.fetchWithResilience(url, context);

    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * Fetch full metadata details for a given MAL ID.
   */
  async getDetail(
    mediaType: 'anime' | 'manga',
    id: number,
    context?: UpstreamDiagnosticContext
  ): Promise<any> {
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new BadRequestError('Invalid MyAnimeList ID');
    }

    const cacheKey = `detail:${mediaType}:${id}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = this.buildRequestUrl(mediaType, `${id}/full`);
    const data = await this.fetchWithResilience(url, context);

    this.cache.set(cacheKey, data);
    return data;
  }

  /**
   * Clears the in-memory cache.
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Test helper to inject a custom fetch implementation.
   */
  setFetchFn(fn: typeof fetch): void {
    (this as any).fetchFn = fn;
  }

  /**
   * Test helper to reset fetch implementation.
   */
  resetFetchFn(): void {
    (this as any).fetchFn = globalThis.fetch.bind(globalThis);
  }

  /**
   * Internal resilient fetch with timeout, rate limit handling, and bounded backoff.
   */
  private async fetchWithResilience(url: string, context?: UpstreamDiagnosticContext): Promise<any> {
    let attempt = 0;
    const startTime = Date.now();

    while (attempt <= this.maxRetries) {
      attempt++;

      // Apply server-side inter-request throttling
      await this.throttler.throttle();

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchFn(url, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            'User-Agent': 'AnimeManager/1.0 (Personal Media Library)',
          },
          signal: controller.signal,
          redirect: 'error', // Defend against SSRF via redirects
        });

        clearTimeout(timeoutId);

        // 1. Success
        if (response.ok) {
          let json: any;
          try {
            json = await response.json();
          } catch {
            throw new ExternalProviderUnavailableError(
              'MyAnimeList API returned a malformed response.',
              [{ category: 'UPSTREAM_BAD_RESPONSE', retryable: false }]
            );
          }

          if (!json || typeof json !== 'object') {
            throw new ExternalProviderUnavailableError(
              'MyAnimeList API returned an unexpected response structure.',
              [{ category: 'UPSTREAM_INVALID_PAYLOAD', retryable: false }]
            );
          }

          return json;
        }

        // 2. HTTP 404 (Not Found) - Do not retry
        if (response.status === 404) {
          throw new ExternalResourceNotFoundError(
            'The requested entry was not found on MyAnimeList.'
          );
        }

        // 3. HTTP 429 (Rate Limit) - Bounded retry
        if (response.status === 429) {
          if (attempt <= this.maxRetries) {
            const retryAfterHeader = response.headers?.get?.('Retry-After');
            let delayMs = 1000 * Math.pow(2, attempt - 1); // 1s, 2s

            if (retryAfterHeader) {
              const parsedSeconds = parseInt(retryAfterHeader, 10);
              if (!isNaN(parsedSeconds) && parsedSeconds > 0) {
                delayMs = Math.min(parsedSeconds * 1000, 5000); // clamp to 5s max
              }
            }

            await this.sleepFn(delayMs);
            continue;
          }

          throw new ExternalProviderRateLimitError(
            'MyAnimeList rate limit exceeded. Please wait a moment and try again.',
            [{ category: 'UPSTREAM_RATE_LIMITED', retryable: true }]
          );
        }

        // 4. HTTP 502 / 503 / 504 (Transient upstream server errors) - Bounded retry
        if (response.status === 502 || response.status === 503 || response.status === 504) {
          if (attempt <= this.maxRetries) {
            const delayMs = 500 * Math.pow(2, attempt - 1); // 500ms, 1000ms
            await this.sleepFn(delayMs);
            continue;
          }

          throw new ExternalProviderUnavailableError(
            `MyAnimeList service is temporarily unavailable (HTTP ${response.status}). Please try again shortly.`,
            [{ category: 'UPSTREAM_UNAVAILABLE', status: response.status, retryable: true }]
          );
        }

        // 5. Other 4xx Client Errors - Do not retry
        if (response.status >= 400 && response.status < 500) {
          throw new BadRequestError(
            `MyAnimeList API rejected the request with HTTP status ${response.status}.`
          );
        }

        // 6. Generic 5xx Server Error
        throw new ExternalProviderUnavailableError(
          `MyAnimeList service returned server error HTTP ${response.status}. Please try again shortly.`,
          [{ category: 'UPSTREAM_UNAVAILABLE', status: response.status, retryable: true }]
        );
      } catch (err: any) {
        clearTimeout(timeoutId);

        // Re-throw our typed domain errors directly
        if (
          err instanceof ExternalResourceNotFoundError ||
          err instanceof ExternalProviderRateLimitError ||
          err instanceof ExternalProviderUnavailableError ||
          err instanceof ExternalProviderTimeoutError ||
          err instanceof BadRequestError
        ) {
          throw err;
        }

        const classification = classifyNetworkError(err);
        const elapsed = Date.now() - startTime;

        if (config.NODE_ENV !== 'test') {
          console.error(
            `[Metadata Upstream Error] requestId=${context?.requestId || 'none'} category=${classification.category} attempt=${attempt}/${this.maxRetries + 1} elapsed=${elapsed}ms reason="${classification.rawReason}"`
          );
        }

        // Bounded retry for transient connection failures
        if (attempt <= this.maxRetries) {
          const delayMs = 500 * Math.pow(2, attempt - 1);
          await this.sleepFn(delayMs);
          continue;
        }

        if (classification.isTimeout) {
          throw new ExternalProviderTimeoutError(
            classification.message,
            [{ category: classification.category, reason: classification.rawReason, retryable: true }]
          );
        }

        throw new ExternalProviderUnavailableError(
          classification.message,
          [{ category: classification.category, reason: classification.rawReason, retryable: true }]
        );
      }
    }

    throw new ExternalProviderUnavailableError(
      'MyAnimeList API request failed after retry attempts.',
      [{ category: 'UPSTREAM_UNAVAILABLE', retryable: true }]
    );
  }
}

// Canonical exported singleton and backwards-compatible aliases
export { MetadataClient as JikanClient };
export const metadataClient = new MetadataClient();
export const jikanClient = metadataClient;
