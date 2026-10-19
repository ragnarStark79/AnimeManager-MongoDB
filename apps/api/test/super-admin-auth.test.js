import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { app } from '../dist/app.js';
import { resetMongoTestDatabase, TEST_OWNER_A, createToken } from './helpers.js';
import { getDb, getSuperAdminsCollection, getSessionsCollection, closeMongo } from '../dist/repositories/mongo.js';
import { hashPassword, verifyPassword, hashSessionToken } from '../dist/utils/password.js';
import { resetLoginRateLimits } from '../dist/middleware/login-rate-limit.middleware.js';
import { SESSION_COOKIE_NAME } from '../dist/utils/cookie.js';
import { CANONICAL_OWNER_ID } from '../dist/middleware/auth.middleware.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const bootstrapScript = path.resolve(__dirname, '../../../scripts/bootstrap-superadmin.js');

const TEST_ADMIN_EMAIL = 'superadmin.test@animemanager.local';
const TEST_ADMIN_PASSWORD = 'CorrectHorseBatteryStaple99!';
let seededAdminId = '';

before(async () => {
  await resetMongoTestDatabase();
});

beforeEach(async () => {
  resetLoginRateLimits();
  const superAdmins = await getSuperAdminsCollection();
  const sessions = await getSessionsCollection();
  await superAdmins.deleteMany({});
  await sessions.deleteMany({});

  // Seed default active super admin
  const passwordHash = await hashPassword(TEST_ADMIN_PASSWORD);
  seededAdminId = crypto.randomUUID();
  await superAdmins.insertOne({
    _id: seededAdminId,
    email: TEST_ADMIN_EMAIL,
    passwordHash,
    displayName: 'Headmaster Admin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });
});

after(async () => {
  await closeMongo();
});

// ── 1. Password Security & Cryptography ──

test('Password Security: hashPassword creates scrypt hash with random salt and verifyPassword validates correctly', async () => {
  const pwd = 'VerySecureMasterPassword123#';
  const hash1 = await hashPassword(pwd);
  const hash2 = await hashPassword(pwd);

  // Different salts ensure hashes are never identical
  assert.notEqual(hash1, hash2);
  assert.ok(hash1.startsWith('scrypt$v1$'));

  const valid = await verifyPassword(pwd, hash1);
  assert.equal(valid, true);

  const invalid = await verifyPassword('WrongPassword123#', hash1);
  assert.equal(invalid, false);

  const malformed = await verifyPassword(pwd, 'not-a-valid-scrypt-hash');
  assert.equal(malformed, false);
});

// ── 2. Login Endpoint Tests ──

test('Super Admin Login: Correct credentials succeed, set HttpOnly cookie, and return safe profile', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.user.email, TEST_ADMIN_EMAIL);
  assert.equal(res.body.data.user.role, 'superadmin');
  assert.equal(res.body.data.user.displayName, 'Headmaster Admin');
  assert.equal(res.body.data.user.passwordHash, undefined, 'Password hash must NEVER be returned');

  // Verify cookie attributes
  const cookieHeader = res.headers['set-cookie'];
  assert.ok(cookieHeader && cookieHeader.length > 0);
  const sessionCookie = cookieHeader.find((c) => c.includes(SESSION_COOKIE_NAME));
  assert.ok(sessionCookie, 'Session cookie must be present in Set-Cookie header');
  assert.ok(sessionCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert.ok(sessionCookie.toLowerCase().includes('samesite=lax'), 'Cookie must have SameSite=lax');
  assert.ok(sessionCookie.includes('Path=/'), 'Cookie path must be /');
});

test('Super Admin Login: Incorrect password fails with generic 401 UNAUTHORIZED', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: TEST_ADMIN_EMAIL,
      password: 'IncorrectPassword999!',
    });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.equal(res.body.error.message, 'Invalid email or password');
  assert.equal(res.headers['set-cookie'], undefined, 'No session cookie on failed login');
});

test('Super Admin Login: Non-existent email fails with identical generic 401 UNAUTHORIZED', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'nonexistent.user@example.com',
      password: 'SomeRandomPassword123!',
    });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.equal(res.body.error.message, 'Invalid email or password');
});

test('Super Admin Login: Disabled administrator account cannot log in', async () => {
  const superAdmins = await getSuperAdminsCollection();
  await superAdmins.updateOne({ email: TEST_ADMIN_EMAIL }, { $set: { status: 'disabled' } });

  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: TEST_ADMIN_EMAIL,
      password: TEST_ADMIN_PASSWORD,
    });

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('disabled'));
});

