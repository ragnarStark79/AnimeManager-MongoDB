import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import crypto from 'node:crypto';
import { generate, generateSecret } from 'otplib';

import { app } from '../dist/app.js';
import { resetMongoTestDatabase } from './helpers.js';
import {
  getDb,
  getUsersCollection,
  getSuperAdminsCollection,
  getRootAdminsCollection,
  getAccountMfaCollection,
  getAuditLogsCollection,
  closeMongo,
} from '../dist/repositories/mongo.js';
import { hashPassword } from '../dist/utils/password.js';
import { resetLoginRateLimits } from '../dist/middleware/login-rate-limit.middleware.js';
import { SESSION_COOKIE_NAME } from '../dist/utils/cookie.js';
import {
  encryptTotpSecret,
  decryptTotpSecret,
  generateRecoveryCodes,
  hashRecoveryCode,
  generateMfaChallengeToken,
  verifyMfaChallengeToken,
} from '../dist/utils/mfa-crypto.js';

const TEST_USER_EMAIL = 'mfa.user@animemanager.local';
const TEST_USER_PASSWORD = 'CorrectPassword123!';
let testUserId = '';

const TEST_SUPERADMIN_EMAIL = 'mfa.superadmin@animemanager.local';
const TEST_SUPERADMIN_PASSWORD = 'SuperAdminPassword123!';
let testSuperAdminId = '';

const TEST_ROOTADMIN_EMAIL = 'mfa.rootadmin@animemanager.local';
const TEST_ROOTADMIN_PASSWORD = 'RootAdminPassword123!';
let testRootAdminId = '';

before(async () => {
  await resetMongoTestDatabase();
});

beforeEach(async () => {
  resetLoginRateLimits();
  const db = await getDb();
  await db.collection('users').deleteMany({});
  await db.collection('super_admins').deleteMany({});
  await db.collection('root_admins').deleteMany({});
  await db.collection('user_sessions').deleteMany({});
  await db.collection('super_admin_sessions').deleteMany({});
  await db.collection('root_admin_sessions').deleteMany({});
  await db.collection('account_mfa').deleteMany({});
  await db.collection('audit_logs').deleteMany({});

  // Seed User
  testUserId = crypto.randomUUID();
  const userPasswordHash = await hashPassword(TEST_USER_PASSWORD);
  await db.collection('users').insertOne({
    _id: testUserId,
    username: 'mfauser',
    email: TEST_USER_EMAIL,
    displayName: 'MFA User',
    passwordHash: userPasswordHash,
    role: 'user',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });

  // Seed Super Admin
  testSuperAdminId = crypto.randomUUID();
  const superPasswordHash = await hashPassword(TEST_SUPERADMIN_PASSWORD);
  await db.collection('super_admins').insertOne({
    _id: testSuperAdminId,
    username: 'mfasuper',
    email: TEST_SUPERADMIN_EMAIL,
    displayName: 'MFA Super Admin',
    passwordHash: superPasswordHash,
    role: 'superadmin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });

  // Seed Root Admin
  testRootAdminId = crypto.randomUUID();
  const rootPasswordHash = await hashPassword(TEST_ROOTADMIN_PASSWORD);
  await db.collection('root_admins').insertOne({
    _id: testRootAdminId,
    username: 'mfaroot',
    email: TEST_ROOTADMIN_EMAIL,
    displayName: 'MFA Root Admin',
    passwordHash: rootPasswordHash,
    role: 'root_admin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });
});

after(async () => {
  await closeMongo();
});

// Helper to log in a user and obtain their session cookie
async function loginAndGetCookie(email, password) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  assert.equal(res.status, 200);
  const cookies = res.headers['set-cookie'];
  assert.ok(cookies, 'Expected session cookie in login response');
  return cookies;
}

test('MFA Crypto: AES-256-GCM encryption, decryption, and tamper detection', () => {
  const rawSecret = 'JBSWY3DPEHPK3PXP';
  const encrypted = encryptTotpSecret(rawSecret);
  assert.ok(encrypted.startsWith('gcm$v1$'), 'Ciphertext must start with version prefix');

  const decrypted = decryptTotpSecret(encrypted);
  assert.equal(decrypted, rawSecret, 'Decrypted secret must match plaintext');

  // Tamper with authentication tag or payload
  const parts = encrypted.split('$');
  parts[3] = 'ffffffffffffffffffffffffffffffff'; // Corrupt tag
  const tampered = parts.join('$');

  assert.throws(
    () => decryptTotpSecret(tampered),
    /Authentication tag verification failed/,
    'Tampered secret must fail decryption'
  );
});

test('MFA Crypto: Recovery code generation and single-use hashing', () => {
  const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
  assert.equal(plainCodes.length, 8);
  assert.equal(hashedCodes.length, 8);

  for (let i = 0; i < 8; i++) {
    assert.match(plainCodes[i], /^[A-Z0-9]{5}-[A-Z0-9]{5}$/, 'Code must follow XXXXX-XXXXX format');
    assert.equal(hashRecoveryCode(plainCodes[i]), hashedCodes[i], 'Hash must match code digest');
  }
});

test('MFA Crypto: Challenge token creation and verification', () => {
  const token = generateMfaChallengeToken({ accountId: 'test-123', role: 'user' });
  assert.ok(token && typeof token === 'string');

  const claims = verifyMfaChallengeToken(token);
  assert.equal(claims.accountId, 'test-123');
  assert.equal(claims.role, 'user');
});

test('MFA Status: Unauthenticated access is rejected with 401', async () => {
  const res = await request(app).get('/api/v1/auth/mfa/status');
  assert.equal(res.status, 401);
});

test('MFA Status: Authenticated user receives enabled=false initially', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const res = await request(app)
    .get('/api/v1/auth/mfa/status')
    .set('Cookie', cookie);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.enabled, false);
  assert.equal(res.body.data.enrolledAt, null);
  assert.equal(res.body.data.recoveryCodesRemaining, 0);
});

test('MFA Setup: Incorrect password rejects enrollment with 401', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const res = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: 'WrongPassword999!' });

  assert.equal(res.status, 401);
  assert.match(res.body.error.message, /Incorrect password/);
});

