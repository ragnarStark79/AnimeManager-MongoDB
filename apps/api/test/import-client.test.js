import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MetadataClient, JikanClient, classifyNetworkError } from '../dist/services/import/jikan.client.js';
import { BoundedTtlCache } from '../dist/services/import/cache.js';
import { RequestThrottler } from '../dist/services/import/throttler.js';
import {
  ExternalProviderRateLimitError,
  ExternalProviderTimeoutError,
  ExternalProviderUnavailableError,
  ExternalResourceNotFoundError,
  BadRequestError,
} from '../dist/errors/index.js';

test('JikanClient: Successful search and detail calls return data', async () => {
  const mockPayload = {
    data: {
      mal_id: 5114,
      title: 'Fullmetal Alchemist: Brotherhood',
      type: 'TV',
    },
  };

  const client = new JikanClient({
    minIntervalMs: 0,
    fetchFn: async () =>
      new Response(JSON.stringify(mockPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  const detail = await client.getDetail('anime', 5114);
  assert.equal(detail.data.mal_id, 5114);
  assert.equal(detail.data.title, 'Fullmetal Alchemist: Brotherhood');

  const search = await client.search('anime', 'Fullmetal');
  assert.equal(search.data.mal_id, 5114);
});

test('JikanClient: Handles HTTP 429 and retries with Retry-After header', async () => {
  let attempts = 0;
  const sleepCalls = [];

  const client = new JikanClient({
    maxRetries: 2,
    minIntervalMs: 0,
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    fetchFn: async () => {
      attempts++;
      if (attempts === 1) {
        return new Response(JSON.stringify({ error: 'Rate limit' }), {
          status: 429,
          headers: { 'Retry-After': '2' },
        });
      }
      return new Response(JSON.stringify({ data: { mal_id: 100 } }), { status: 200 });
    },
  });

  const result = await client.getDetail('anime', 100);
  assert.equal(result.data.mal_id, 100);
  assert.equal(attempts, 2);
  assert.equal(sleepCalls.length, 1);
  assert.equal(sleepCalls[0], 2000); // 2 seconds from Retry-After
});

test('JikanClient: Throws ExternalProviderRateLimitError when 429 persists past max retries', async () => {
  let attempts = 0;

  const client = new JikanClient({
    maxRetries: 2,
    minIntervalMs: 0,
    sleepFn: async () => {},
    fetchFn: async () => {
      attempts++;
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
      });
    },
  });

  await assert.rejects(
    () => client.getDetail('anime', 100),
    (err) => err instanceof ExternalProviderRateLimitError && err.statusCode === 429
  );
  assert.equal(attempts, 3); // 1 initial + 2 retries
});

test('JikanClient: Retries transient HTTP 503 and succeeds on subsequent attempt', async () => {
  let attempts = 0;
  const sleepCalls = [];

  const client = new JikanClient({
    maxRetries: 2,
    minIntervalMs: 0,
    sleepFn: async (ms) => {
      sleepCalls.push(ms);
    },
    fetchFn: async () => {
      attempts++;
      if (attempts < 3) {
        return new Response(JSON.stringify({ error: 'Service Unavailable' }), { status: 503 });
      }
      return new Response(JSON.stringify({ data: { mal_id: 500 } }), { status: 200 });
    },
  });

  const result = await client.getDetail('anime', 500);
  assert.equal(result.data.mal_id, 500);
  assert.equal(attempts, 3);
  assert.equal(sleepCalls.length, 2);
});

test('JikanClient: Throws ExternalProviderUnavailableError when 503 persists', async () => {
  const client = new JikanClient({
    maxRetries: 1,
    minIntervalMs: 0,
    sleepFn: async () => {},
    fetchFn: async () => new Response('Unavailable', { status: 503 }),
  });

  await assert.rejects(
    () => client.getDetail('anime', 1),
    (err) => err instanceof ExternalProviderUnavailableError && err.statusCode === 502
  );
});

test('JikanClient: Non-retryable HTTP 404 immediately throws ExternalResourceNotFoundError', async () => {
  let attempts = 0;

  const client = new JikanClient({
    maxRetries: 3,
    minIntervalMs: 0,
    fetchFn: async () => {
      attempts++;
      return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
    },
  });

  await assert.rejects(
    () => client.getDetail('anime', 9999999),
    (err) => err instanceof ExternalResourceNotFoundError && err.statusCode === 404
  );
  assert.equal(attempts, 1); // Zero retries for 404
});

test('JikanClient: Handles network errors and abort timeouts deterministically', async () => {
  const client = new JikanClient({
    maxRetries: 1,
    minIntervalMs: 0,
    sleepFn: async () => {},
    fetchFn: async () => {
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    },
  });

  await assert.rejects(
    () => client.getDetail('anime', 1),
    (err) => err instanceof ExternalProviderTimeoutError && err.statusCode === 504
  );
});

test('BoundedTtlCache: Caches results, expires on TTL, and enforces max entry limit', async () => {
  const cache = new BoundedTtlCache(50, 3); // 50ms TTL, 3 max entries

  cache.set('a', 1);
  cache.set('b', 2);
  cache.set('c', 3);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.size, 3);

  // Inserting 4th item evicts oldest ('b', since 'a' was recently accessed)
  cache.set('d', 4);
  assert.equal(cache.size, 3);
  assert.equal(cache.get('b'), undefined); // Evicted!
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.get('d'), 4);

  // Wait for TTL expiration
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cache.get('a'), undefined); // Expired
});