test('Super Admin Login: Malformed body is rejected with 400 BAD_REQUEST', async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({
      email: 'not-an-email',
      password: '',
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'BAD_REQUEST');
});

test('Super Admin Login: Strict rate limiting triggers after excessive failed attempts', async () => {
  // 5 failed attempts
  for (let i = 0; i < 5; i++) {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_ADMIN_EMAIL, password: 'WrongPassword!' });
    assert.equal(res.status, 401);
  }

  // 6th attempt must be blocked by rate limiter
  const blockedRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  assert.equal(blockedRes.status, 429);
  assert.equal(blockedRes.body.error.code, 'RATE_LIMITED');
  assert.ok(blockedRes.body.error.message.includes('Too many failed login attempts'));
});

// ── 3. Session Lifecycle & Revocation ──

test('Super Admin Session: Valid cookie authorizes protected endpoints and maps to canonical owner', async () => {
  // 1. Log in
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
  assert.equal(loginRes.status, 200);

  const cookieHeader = loginRes.headers['set-cookie'];
  const rawCookie = cookieHeader[0].split(';')[0];

  // 2. Access protected titles endpoint
  const titlesRes = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', rawCookie);

  assert.equal(titlesRes.status, 200);
  assert.ok(Array.isArray(titlesRes.body.data));

  // 3. Check /auth/me returns safe profile
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', rawCookie);

  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.user.email, TEST_ADMIN_EMAIL);
  assert.equal(meRes.body.data.user.role, 'superadmin');
  assert.equal(meRes.body.data.user.passwordHash, undefined);
});

test('Super Admin Session: Stored in MongoDB hashed with SHA-256, never plaintext', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0];
  const tokenMatch = rawCookie.match(/animemanager_session=([^;]+)/);
  assert.ok(tokenMatch);
  const rawToken = tokenMatch[1];

  const sessions = await getSessionsCollection();
  const sessionDocs = await sessions.find({}).toArray();
  assert.equal(sessionDocs.length, 1);

  // Raw token must NOT exist in document
  assert.notEqual(sessionDocs[0].sessionTokenHash, rawToken);

  // Hash of raw token must match stored sessionTokenHash
  const expectedHash = hashSessionToken(rawToken);
  assert.equal(sessionDocs[0].sessionTokenHash, expectedHash);
  assert.equal(sessionDocs[0].adminId, seededAdminId);
});

test('Super Admin Session: Expired session returns 401 and clears cookie', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0].split(';')[0];
  const sessions = await getSessionsCollection();

  // Artificially expire the session in MongoDB
  await sessions.updateMany({}, { $set: { expiresAt: new Date(Date.now() - 10000) } });

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', rawCookie);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
  assert.ok(res.body.error.message.includes('expired'));

  // Should clear the cookie
  const clearCookieHeader = res.headers['set-cookie'];
  assert.ok(clearCookieHeader);
  assert.ok(clearCookieHeader[0].includes('animemanager_session=;'));
});

test('Super Admin Session: Revoked session returns 401', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0].split(';')[0];
  const sessions = await getSessionsCollection();

  // Artificially revoke session
  await sessions.updateMany({}, { $set: { revokedAt: new Date() } });

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', rawCookie);

  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('Super Admin Logout: Revokes session in database and clears browser cookie', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0].split(';')[0];
  const tokenMatch = rawCookie.match(/animemanager_session=([^;]+)/);
  const rawToken = tokenMatch[1];
  const tokenHash = hashSessionToken(rawToken);

  const logoutRes = await request(app)
    .post('/api/v1/auth/logout')
    .set('Cookie', rawCookie);

  assert.equal(logoutRes.status, 200);
  assert.equal(logoutRes.body.data.message, 'Logged out successfully');

  // Verify cookie is cleared in response
  const clearCookie = logoutRes.headers['set-cookie'][0];
  assert.ok(clearCookie.includes('animemanager_session=;'));

  // Verify database record has revokedAt set
  const sessions = await getSessionsCollection();
  const sessionDoc = await sessions.findOne({ sessionTokenHash: tokenHash });
  assert.ok(sessionDoc);
  assert.ok(sessionDoc.revokedAt instanceof Date);

  // Subsequent request with old cookie must fail
  const nextRes = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', rawCookie);
  assert.equal(nextRes.status, 401);
});