test('MFA Setup: Correct password returns QR code data URL, manual key, and persists pending secret', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const res = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });

  assert.equal(res.status, 200);
  assert.ok(res.body.data.qrCodeDataUrl.startsWith('data:image/png;base64,'));
  assert.ok(res.body.data.manualEntryKey.length >= 16);
  assert.ok(res.body.data.expiresAt);

  // Verify pending secret stored encrypted in MongoDB
  const accountMfaCol = await getAccountMfaCollection();
  const mfaDoc = await accountMfaCol.findOne({ accountId: testUserId, accountRole: 'user' });
  assert.ok(mfaDoc, 'MFA document must exist');
  assert.equal(mfaDoc.totpEnabled, false, 'MFA must NOT be enabled yet');
  assert.ok(mfaDoc.pendingEncryptedTotpSecret.startsWith('gcm$v1$'));
  assert.equal(mfaDoc.encryptedTotpSecret, null);
});

test('MFA Verify Setup: Incorrect code fails activation and keeps MFA disabled', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });

  const verifyRes = await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: '000000' });

  assert.equal(verifyRes.status, 400);
  assert.match(verifyRes.body.error.message, /Invalid verification code/);

  const accountMfaCol = await getAccountMfaCollection();
  const mfaDoc = await accountMfaCol.findOne({ accountId: testUserId, accountRole: 'user' });
  assert.equal(mfaDoc.totpEnabled, false);
});

test('MFA Verify Setup: Valid code activates 2FA and returns 8 single-use recovery codes', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });

  const plainSecret = setupRes.body.data.manualEntryKey;
  const currentOtp = await generate({ secret: plainSecret });

  const verifyRes = await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: currentOtp });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.success, true);
  assert.equal(verifyRes.body.data.recoveryCodes.length, 8);

  const accountMfaCol = await getAccountMfaCollection();
  const mfaDoc = await accountMfaCol.findOne({ accountId: testUserId, accountRole: 'user' });
  assert.equal(mfaDoc.totpEnabled, true);
  assert.ok(mfaDoc.encryptedTotpSecret.startsWith('gcm$v1$'));
  assert.equal(mfaDoc.pendingEncryptedTotpSecret, null);
  assert.equal(mfaDoc.recoveryCodeHashes.length, 8);
});