test('RequestThrottler: Enforces inter-request minimum interval', async () => {
  const throttler = new RequestThrottler(40);
  const start = Date.now();

  await throttler.throttle();
  await throttler.throttle();

  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 35, `Expected elapsed time >= 35ms, got ${elapsed}ms`);
});

test('classifyNetworkError: Correctly categorizes DNS, connection, TLS, and timeout causes', () => {
  // 1. AbortError
  const abort = new Error('aborted');
  abort.name = 'AbortError';
  assert.equal(classifyNetworkError(abort).category, 'UPSTREAM_TIMEOUT');

  // 2. ConnectTimeoutError / UND_ERR_CONNECT_TIMEOUT
  const timeoutErr = new Error('fetch failed');
  timeoutErr.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' };
  assert.equal(classifyNetworkError(timeoutErr).category, 'UPSTREAM_TIMEOUT');

  // 3. DNS failure (ENOTFOUND)
  const dnsErr = new Error('fetch failed');
  dnsErr.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND api.jikan.moe' };
  assert.equal(classifyNetworkError(dnsErr).category, 'UPSTREAM_DNS_ERROR');

  // 4. Connection refused (ECONNREFUSED)
  const connErr = new Error('fetch failed');
  connErr.cause = { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' };
  assert.equal(classifyNetworkError(connErr).category, 'UPSTREAM_CONNECTION_ERROR');

  // 5. TLS error
  const tlsErr = new Error('fetch failed');
  tlsErr.cause = { code: 'CERT_HAS_EXPIRED', message: 'certificate has expired' };
  assert.equal(classifyNetworkError(tlsErr).category, 'UPSTREAM_TLS_ERROR');
});

test('JikanClient: Rejects malformed JSON with UPSTREAM_BAD_RESPONSE', async () => {
  const client = new JikanClient({
    maxRetries: 0,
    minIntervalMs: 0,
    fetchFn: async () =>
      new Response('<html>502 Bad Gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
  });

  await assert.rejects(
    () => client.search('anime', 'frieren'),
    (err) => {
      assert.ok(err instanceof ExternalProviderUnavailableError);
      assert.equal(err.statusCode, 502);
      assert.equal(err.details[0].category, 'UPSTREAM_BAD_RESPONSE');
      return true;
    }
  );
});

test('JikanClient: Rejects invalid response payload structure with UPSTREAM_INVALID_PAYLOAD', async () => {
  const client = new JikanClient({
    maxRetries: 0,
    minIntervalMs: 0,
    fetchFn: async () =>
      new Response(JSON.stringify('not-an-object'), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  });

  await assert.rejects(
    () => client.search('anime', 'frieren'),
    (err) => {
      assert.ok(err instanceof ExternalProviderUnavailableError);
      assert.equal(err.statusCode, 502);
      assert.equal(err.details[0].category, 'UPSTREAM_INVALID_PAYLOAD');
      return true;
    }
  );
});

test('JikanClient: Classifies DNS error and throws ExternalProviderUnavailableError', async () => {
  const client = new JikanClient({
    maxRetries: 0,
    minIntervalMs: 0,
    fetchFn: async () => {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' };
      throw err;
    },
  });

  await assert.rejects(
    () => client.search('anime', 'frieren'),
    (err) => {
      assert.ok(err instanceof ExternalProviderUnavailableError);
      assert.equal(err.statusCode, 502);
      assert.equal(err.details[0].category, 'UPSTREAM_DNS_ERROR');
      return true;
    }
  );
});

test('JikanClient: Classifies connect timeout and throws ExternalProviderTimeoutError (504)', async () => {
  const client = new JikanClient({
    maxRetries: 0,
    minIntervalMs: 0,
    fetchFn: async () => {
      const err = new TypeError('fetch failed');
      err.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' };
      throw err;
    },
  });

  await assert.rejects(
    () => client.search('anime', 'frieren'),
    (err) => {
      assert.ok(err instanceof ExternalProviderTimeoutError);
      assert.equal(err.statusCode, 504);
      assert.equal(err.details[0].category, 'UPSTREAM_TIMEOUT');
      return true;
    }
  );
});

test('JikanClient: Failed requests are NOT cached', async () => {
  let callCount = 0;
  const client = new JikanClient({
    maxRetries: 0,
    minIntervalMs: 0,
    fetchFn: async () => {
      callCount++;
      if (callCount === 1) {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED' };
        throw err;
      }
      return new Response(JSON.stringify({ data: [{ mal_id: 1, title: 'Frieren' }] }), { status: 200 });
    },
  });

  // First call fails
  await assert.rejects(() => client.search('anime', 'frieren'));
  assert.equal(callCount, 1);

  // Second call must NOT return a cached error or empty result; it must hit fetchFn again and succeed!
  const res = await client.search('anime', 'frieren');
  assert.equal(callCount, 2);
  assert.equal(res.data.length, 1);
  assert.equal(res.data[0].mal_id, 1);
});

test('JikanClient: Custom baseUrl parameter routes requests to custom endpoint', async () => {
  let requestedUrl = null;
  const client = new JikanClient({
    baseUrl: 'http://localhost:8080/v4',
    minIntervalMs: 0,
    fetchFn: async (url) => {
      requestedUrl = String(url);
      return new Response(JSON.stringify({ data: [{ mal_id: 123, title: 'Custom Host Frieren' }] }), { status: 200 });
    },
  });

  const res = await client.search('anime', 'frieren');
  assert.ok(requestedUrl.startsWith('http://localhost:8080/v4/anime?q=frieren'));
  assert.equal(res.data[0].title, 'Custom Host Frieren');
});

test('MetadataClient: Constructs safe Tenrai /v1 URLs with URLSearchParams and never appends /v4', async () => {
  let capturedSearchUrl = null;
  let capturedDetailUrl = null;

  const client = new MetadataClient({
    baseUrl: 'https://api.tenrai.org/v1/', // includes trailing slash to test trimming
    minIntervalMs: 0,
    fetchFn: async (url) => {
      const urlStr = String(url);
      if (urlStr.includes('/full')) {
        capturedDetailUrl = urlStr;
      } else {
        capturedSearchUrl = urlStr;
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    },
  });

  await client.search('anime', 'Sousou no Frieren & Magic', 1, 15);
  assert.ok(capturedSearchUrl);
  assert.ok(!capturedSearchUrl.includes('/v4/'), 'Must not concatenate /v4 to Tenrai base URL');
  assert.ok(capturedSearchUrl.startsWith('https://api.tenrai.org/v1/anime?'));

  const parsed = new URL(capturedSearchUrl);
  assert.equal(parsed.pathname, '/v1/anime');
  assert.equal(parsed.searchParams.get('q'), 'Sousou no Frieren & Magic');
  assert.equal(parsed.searchParams.get('page'), '1');
  assert.equal(parsed.searchParams.get('limit'), '15');

  await client.getDetail('anime', 52991);
  assert.ok(capturedDetailUrl);
  assert.equal(capturedDetailUrl, 'https://api.tenrai.org/v1/anime/52991/full');
  assert.ok(!capturedDetailUrl.includes('/v4/'));
});

test('MetadataClient: Throws BadRequestError for empty or whitespace-only search query', async () => {
  const client = new MetadataClient({ minIntervalMs: 0 });
  await assert.rejects(
    () => client.search('anime', '   '),
    (err) => err instanceof BadRequestError && err.statusCode === 400
  );
});
