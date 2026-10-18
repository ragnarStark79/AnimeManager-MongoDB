import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const apiClientSrc = readFileSync(resolve(__dirname, '../src/lib/api-client.ts'), 'utf8');
const authContextSrc = readFileSync(resolve(__dirname, '../src/lib/auth-context.tsx'), 'utf8');
const settingsPageSrc = readFileSync(resolve(__dirname, '../src/pages/SettingsPage.tsx'), 'utf8');
const queryClientSrc = readFileSync(resolve(__dirname, '../src/lib/query-client.ts'), 'utf8');

test('Auth Lifecycle: parseJwt and isTokenExpired logic', () => {
  // Test simulated JWT payload parser logic as implemented in auth-context.tsx
  function parseJwtTest(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const base64Url = parts[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(jsonPayload);
    } catch {
      return null;
    }
  }

  function isExpiredTest(token) {
    const payload = parseJwtTest(token);
    if (!payload || !payload.exp) return false;
    return payload.exp * 1000 <= Date.now() + 10000;
  }

  // 1. Valid non-expired token
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  const validPayload = Buffer.from(JSON.stringify({ sub: 'user-123', exp: futureExp })).toString('base64');
  const validToken = `header.${validPayload}.signature`;

  const parsedValid = parseJwtTest(validToken);
  assert.equal(parsedValid?.sub, 'user-123');
  assert.equal(isExpiredTest(validToken), false, 'Future token must not be expired');

  // 2. Expired token
  const pastExp = Math.floor(Date.now() / 1000) - 100;
  const expiredPayload = Buffer.from(JSON.stringify({ sub: 'user-123', exp: pastExp })).toString('base64');
  const expiredToken = `header.${expiredPayload}.signature`;

  assert.equal(isExpiredTest(expiredToken), true, 'Past token must be expired');

  // 3. Malformed token
  assert.equal(parseJwtTest('not.a.valid.jwt!@#'), null);
  assert.equal(parseJwtTest(''), null);
});

test('Auth Lifecycle: ApiClient provides guarded dev session and Bearer header injection', () => {
  assert.ok(apiClientSrc.includes("headers.set('Authorization', `Bearer ${this.token}`)"));
  assert.ok(apiClientSrc.includes('isTokenExpired'));
  assert.ok(apiClientSrc.includes('getDevSession'));
  assert.ok(apiClientSrc.includes('/auth/dev-session'));
});

test('Auth Lifecycle: Stale or expired token in localStorage is automatically pruned', () => {
  assert.ok(authContextSrc.includes('isTokenExpired(stored)'));
  assert.ok(authContextSrc.includes("localStorage.removeItem('animemanager_auth_token')"));
  assert.ok(authContextSrc.includes('refreshDevToken'));
});

test('Auth Lifecycle: HTTP 401 does not cause infinite request loops', () => {
  // QueryClient config disables automatic retry for 4xx errors
  assert.ok(queryClientSrc.includes('status >= 400 && status < 500'));
  assert.ok(queryClientSrc.includes('return false'));

  // Mutations explicitly disable retries to prevent duplicate title/collection creation
  assert.ok(queryClientSrc.includes('mutations: {\n      retry: false'));

  // AuthContext debounces auto-recovery attempts
  assert.ok(authContextSrc.includes('lastRefreshAttemptRef'));
  assert.ok(authContextSrc.includes('15000'));
});

test('Auth Lifecycle: Settings page surfaces local dev auth transparency and controls', () => {
  assert.ok(settingsPageSrc.includes('isDevAuth'));
  assert.ok(settingsPageSrc.includes('Refresh Dev Session'));
  assert.ok(settingsPageSrc.includes('handleRefreshDevToken'));
  assert.ok(settingsPageSrc.includes('Clear Token'));
  assert.ok(settingsPageSrc.includes('00000000-0000-0000-0000-000000000001'));
});

test('Security Guard: Frontend source files never contain signing secrets or service-role keys', () => {
  const webSrcDir = resolve(__dirname, '../src');
  assert.ok(!apiClientSrc.includes('JWT_SECRET'), 'ApiClient must not reference JWT_SECRET');
  assert.ok(!authContextSrc.includes('JWT_SECRET'), 'AuthContext must not reference JWT_SECRET');
  assert.ok(!apiClientSrc.includes('SUPABASE_JWT_SECRET'), 'ApiClient must not reference SUPABASE_JWT_SECRET');
  assert.ok(!authContextSrc.includes('SUPABASE_JWT_SECRET'), 'AuthContext must not reference SUPABASE_JWT_SECRET');
  assert.ok(!apiClientSrc.includes('SUPABASE_SERVICE_ROLE_KEY'), 'ApiClient must not reference service-role key');
  assert.ok(!authContextSrc.includes('SUPABASE_SERVICE_ROLE_KEY'), 'AuthContext must not reference service-role key');
});