test('Login with MFA: Returns challenge token and NO session cookie when 2FA is active', async () => {
  // 1. Enable 2FA for test user
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  const currentOtp = await generate({ secret });
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: currentOtp });

  // 2. Perform fresh login
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.mfaRequired, true);
  assert.ok(loginRes.body.data.challengeToken, 'Must provide challenge token');
  assert.equal(loginRes.body.data.role, 'user');

  // Verify NO session cookie was set
  const cookies = loginRes.headers['set-cookie'] || [];
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  assert.ok(!sessionCookie, 'Normal session cookie must NOT be issued before 2FA verification');

  // 3. Challenge token cannot access protected endpoints
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Authorization', `Bearer ${loginRes.body.data.challengeToken}`);
  assert.equal(meRes.status, 401);
});

test('Challenge Verification: Valid OTP completes challenge and sets ambient session cookie', async () => {
  // 1. Setup 2FA
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  // 2. Login to get challenge
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  const challengeToken = loginRes.body.data.challengeToken;

  // 3. Complete challenge with valid OTP
  const validOtp = await generate({ secret });
  const verifyRes = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken, code: validOtp });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.user.id, testUserId);
  assert.equal(verifyRes.body.data.user.email, TEST_USER_EMAIL);

  const cookies = verifyRes.headers['set-cookie'];
  assert.ok(cookies, 'Must set session cookie upon successful MFA verification');
  const sessionCookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
  assert.ok(sessionCookie);

  // 4. Verify cookie authenticates calls to /auth/me
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', sessionCookie);
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.user.id, testUserId);
});

test('Replay Protection: Replaying the same accepted OTP within its time window is rejected', async () => {
  // 1. Setup 2FA
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  // 2. First login challenge
  const loginRes1 = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  const challengeToken1 = loginRes1.body.data.challengeToken;
  const otpCode = await generate({ secret });

  const verify1 = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken: challengeToken1, code: otpCode });
  assert.equal(verify1.status, 200);

  // 3. Second login attempt with a fresh challenge but reusing the SAME otpCode
  const loginRes2 = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  const challengeToken2 = loginRes2.body.data.challengeToken;

  const verify2 = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken: challengeToken2, code: otpCode });

  assert.equal(verify2.status, 401);
  assert.match(verify2.body.error.message, /This verification code has already been used/);
});

test('Recovery Codes: Single-use redemption succeeds once and cannot be replayed', async () => {
  // 1. Setup 2FA and capture recovery codes
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  const verifySetupRes = await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  const recoveryCodes = verifySetupRes.body.data.recoveryCodes;
  assert.equal(recoveryCodes.length, 8);
  const recoveryCodeToUse = recoveryCodes[0];

  // 2. Login using recovery code
  const loginRes1 = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  const challengeToken1 = loginRes1.body.data.challengeToken;

  const recoveryVerify1 = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken: challengeToken1, code: recoveryCodeToUse });

  assert.equal(recoveryVerify1.status, 200);
  assert.ok(recoveryVerify1.headers['set-cookie']);

  // Check remaining recovery codes count
  const statusRes = await request(app)
    .get('/api/v1/auth/mfa/status')
    .set('Cookie', recoveryVerify1.headers['set-cookie']);
  assert.equal(statusRes.body.data.recoveryCodesRemaining, 7);

  // 3. Attempting to use the SAME recovery code again must fail
  const loginRes2 = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });
  const challengeToken2 = loginRes2.body.data.challengeToken;

  const recoveryVerify2 = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken: challengeToken2, code: recoveryCodeToUse });

  assert.equal(recoveryVerify2.status, 401);
  assert.match(recoveryVerify2.body.error.message, /Invalid verification code or recovery code/);
});

test('Regenerate Recovery Codes: Replaces old codes with fresh set', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  const verifySetupRes = await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  const initialCodes = verifySetupRes.body.data.recoveryCodes;

  // Regenerate codes
  const currentOtp = await generate({ secret });
  const regenRes = await request(app)
    .post('/api/v1/auth/mfa/recovery-codes/regenerate')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD, code: currentOtp });

  assert.equal(regenRes.status, 200);
  assert.equal(regenRes.body.data.recoveryCodes.length, 8);
  assert.notDeepEqual(regenRes.body.data.recoveryCodes, initialCodes);

  // Old code should now be invalid
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

  const failOldRecovery = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({ challengeToken: loginRes.body.data.challengeToken, code: initialCodes[0] });

  assert.equal(failOldRecovery.status, 401);
});

