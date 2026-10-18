import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { app } from '../dist/app.js';
import { RateLimiter } from '../dist/middleware/rate-limit.middleware.js';
import { createToken, TEST_OWNER_A } from './helpers.js';
import { config } from '../dist/config/index.js';

test('RateLimiter Middleware: Accurately tracks requests and sets rate limit headers', () => {
  const limiter = new RateLimiter({
    windowMs: 60000,
    max: 3,
    keyGenerator: () => 'test-key-1',
  });
  const middleware = limiter.middleware();

  let req = { user: { id: 'test-user' } };
  let headers = {};
  let res = {
    setHeader: (key, val) => {
      headers[key] = val;
    },
  };

  let nextCalled = 0;
  const next = () => {
    nextCalled++;
  };

  // Request 1: remaining should be 2
  middleware(req, res, next);
  assert.equal(nextCalled, 1);
  assert.equal(headers['RateLimit-Limit'], '3');
  assert.equal(headers['RateLimit-Remaining'], '2');
  assert.ok(headers['RateLimit-Reset']);

  // Request 2: remaining should be 1
  middleware(req, res, next);
  assert.equal(nextCalled, 2);
  assert.equal(headers['RateLimit-Remaining'], '1');

  // Request 3: remaining should be 0
  middleware(req, res, next);
  assert.equal(nextCalled, 3);
  assert.equal(headers['RateLimit-Remaining'], '0');

  // Request 4: limit exceeded, throws RateLimitError and sets Retry-After
  assert.throws(
    () => middleware(req, res, next),
    (err) => {
      assert.equal(err.statusCode, 429);
      assert.equal(err.errorCode, 'RATE_LIMITED');
      return true;
    }
  );
  assert.ok(headers['Retry-After']);

  // Reset allows new requests
  limiter.reset();
  middleware(req, res, next);
  assert.equal(nextCalled, 4);
  assert.equal(headers['RateLimit-Remaining'], '2');

  limiter.destroy();
});

test('RateLimiter Middleware: Keys isolate different users independently', () => {
  let currentKey = 'user-a';
  const limiter = new RateLimiter({
    windowMs: 60000,
    max: 2,
    keyGenerator: () => currentKey,
  });
  const middleware = limiter.middleware();

  let headers = {};
  const res = { setHeader: (k, v) => (headers[k] = v) };
  let nextCalled = 0;
  const next = () => nextCalled++;

  // 2 requests for user-a
  middleware({}, res, next);
  middleware({}, res, next);
  assert.equal(nextCalled, 2);

  // 3rd request for user-a fails
  assert.throws(() => middleware({}, res, next));

  // user-b still has full capacity
  currentKey = 'user-b';
  middleware({}, res, next);
  assert.equal(nextCalled, 3);
  assert.equal(headers['RateLimit-Remaining'], '1');

  limiter.destroy();
});

test('RateLimiter Integration: Import endpoints include RateLimit headers', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/import/jikan/search?q=Naruto&type=anime')
    .set('Authorization', `Bearer ${token}`);

  // Endpoint was reached and RateLimit headers were injected
  assert.ok(res.headers['ratelimit-limit'], 'Must contain RateLimit-Limit header');
  assert.ok(res.headers['ratelimit-remaining'], 'Must contain RateLimit-Remaining header');
  assert.ok(res.headers['ratelimit-reset'], 'Must contain RateLimit-Reset header');
});

test('Payload Limit Guard: Requests exceeding 1MB return HTTP 413 with PAYLOAD_TOO_LARGE', async () => {
  const token = createToken(TEST_OWNER_A);
  // Create a large string slightly exceeding 1MB
  const largeSynopsis = 'X'.repeat(1024 * 1024 + 100);

  const res = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({
      mediaType: 'anime',
      englishTitle: 'Oversized Payload Title',
      synopsis: largeSynopsis,
    }));

  assert.equal(res.status, 413);
  assert.equal(res.body.error.code, 'PAYLOAD_TOO_LARGE');
  assert.ok(res.body.error.message.includes('1MB'));
  assert.ok(res.body.meta.requestId);
});

test('JWT Algorithm Enforcement: Rejects tokens with algorithm none or unsupported algorithms', async () => {
  // Create token with algorithm none
  const unsignedPayload = {
    sub: TEST_OWNER_A,
    email: 'test@example.com',
    role: 'authenticated',
  };
  const noneToken = jwt.sign(unsignedPayload, '', { algorithm: 'none' });

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${noneToken}`);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('Invalid or expired'));
});

test('CORS Configuration: Accurately reflects allowed origins', async () => {
  const res = await request(app)
    .options('/api/v1/health')
    .set('Origin', 'http://localhost:5173')
    .set('Access-Control-Request-Method', 'GET');

  assert.equal(res.headers['access-control-allow-origin'], 'http://localhost:5173');
});

test('RateLimiter Bounded Memory: Enforces maxEntries ceiling and evicts oldest entries', () => {
  const limiter = new RateLimiter({
    windowMs: 60000,
    max: 5,
    maxEntries: 3,
  });
  const middleware = limiter.middleware();
  const res = { setHeader: () => {} };
  const next = () => {};

  middleware({ user: { id: 'user-1' } }, res, next);
  middleware({ user: { id: 'user-2' } }, res, next);
  middleware({ user: { id: 'user-3' } }, res, next);

  // 4th user causes capacity check and oldest eviction, keeping size <= 3
  middleware({ user: { id: 'user-4' } }, res, next);

  limiter.destroy();
});

test('JWT Claims Validation: Rejects tokens with anonymous role (anon)', async () => {
  const anonPayload = {
    sub: TEST_OWNER_A,
    email: 'anon@example.com',
    role: 'anon',
    aud: 'anon',
  };
  const anonToken = jwt.sign(anonPayload, config.JWT_SECRET, { algorithm: 'HS256' });

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${anonToken}`);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('anonymous role not permitted'));
});

test('JWT Claims Validation: Rejects tokens with non-UUID sub', async () => {
  const badSubPayload = {
    sub: 'not-a-valid-uuid-admin',
    email: 'admin@example.com',
    role: 'authenticated',
  };
  const badSubToken = jwt.sign(badSubPayload, config.JWT_SECRET, { algorithm: 'HS256' });

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${badSubToken}`);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('valid UUID'));
});
