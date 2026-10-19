import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';

import { createApp } from '../dist/app.js';
import { resetMongoTestDatabase } from './helpers.js';
import {
  getUsersCollection,
  getUserSessionsCollection,
  getAuditLogsCollection,
  getTitlesCollection,
  getBookmarksCollection,
  getCollectionsCollection,
  closeMongo,
} from '../dist/repositories/mongo.js';
import { SESSION_COOKIE_NAME } from '../dist/utils/cookie.js';
import { CANONICAL_OWNER_ID } from '../dist/middleware/auth.middleware.js';

const app = createApp();

before(async () => {
  await resetMongoTestDatabase();
});

beforeEach(async () => {
  const users = await getUsersCollection();
  const userSessions = await getUserSessionsCollection();
  const auditLogs = await getAuditLogsCollection();
  const titles = await getTitlesCollection();
  const bookmarks = await getBookmarksCollection();
  const collections = await getCollectionsCollection();

  await users.deleteMany({});
  await userSessions.deleteMany({});
  await auditLogs.deleteMany({});
  await titles.deleteMany({});
  await bookmarks.deleteMany({});
  await collections.deleteMany({});
});

after(async () => {
  await closeMongo();
});

function getCookieFromResponse(res) {
  const cookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  assert.ok(match, 'Expected session cookie');
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}

// ── 1. User Registration Flow ──

test('Registration: Ordinary user registration creates active account and sets session cookie', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'spike_spiegel',
      displayName: 'Spike Spiegel',
      email: 'spike@bebop.local',
      password: 'BangPassword123!',
      confirmPassword: 'BangPassword123!',
    })
    .expect(201);

  assert.equal(res.body.data.user.username, 'spike_spiegel');
  assert.equal(res.body.data.user.email, 'spike@bebop.local');
  assert.equal(res.body.data.user.displayName, 'Spike Spiegel');
  assert.equal(res.body.data.user.role, 'user');
  assert.equal(res.body.data.user.status, 'active');
  assert.equal(res.body.data.user.passwordHash, undefined, 'No password hash leaked');

  const cookie = getCookieFromResponse(res);
  assert.ok(cookie);

  // Verification in database:
  const users = await getUsersCollection();
  const doc = await users.findOne({ email: 'spike@bebop.local' });
  assert.ok(doc);
  assert.equal(doc.username, 'spike_spiegel');
  assert.equal(doc.status, 'active');
  assert.ok(doc.passwordHash.startsWith('scrypt$v1$'));

  // Session verification:
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', cookie)
    .expect(200);

  assert.equal(meRes.body.data.user.id, doc._id);
  assert.equal(meRes.body.data.user.role, 'user');
});

test('Registration: Rejects duplicate email address (case-insensitive)', async () => {
  await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_one',
      displayName: 'User One',
      email: 'unique@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);

  const dupRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_two',
      displayName: 'User Two',
      email: 'UNIQUE@EXAMPLE.COM', // Same email, uppercase
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(409);

  assert.equal(dupRes.body.error.code, 'CONFLICT');
  assert.match(dupRes.body.error.message, /email/i);
});

test('Registration: Rejects duplicate username (case-insensitive)', async () => {
  await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'cowboy_bebop',
      displayName: 'Bebop',
      email: 'bebop1@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);

  const dupRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'COWBOY_BEBOP', // Same username, uppercase
      displayName: 'Another Bebop',
      email: 'bebop2@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(409);

  assert.equal(dupRes.body.error.code, 'CONFLICT');
  assert.match(dupRes.body.error.message, /username/i);
});

test('Registration: Rejects password mismatch or weak passwords', async () => {
  // Mismatch
  await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'valid_user',
      displayName: 'Valid User',
      email: 'mismatch@example.com',
      password: 'Password123!',
      confirmPassword: 'DifferentPassword123!',
    })
    .expect(400);

  // Short password (< 8 chars)
  await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'valid_user2',
      displayName: 'Valid User',
      email: 'short@example.com',
      password: 'pass',
      confirmPassword: 'pass',
    })
    .expect(400);
});

// ── 2. User Data Isolation ──