test('Disable MFA: Requires password and OTP, clears configuration, allows password-only login', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  // Disable with wrong password fails
  const failDisable = await request(app)
    .post('/api/v1/auth/mfa/disable')
    .set('Cookie', cookie)
    .send({ password: 'WrongPassword!', code: await generate({ secret }) });
  assert.equal(failDisable.status, 401);

  // Disable with correct password and OTP
  const disableRes = await request(app)
    .post('/api/v1/auth/mfa/disable')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD, code: await generate({ secret }) });

  assert.equal(disableRes.status, 200);

  // Verify status is disabled
  const statusRes = await request(app)
    .get('/api/v1/auth/mfa/status')
    .set('Cookie', cookie);
  assert.equal(statusRes.body.data.enabled, false);

  // Next login logs in immediately without challenge
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD });

  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.mfaRequired, undefined);
  assert.ok(loginRes.headers['set-cookie'], 'Must issue session cookie directly');
});

test('Role Isolation: Two-Step Verification works seamlessly for Super Admin and Root Admin', async () => {
  // Test Super Admin 2FA
  const superCookie = await loginAndGetCookie(TEST_SUPERADMIN_EMAIL, TEST_SUPERADMIN_PASSWORD);
  const superSetup = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', superCookie)
    .send({ password: TEST_SUPERADMIN_PASSWORD });
  const superSecret = superSetup.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', superCookie)
    .send({ code: await generate({ secret: superSecret }) });

  const superLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_SUPERADMIN_EMAIL, password: TEST_SUPERADMIN_PASSWORD });
  assert.equal(superLogin.body.data.mfaRequired, true);
  assert.equal(superLogin.body.data.role, 'superadmin');

  const superVerify = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({
      challengeToken: superLogin.body.data.challengeToken,
      code: await generate({ secret: superSecret }),
    });
  assert.equal(superVerify.status, 200);
  assert.equal(superVerify.body.data.user.role, 'superadmin');

  // Test Root Admin 2FA
  const rootCookie = await loginAndGetCookie(TEST_ROOTADMIN_EMAIL, TEST_ROOTADMIN_PASSWORD);
  const rootSetup = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', rootCookie)
    .send({ password: TEST_ROOTADMIN_PASSWORD });
  const rootSecret = rootSetup.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', rootCookie)
    .send({ code: await generate({ secret: rootSecret }) });

  const rootLogin = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: TEST_ROOTADMIN_EMAIL, password: TEST_ROOTADMIN_PASSWORD });
  assert.equal(rootLogin.body.data.mfaRequired, true);
  assert.equal(rootLogin.body.data.role, 'root_admin');

  const rootVerify = await request(app)
    .post('/api/v1/auth/mfa/challenge-verify')
    .send({
      challengeToken: rootLogin.body.data.challengeToken,
      code: await generate({ secret: rootSecret }),
    });
  assert.equal(rootVerify.status, 200);
  assert.equal(rootVerify.body.data.user.role, 'root_admin');
});

test('Audit Privacy: Audit logs never contain OTP values, secrets, QR payloads, or recovery codes', async () => {
  const cookie = await loginAndGetCookie(TEST_USER_EMAIL, TEST_USER_PASSWORD);
  const setupRes = await request(app)
    .post('/api/v1/auth/mfa/setup')
    .set('Cookie', cookie)
    .send({ password: TEST_USER_PASSWORD });
  const secret = setupRes.body.data.manualEntryKey;
  await request(app)
    .post('/api/v1/auth/mfa/verify-setup')
    .set('Cookie', cookie)
    .send({ code: await generate({ secret }) });

  const auditLogsCol = await getAuditLogsCollection();
  const logs = await auditLogsCol.find({}).toArray();
  assert.ok(logs.length > 0, 'Audit logs must have recorded events');

  for (const log of logs) {
    const serialized = JSON.stringify(log);
    assert.ok(!serialized.includes('otpauth://'), 'Audit log must not contain otpauth URI');
    assert.ok(!serialized.includes('data:image'), 'Audit log must not contain QR data URL');
    assert.ok(!/\"code\":\"[0-9]{6}\"/.test(serialized), 'Audit log must not contain 6-digit OTP code');
    assert.ok(!/\"recoveryCodes\"/.test(serialized), 'Audit log must not contain recovery codes');
    assert.ok(!/\"password\"/.test(serialized), 'Audit log must not contain plain passwords');
  }
});
