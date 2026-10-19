import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createApp } from '../dist/app.js';
import { resetMongoTestDatabase, TEST_OWNER_A, createToken } from './helpers.js';
import {
  getRootAdminsCollection,
  getRootAdminSessionsCollection,
  getSuperAdminsCollection,
  getSuperAdminSessionsCollection,
  getUsersCollection,
  getUserSessionsCollection,
  getAuditLogsCollection,
  getTitlesCollection,
  getBookmarksCollection,
  getCollectionsCollection,
  closeMongo,
} from '../dist/repositories/mongo.js';
import { hashPassword } from '../dist/utils/password.js';
import { SESSION_COOKIE_NAME } from '../dist/utils/cookie.js';
import { CANONICAL_OWNER_ID } from '../dist/middleware/auth.middleware.js';

const app = createApp();

const TEST_ROOT_EMAIL = 'root.admin.test@animemanager.local';
const TEST_ROOT_PASSWORD = 'RootAdminPassword123!';
let seededRootId = '';
let rootCookie = '';

const TEST_SUPER_EMAIL = 'super.admin.test@animemanager.local';
const TEST_SUPER_PASSWORD = 'SuperAdminPassword123!';
let seededSuperId = '';
let superCookie = '';

async function loginAndGetCookie(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email, password })
    .expect(200);

  const cookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  assert.ok(match, 'Expected session cookie in login response');
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}

before(async () => {
  await resetMongoTestDatabase();
});

beforeEach(async () => {
  const rootAdmins = await getRootAdminsCollection();
  const rootSessions = await getRootAdminSessionsCollection();
  const superAdmins = await getSuperAdminsCollection();
  const superSessions = await getSuperAdminSessionsCollection();
  const users = await getUsersCollection();
  const userSessions = await getUserSessionsCollection();
  const auditLogs = await getAuditLogsCollection();

  await rootAdmins.deleteMany({});
  await rootSessions.deleteMany({});
  await superAdmins.deleteMany({});
  await superSessions.deleteMany({});
  await users.deleteMany({});
  await userSessions.deleteMany({});
  await auditLogs.deleteMany({});

  // Seed Root Admin
  const rootPassHash = await hashPassword(TEST_ROOT_PASSWORD);
  seededRootId = crypto.randomUUID();
  await rootAdmins.insertOne({
    _id: seededRootId,
    email: TEST_ROOT_EMAIL,
    username: 'root_master',
    passwordHash: rootPassHash,
    displayName: 'Platform Root Administrator',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });
  rootCookie = await loginAndGetCookie(TEST_ROOT_EMAIL, TEST_ROOT_PASSWORD);

  // Seed Super Admin
  const superPassHash = await hashPassword(TEST_SUPER_PASSWORD);
  seededSuperId = crypto.randomUUID();
  await superAdmins.insertOne({
    _id: seededSuperId,
    email: TEST_SUPER_EMAIL,
    username: 'super_operator',
    passwordHash: superPassHash,
    displayName: 'Standard Super Administrator',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });
  superCookie = await loginAndGetCookie(TEST_SUPER_EMAIL, TEST_SUPER_PASSWORD);
});

after(async () => {
  await closeMongo();
});

// ── 1. Definitive Role Hierarchy & Route Guards ──

test('Admin Auth: Unauthenticated request to /admin/super-admins is rejected with 401', async () => {
  const res = await request(app)
    .get('/api/v1/admin/super-admins')
    .expect(401);

  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('Admin Auth: Ordinary user session receives 403 Forbidden on /admin/* endpoints', async () => {
  // Register an ordinary user
  const userRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'ordinary_joe',
      displayName: 'Joe User',
      email: 'joe@example.com',
      password: 'JoePassword123!',
      confirmPassword: 'JoePassword123!',
    })
    .expect(201);

  const cookies = userRes.headers['set-cookie'];
  const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  const userCookie = `${SESSION_COOKIE_NAME}=${match[1]}`;

  // Try to access super-admins
  const res1 = await request(app)
    .get('/api/v1/admin/super-admins')
    .set('Cookie', userCookie)
    .expect(403);
  assert.equal(res1.body.error.code, 'FORBIDDEN');

  // Try to access users management
  const res2 = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', userCookie)
    .expect(403);
  assert.equal(res2.body.error.code, 'FORBIDDEN');

  // Try to access audit logs
  const res3 = await request(app)
    .get('/api/v1/admin/audit-logs')
    .set('Cookie', userCookie)
    .expect(403);
  assert.equal(res3.body.error.code, 'FORBIDDEN');
});