// ── 4. Authorization & Owner Scoping ──

test('Super Admin Authorization: Administrative accounts do not inherit canonical owner UUID and client cannot spoof ownerId', async () => {
  assert.equal(CANONICAL_OWNER_ID, '00000000-0000-0000-0000-000000000001');

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0].split(';')[0];

  // Create a title using the super admin session
  const createRes = await request(app)
    .post('/api/v1/titles')
    .set('Cookie', rawCookie)
    .send({
      mediaType: 'anime',
      englishTitle: 'Super Admin Scoped Title',
      releaseYear: 2024,
    });

  assert.equal(createRes.status, 201);
  assert.equal(createRes.body.data.ownerId, seededAdminId);
  assert.notEqual(createRes.body.data.ownerId, CANONICAL_OWNER_ID);

  // Client-supplied ownerId in request is completely ignored/overwritten
  const adversarialRes = await request(app)
    .post('/api/v1/titles')
    .set('Cookie', rawCookie)
    .send({
      ownerId: '99999999-9999-9999-9999-999999999999',
      mediaType: 'anime',
      englishTitle: 'Spoofed Owner Title',
      releaseYear: 2024,
    });

  assert.equal(adversarialRes.status, 201);
  assert.equal(adversarialRes.body.data.ownerId, seededAdminId);
});

test('Super Admin CSRF Protection: Rejects mutating requests with cross-origin Origin header', async () => {
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });

  const rawCookie = loginRes.headers['set-cookie'][0].split(';')[0];

  const maliciousRes = await request(app)
    .post('/api/v1/titles')
    .set('Cookie', rawCookie)
    .set('Origin', 'https://evil-attacker-site.com')
    .send({
      mediaType: 'anime',
      englishTitle: 'Attacker Title',
    });

  assert.equal(maliciousRes.status, 403);
  assert.equal(maliciousRes.body.error.code, 'FORBIDDEN');
  assert.ok(maliciousRes.body.error.message.includes('CSRF'));
});

test('Backward Compatibility: Legacy Bearer JWT token continues to authorize requests', async () => {
  const legacyToken = createToken(TEST_OWNER_A);

  const res = await request(app)
    .get('/api/v1/titles')
    .set('Authorization', `Bearer ${legacyToken}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
});

// ── 5. Provisioning CLI Script Tests ──

test('Provisioning CLI: Rejects execution when --database is omitted', () => {
  assert.throws(
    () => {
      execSync(`node "${bootstrapScript}" --email test@example.com --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('--database <name> is required'));
      return true;
    }
  );
});

test('Provisioning CLI: Refuses production database animemanager_production', () => {
  assert.throws(
    () => {
      execSync(
        `node "${bootstrapScript}" --database animemanager_production --email test@example.com --password MasterPassword123! --confirm`,
        { stdio: 'pipe' }
      );
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Refusing to run administrator provisioning on production database: "animemanager_production"'));
      return true;
    }
  );
});

test('Provisioning CLI: Refuses execution without --confirm flag', () => {
  assert.throws(
    () => {
      execSync(
        `node "${bootstrapScript}" --database animemanager_test --email test@example.com --password MasterPassword123!`,
        { stdio: 'pipe' }
      );
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Operation not confirmed'));
      return true;
    }
  );
});

test('Provisioning CLI: Refuses to overwrite existing administrator with duplicate email', () => {
  // TEST_ADMIN_EMAIL already seeded
  assert.throws(
    () => {
      execSync(
        `node "${bootstrapScript}" --database animemanager_test --email "${TEST_ADMIN_EMAIL}" --password NewPassword123! --confirm`,
        { stdio: 'pipe' }
      );
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('already exists'));
      assert.ok(output.includes('refuses to overwrite'));
      return true;
    }
  );
});

test('Provisioning CLI: Never prints or logs password or password hash in output', () => {
  const secretPassword = 'SuperSecretPlaintextPassword99!';
  const newEmail = 'clean.admin@animemanager.local';

  const output = execSync(
    `node "${bootstrapScript}" --database animemanager_test --email "${newEmail}" --password "${secretPassword}" --confirm`
  ).toString();

  assert.ok(output.includes('Super Admin provisioned successfully!'));
  assert.ok(output.includes(newEmail));
  assert.ok(!output.includes(secretPassword), 'Plaintext password must NEVER appear in output');
  assert.ok(!output.includes('scrypt$v1'), 'Password hash must NEVER appear in output');
});