test('Data Isolation: User A cannot read, modify, or delete User B library items', async () => {
  // 1. Register User A
  const resA = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_alpha',
      displayName: 'User Alpha',
      email: 'alpha@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);
  const cookieA = getCookieFromResponse(resA);
  const userAId = resA.body.data.user.id;

  // 2. Register User B
  const resB = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_beta',
      displayName: 'User Beta',
      email: 'beta@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);
  const cookieB = getCookieFromResponse(resB);
  const userBId = resB.body.data.user.id;

  assert.notEqual(userAId, userBId);
  assert.notEqual(userAId, CANONICAL_OWNER_ID);

  // 3. User A creates a title in their library
  const createTitleRes = await request(app)
    .post('/api/v1/titles')
    .set('Cookie', cookieA)
    .set('Origin', 'http://localhost:5173')
    .send({
      englishTitle: 'User A Secret Masterpiece',
      mediaType: 'anime',
      releaseYear: 2026,
      genres: ['Action'],
    })
    .expect(201);

  const titleAId = createTitleRes.body.data.id;
  assert.equal(createTitleRes.body.data.ownerId, userAId);

  // 4. User A can retrieve their title
  const listARes = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', cookieA)
    .expect(200);
  assert.equal(listARes.body.data.length, 1);
  assert.equal(listARes.body.data[0].id, titleAId);

  // 5. User B lists titles -> User A's title MUST NOT appear (isolation)
  const listBRes = await request(app)
    .get('/api/v1/titles')
    .set('Cookie', cookieB)
    .expect(200);
  assert.equal(listBRes.body.data.length, 0);

  // 6. User B directly queries User A's title ID -> 404 Not Found
  await request(app)
    .get(`/api/v1/titles/${titleAId}`)
    .set('Cookie', cookieB)
    .expect(404);

  // 7. User B attempts to edit User A's title -> 404 Not Found
  await request(app)
    .patch(`/api/v1/titles/${titleAId}`)
    .set('Cookie', cookieB)
    .set('Origin', 'http://localhost:5173')
    .send({ englishTitle: 'Hacked by User B' })
    .expect(404);

  // 8. User B attempts to delete User A's title -> 404 Not Found
  await request(app)
    .delete(`/api/v1/titles/${titleAId}?confirm=true`)
    .set('Cookie', cookieB)
    .set('Origin', 'http://localhost:5173')
    .expect(404);
});

test('Data Isolation: User cannot override ownerId via request body spoofing', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'spoof_tester',
      displayName: 'Spoof Tester',
      email: 'spoof@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);
  const cookie = getCookieFromResponse(res);
  const actualUserId = res.body.data.user.id;

  // Attempt to create a title claiming canonical owner or another user ID
  const fakeOwner = crypto.randomUUID();
  const createRes = await request(app)
    .post('/api/v1/titles')
    .set('Cookie', cookie)
    .set('Origin', 'http://localhost:5173')
    .send({
      englishTitle: 'Spoofed Owner Title',
      mediaType: 'anime',
      ownerId: fakeOwner, // Spoofed!
    })
    .expect(201);

  // Server must strictly enforce actual authenticated user ID as ownerId
  assert.equal(createRes.body.data.ownerId, actualUserId, 'Server must enforce req.user.id as ownerId');
  assert.notEqual(createRes.body.data.ownerId, fakeOwner);
});

// ── 3. Privacy-Preserving Activity Auditing ──

test('Privacy Audit: Content operations log event type and media type WITHOUT title, rating, or synopsis', async () => {
  const res = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'privacy_lover',
      displayName: 'Privacy Lover',
      email: 'privacy@example.com',
      password: 'Password123!',
      confirmPassword: 'Password123!',
    })
    .expect(201);
  const cookie = getCookieFromResponse(res);
  const userId = res.body.data.user.id;

  const PRIVATE_TITLE_NAME = 'Ultra Confidential Private Series 99';
  const PRIVATE_SYNOPSIS = 'Top secret personal notes that must not leak to admins';

  // Add library item
  await request(app)
    .post('/api/v1/titles')
    .set('Cookie', cookie)
    .set('Origin', 'http://localhost:5173')
    .send({
      englishTitle: PRIVATE_TITLE_NAME,
      synopsis: PRIVATE_SYNOPSIS,
      mediaType: 'anime',
    })
    .expect(201);

  // Check audit log in database
  const auditLogs = await getAuditLogsCollection();
  const logs = await auditLogs.find({ actorId: userId, eventType: 'user.library_item_added' }).toArray();
  assert.equal(logs.length, 1);

  const log = logs[0];
  assert.equal(log.actorRole, 'user');
  assert.equal(log.targetType, 'library');
  assert.equal(log.outcome, 'success');

  // Stringify the entire log document to ensure NO confidential text was stored
  const serialized = JSON.stringify(log);
  assert.equal(serialized.includes(PRIVATE_TITLE_NAME), false, 'Audit log MUST NOT contain the title name');
  assert.equal(serialized.includes(PRIVATE_SYNOPSIS), false, 'Audit log MUST NOT contain the synopsis');

  // Verify only non-sensitive metadata is stored
  assert.equal(log.metadata?.mediaType, 'anime');
  assert.equal(log.metadata?.category, 'library');
});