test('Role Boundary: Super Admin receives 403 Forbidden on all Super Admin management endpoints', async () => {
  // 1. GET /admin/super-admins
  const getRes = await request(app)
    .get('/api/v1/admin/super-admins')
    .set('Cookie', superCookie)
    .expect(403);
  assert.equal(getRes.body.error.code, 'FORBIDDEN');

  // 2. POST /admin/super-admins
  const postRes = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Cookie', superCookie)
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'new_super',
      displayName: 'New Super Admin',
      email: 'newsuper@example.com',
      password: 'Password12345!',
      confirmPassword: 'Password12345!',
    })
    .expect(403);
  assert.equal(postRes.body.error.code, 'FORBIDDEN');

  // 3. PATCH /admin/super-admins/:id/status
  const patchRes = await request(app)
    .patch(`/api/v1/admin/super-admins/${seededSuperId}/status`)
    .set('Cookie', superCookie)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'disabled' })
    .expect(403);
  assert.equal(patchRes.body.error.code, 'FORBIDDEN');

  // 4. DELETE /admin/super-admins/:id
  const deleteRes = await request(app)
    .delete(`/api/v1/admin/super-admins/${seededSuperId}`)
    .set('Cookie', superCookie)
    .set('Origin', 'http://localhost:5173')
    .expect(403);
  assert.equal(deleteRes.body.error.code, 'FORBIDDEN');

  // 5. POST /admin/super-admins/:id/revoke-sessions
  const revokeRes = await request(app)
    .post(`/api/v1/admin/super-admins/${seededSuperId}/revoke-sessions`)
    .set('Cookie', superCookie)
    .set('Origin', 'http://localhost:5173')
    .expect(403);
  assert.equal(revokeRes.body.error.code, 'FORBIDDEN');

  // 6. GET /admin/audit-logs (detailed audit logs are Root Admin only)
  const auditRes = await request(app)
    .get('/api/v1/admin/audit-logs')
    .set('Cookie', superCookie)
    .expect(403);
  assert.equal(auditRes.body.error.code, 'FORBIDDEN');
});

test('CSRF Guard: Cross-origin mutating requests to /admin/* are rejected with 403 Forbidden', async () => {
  const res = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Cookie', rootCookie)
    .set('Origin', 'https://attacker.evil.com')
    .send({
      displayName: 'Attacker Admin',
      email: 'attacker@evil.com',
      password: 'password12345',
      confirmPassword: 'password12345',
    })
    .expect(403);

  assert.equal(res.body.error.code, 'FORBIDDEN');
});

// ── 2. Root Administrator Management of Super Admins ──

test('Root Admin: List Super Admins returns safe profiles without password hashes', async () => {
  const res = await request(app)
    .get('/api/v1/admin/super-admins')
    .set('Cookie', rootCookie)
    .expect(200);

  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  const admin = res.body.data[0];
  assert.equal(admin.id, seededSuperId);
  assert.equal(admin.email, TEST_SUPER_EMAIL);
  assert.equal(admin.displayName, 'Standard Super Administrator');
  assert.equal(admin.status, 'active');
  assert.equal(admin.passwordHash, undefined, 'passwordHash must never be returned');
});

test('Root Admin: Create Super Admin defaults to DISABLED status and cannot self-activate', async () => {
  const newEmail = 'junior.operator@animemanager.local';
  const newPassword = 'JuniorPassword123#';

  const res = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'junior_op',
      displayName: 'Junior Operator',
      email: newEmail,
      password: newPassword,
      confirmPassword: newPassword,
      status: 'active', // Adversarial attempt: should be ignored and forced to disabled
    })
    .expect(201);

  assert.equal(res.body.data.status, 'disabled', 'New Super Admin must be disabled by default');
  assert.equal(res.body.data.email, newEmail);
  assert.equal(res.body.data.passwordHash, undefined);

  // In database, status is disabled and password is scrypt hashed
  const superAdmins = await getSuperAdminsCollection();
  const doc = await superAdmins.findOne({ email: newEmail });
  assert.ok(doc);
  assert.equal(doc.status, 'disabled');
  assert.ok(doc.passwordHash.startsWith('scrypt$v1$'));

  // Disabled Super Admin cannot log in
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: newEmail, password: newPassword })
    .expect(401);
  assert.equal(loginRes.body.error.code, 'UNAUTHORIZED');
});

