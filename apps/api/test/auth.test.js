import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import request from 'supertest';
import { app } from '../dist/app.js';
import { createToken, TEST_OWNER_A, TEST_OWNER_B, resetMongoTestDatabase } from './helpers.js';

before(async () => {
  await resetMongoTestDatabase();
});

after(async () => {
  const { closeMongo } = await import('../dist/repositories/mongo.js');
  await closeMongo();
});

test('Authentication: Protected routes reject requests without Authorization header', async () => {
  const res = await request(app).get('/api/v1/titles');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('Authentication token is required'));
  assert.ok(res.body.meta.requestId);
});

test('Authentication: Protected routes reject malformed Authorization header', async () => {
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', 'Basic 123456');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('Bearer'));
});

test('Authentication: Protected routes reject invalid JWT signature', async () => {
  const fakeToken = createToken(TEST_OWNER_A, { secret: 'wrong-secret-key-that-fails-verification!!' });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${fakeToken}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('Invalid or expired'));
});

test('Authentication: Protected routes reject expired JWT token', async () => {
  const expiredToken = createToken(TEST_OWNER_A, { expiresIn: '-1s' });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${expiredToken}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('Authentication: Protected routes reject token with missing sub claim', async () => {
  const jwtModule = (await import('jsonwebtoken')).default;
  const { config } = await import('../dist/config/index.js');
  const token = jwtModule.sign({ email: 'nosub@example.com', role: 'authenticated' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('subject identifier (sub) missing'));
});

test('Authentication: Protected routes reject token with non-UUID sub claim', async () => {
  const jwtModule = (await import('jsonwebtoken')).default;
  const { config } = await import('../dist/config/index.js');
  const token = jwtModule.sign({ sub: 'invalid-non-uuid-12345', role: 'authenticated' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('must be a valid UUID'));
});

test('Authentication: Protected routes reject token with anonymous role or aud', async () => {
  const jwtModule = (await import('jsonwebtoken')).default;
  const { config } = await import('../dist/config/index.js');
  const tokenAnonRole = jwtModule.sign({ sub: TEST_OWNER_A, role: 'anon' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  const resRole = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${tokenAnonRole}`);
  assert.equal(resRole.status, 401);
  assert.ok(resRole.body.error.message.includes('anonymous role not permitted'));

  const tokenAnonAud = jwtModule.sign({ sub: TEST_OWNER_A, role: 'authenticated', aud: 'anon' }, config.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: '1h',
  });
  const resAud = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${tokenAnonAud}`);
  assert.equal(resAud.status, 401);
  assert.ok(resAud.body.error.message.includes('anonymous role not permitted'));
});

test('Authentication: Protected routes reject token signed with algorithm none', async () => {
  const jwtModule = (await import('jsonwebtoken')).default;
  const unsignedToken = jwtModule.sign({ sub: TEST_OWNER_A, role: 'authenticated' }, '', {
    algorithm: 'none',
  });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${unsignedToken}`);
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('Authentication: Valid token succeeds and accesses caller library', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.pagination);
  assert.ok(res.body.meta.requestId);
});

test('Authorization & Privacy: Owner B cannot access Owner A private title detail', async () => {
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';
  const tokenB = createToken(TEST_OWNER_B);

  const res = await request(app)
    .get(`/api/v1/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${tokenB}`);

  // Must return 404 NOT_FOUND to avoid revealing existence of private title
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('Authorization & Privacy: Owner B cannot mutate Owner A title', async () => {
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';
  const tokenB = createToken(TEST_OWNER_B);

  const patchRes = await request(app)
    .patch(`/api/v1/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ englishTitle: 'Hacked Title' });

  assert.equal(patchRes.status, 404);

  const deleteRes = await request(app)
    .delete(`/api/v1/titles/${seedTitleAnime}?confirm=true`)
    .set('Authorization', `Bearer ${tokenB}`);

  assert.equal(deleteRes.status, 404);
});

test('Authorization: Owner B cannot attach Owner A title to Owner B collection', async () => {
  const tokenB = createToken(TEST_OWNER_B);

  // 1. Owner B creates their own collection
  const colRes = await request(app)
    .post('/api/v1/collections')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ name: 'Owner B Sneaky Collection' });
  assert.equal(colRes.status, 201);
  const colBId = colRes.body.data.id;

  // 2. Owner B attempts to add Owner A's title to Owner B's collection
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';
  const addRes = await request(app)
    .post(`/api/v1/collections/${colBId}/titles`)
    .set('Authorization', `Bearer ${tokenB}`)
    .send({ titleIds: [seedTitleAnime] });

  assert.equal(addRes.status, 403);
  assert.equal(addRes.body.error.code, 'FORBIDDEN');
});

test('Authorization: Owner B cannot create a bookmark for Owner A title', async () => {
  const tokenB = createToken(TEST_OWNER_B);
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';

  const res = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({
      titleId: seedTitleAnime,
      status: 'plan_to_consume',
    });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');
});

test('Authorization: Client-supplied owner_id in request body is strictly ignored', async () => {
  const tokenB = createToken(TEST_OWNER_B);

  const res = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${tokenB}`)
    .send({
      owner_id: TEST_OWNER_A,
      ownerId: TEST_OWNER_A,
      mediaType: 'anime',
      englishTitle: 'Owner B Title',
    });

  assert.equal(res.status, 201);
  // Verified: created title belongs to authenticated caller (Owner B), not injected Owner A
  assert.equal(res.body.data.ownerId, TEST_OWNER_B);
});

test('Dev Auth: GET /api/v1/auth/dev-session issues valid development token for TEST_OWNER_A', async () => {
  const res = await request(app).get('/api/v1/auth/dev-session');
  assert.equal(res.status, 200);
  assert.ok(res.body.data.token);
  assert.equal(res.body.data.ownerId, TEST_OWNER_A);
  assert.equal(res.body.data.email, 'owner@example.com');
  assert.equal(res.body.data.mode, 'development');

  // Verify the issued token works on protected endpoints
  const titlesRes = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${res.body.data.token}`);
  assert.equal(titlesRes.status, 200);
  assert.ok(Array.isArray(titlesRes.body.data));
});