test('Root Admin: Activate, Disable, and Delete Super Admin lifecycle', async () => {
  // 1. Create disabled Super Admin
  const newEmail = 'lifecycle.admin@animemanager.local';
  const newPass = 'LifecyclePass123!';
  const createRes = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'lifecycle_admin',
      displayName: 'Lifecycle Admin',
      email: newEmail,
      password: newPass,
      confirmPassword: newPass,
    })
    .expect(201);

  const adminId = createRes.body.data.id;
  assert.equal(createRes.body.data.status, 'disabled');

  // 2. Activate Super Admin
  const actRes = await request(app)
    .patch(`/api/v1/admin/super-admins/${adminId}/status`)
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'active' })
    .expect(200);
  assert.equal(actRes.body.data.status, 'active');

  // Now the activated admin CAN log in
  const adminCookie = await loginAndGetCookie(newEmail, newPass);
  assert.ok(adminCookie);

  // 3. Disable Super Admin (should revoke active sessions)
  const disRes = await request(app)
    .patch(`/api/v1/admin/super-admins/${adminId}/status`)
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'disabled' })
    .expect(200);
  assert.equal(disRes.body.data.status, 'disabled');

  // Using the old cookie now fails
  await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', adminCookie)
    .expect(401);

  // 4. Delete Super Admin
  await request(app)
    .delete(`/api/v1/admin/super-admins/${adminId}`)
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .expect(200);

  const superAdmins = await getSuperAdminsCollection();
  const deletedDoc = await superAdmins.findOne({ _id: adminId });
  assert.equal(deletedDoc, null);
});

test('Root Admin: Revoke all sessions for a Super Admin succeeds immediately', async () => {
  const res = await request(app)
    .post(`/api/v1/admin/super-admins/${seededSuperId}/revoke-sessions`)
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .expect(200);

  assert.match(res.body.data.message, /revoked/i);

  // Super Admin's session is now invalidated
  await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', superCookie)
    .expect(401);
});

// ── 3. Super Admin & Root Admin Management of Users ──

test('User Management: Both Root Admin and Super Admin can list users and update statuses', async () => {
  // Register two ordinary users
  await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_alpha',
      displayName: 'User Alpha',
      email: 'alpha@example.com',
      password: 'AlphaPassword123!',
      confirmPassword: 'AlphaPassword123!',
    })
    .expect(201);

  const reg2 = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      username: 'user_beta',
      displayName: 'User Beta',
      email: 'beta@example.com',
      password: 'BetaPassword123!',
      confirmPassword: 'BetaPassword123!',
    })
    .expect(201);

  const betaId = reg2.body.data.user.id;

  // Super Admin lists users (includes canonical owner + 2 registered users = 3)
  const listRes = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', superCookie)
    .expect(200);

  assert.ok(Array.isArray(listRes.body.data));
  assert.equal(listRes.body.data.length, 3);

  // Super Admin restricts user_beta
  const restrictRes = await request(app)
    .patch(`/api/v1/admin/users/${betaId}/status`)
    .set('Cookie', superCookie)
    .set('Origin', 'http://localhost:5173')
    .send({ status: 'restricted', reason: 'Policy violation review' })
    .expect(200);

  assert.equal(restrictRes.body.data.status, 'restricted');

  // Root Admin revokes user_beta sessions
  const revokeRes = await request(app)
    .post(`/api/v1/admin/users/${betaId}/revoke-sessions`)
    .set('Cookie', rootCookie)
    .set('Origin', 'http://localhost:5173')
    .expect(200);

  assert.match(revokeRes.body.data.message, /revoked/i);
});

// ── 4. Audit Log Access Matrix ──

test('Audit Matrix: Root Admin views full audit logs; Super Admin views privacy-safe user activity only', async () => {
  // Super Admin view of privacy-safe user activity
  const userActRes = await request(app)
    .get('/api/v1/admin/user-activity')
    .set('Cookie', superCookie)
    .expect(200);

  assert.ok(Array.isArray(userActRes.body.data));

  // Root Admin view of comprehensive audit logs
  const rootAuditRes = await request(app)
    .get('/api/v1/admin/audit-logs')
    .set('Cookie', rootCookie)
    .expect(200);

  assert.ok(Array.isArray(rootAuditRes.body.data));
  assert.ok(rootAuditRes.body.earliestHistory !== undefined);
});