test('Dev Auth: POST /api/v1/auth/dev-token strictly ignores injected owner parameters', async () => {
  const res = await request(app)
    .post('/api/v1/auth/dev-token')
    .send({ ownerId: TEST_OWNER_B, sub: TEST_OWNER_B, role: 'admin' });
  assert.equal(res.status, 200);
  // Must still be TEST_OWNER_A
  assert.equal(res.body.data.ownerId, TEST_OWNER_A);
});

test('Authentication: Expired token returns specific error detail', async () => {
  const expiredToken = createToken(TEST_OWNER_A, { expiresIn: '-10s' });
  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${expiredToken}`);
  assert.equal(res.status, 401);
  assert.ok(res.body.error.message.includes('token has expired'));
});

test('Token Generator CLI: Masks token by default and respects --raw flag with synthetic secret', async () => {
  const { execSync } = await import('node:child_process');
  const syntheticSecret = 'synthetic-test-key-min-16-characters-long!';
  const scriptPath = resolve(import.meta.dirname, '../../../scripts/generate-session-token.js');

  // 1. Default output masks token
  const defaultOut = execSync(`node "${scriptPath}"`, {
    env: { ...process.env, SUPABASE_JWT_SECRET: syntheticSecret },
  }).toString();

  assert.ok(defaultOut.includes('Masked Token Preview:'));
  assert.ok(defaultOut.includes('REDACTED'));
  assert.ok(!defaultOut.includes('--print flag active'));

  // 2. Raw output returns a valid parseable JWT without headers
  const rawOut = execSync(`node "${scriptPath}" --raw`, {
    env: { ...process.env, SUPABASE_JWT_SECRET: syntheticSecret },
  }).toString().trim();

  assert.equal(rawOut.split('.').length, 3, 'Raw token must be a standard 3-part JWT');
  assert.ok(rawOut.startsWith('eyJ'), 'Raw token must start with standard base64 JWT header');

  // 3. Invalid UUID argument exits with error
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" not-a-uuid`, {
        env: { ...process.env, SUPABASE_JWT_SECRET: syntheticSecret },
        stdio: 'pipe',
      });
    },
    /Command failed/,
    'Invalid UUID must cause non-zero exit code'
  );
});

test('Token Generator CLI: Supports JWT_SECRET as primary environment variable', async () => {
  const { execSync } = await import('node:child_process');
  const syntheticSecret = 'primary-jwt-secret-min-16-chars-long!';
  const scriptPath = resolve(import.meta.dirname, '../../../scripts/generate-session-token.js');

  const rawOut = execSync(`node "${scriptPath}" --raw`, {
    env: { ...process.env, JWT_SECRET: syntheticSecret, SUPABASE_JWT_SECRET: '' },
  }).toString().trim();

  assert.equal(rawOut.split('.').length, 3, 'Raw token must be a standard 3-part JWT');
  assert.ok(rawOut.startsWith('eyJ'), 'Raw token must start with standard base64 JWT header');

  // Verify token claims and signature with the synthetic secret
  const jwtModule = (await import('jsonwebtoken')).default;
  const decoded = jwtModule.verify(rawOut, syntheticSecret, { algorithms: ['HS256'] });
  assert.equal(decoded.sub, '00000000-0000-0000-0000-000000000001');
  assert.equal(decoded.role, 'authenticated');
  assert.equal(decoded.app_metadata.provider, 'animemanager');
  assert.equal(decoded.iss, 'animemanager');
});

test('Token Generator CLI: JWT_SECRET takes precedence over legacy SUPABASE_JWT_SECRET', async () => {
  const { execSync } = await import('node:child_process');
  const primarySecret = 'primary-secret-min-16-characters-long!';
  const legacySecret = 'legacy-secret-min-16-characters-long!!';
  const scriptPath = resolve(import.meta.dirname, '../../../scripts/generate-session-token.js');

  const rawOut = execSync(`node "${scriptPath}" --raw`, {
    env: { ...process.env, JWT_SECRET: primarySecret, SUPABASE_JWT_SECRET: legacySecret },
  }).toString().trim();

  const jwtModule = (await import('jsonwebtoken')).default;
  // Must verify successfully against primarySecret, not legacySecret
  const decoded = jwtModule.verify(rawOut, primarySecret, { algorithms: ['HS256'] });
  assert.equal(decoded.sub, '00000000-0000-0000-0000-000000000001');

  assert.throws(() => {
    jwtModule.verify(rawOut, legacySecret, { algorithms: ['HS256'] });
  }, /invalid signature/);
});

test('Configuration: config exports both JWT_SECRET and SUPABASE_JWT_SECRET identically', async () => {
  const { config } = await import('../dist/config/index.js');
  assert.ok(config.JWT_SECRET, 'config.JWT_SECRET must be defined');
  assert.ok(config.SUPABASE_JWT_SECRET, 'config.SUPABASE_JWT_SECRET must be defined');
  assert.equal(
    config.JWT_SECRET,
    config.SUPABASE_JWT_SECRET,
    'config.JWT_SECRET and config.SUPABASE_JWT_SECRET must hold identical values for backward compatibility'
  );
  assert.ok(config.JWT_SECRET.length >= 16, 'JWT_SECRET must be at least 16 characters');
});


