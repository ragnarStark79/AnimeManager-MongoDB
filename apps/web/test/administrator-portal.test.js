import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webSrc = path.resolve(__dirname, '../src');

test('Role Separation Router: Registers /register, /administrator, and /superadmin routes', () => {
  const routerPath = path.resolve(webSrc, 'app/router.tsx');
  const content = fs.readFileSync(routerPath, 'utf8');

  assert.ok(content.includes('RegisterPage'), 'Router must import RegisterPage');
  assert.ok(content.includes('path="register"'), 'Router must register path="register"');

  assert.ok(content.includes('AdministratorPage'), 'Router must import AdministratorPage');
  assert.ok(content.includes('path="administrator"'), 'Router must register path="administrator"');

  assert.ok(content.includes('SuperAdminPage'), 'Router must import SuperAdminPage');
  assert.ok(content.includes('path="superadmin"'), 'Router must register path="superadmin"');
});

test('ApiClient: Exports complete role-aware auth and admin methods', () => {
  const clientPath = path.resolve(webSrc, 'lib/api-client.ts');
  const content = fs.readFileSync(clientPath, 'utf8');

  // Auth methods
  assert.ok(content.includes('register:'), 'ApiClient auth must define register');
  assert.ok(content.includes('login:'), 'ApiClient auth must define login');
  assert.ok(content.includes('logout:'), 'ApiClient auth must define logout');

  // Admin methods
  assert.ok(content.includes('admin = {'), 'ApiClient must define admin namespace');
  assert.ok(content.includes('listSuperAdmins:'), 'admin must define listSuperAdmins');
  assert.ok(content.includes('createSuperAdmin:'), 'admin must define createSuperAdmin');
  assert.ok(content.includes('updateSuperAdminStatus:'), 'admin must define updateSuperAdminStatus');
  assert.ok(content.includes('deleteSuperAdmin:'), 'admin must define deleteSuperAdmin');
  assert.ok(content.includes('revokeSuperAdminSessions:'), 'admin must define revokeSuperAdminSessions');
  assert.ok(content.includes('getAuditLogs:'), 'admin must define getAuditLogs');
  assert.ok(content.includes('listUsers:'), 'admin must define listUsers');
  assert.ok(content.includes('getUserById:'), 'admin must define getUserById');
  assert.ok(content.includes('updateUserStatus:'), 'admin must define updateUserStatus');
  assert.ok(content.includes('deleteUser:'), 'admin must define deleteUser');
  assert.ok(content.includes('revokeUserSessions:'), 'admin must define revokeUserSessions');
  assert.ok(content.includes('getUserActivity:'), 'admin must define getUserActivity');
});

test('Root Administrator Portal: Page implements Overview, Users, Super Admins, Audit, and System', () => {
  const pagePath = path.resolve(webSrc, 'pages/AdministratorPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('Root Administrator Portal'), 'Page must display Root Administrator Portal title');
  assert.ok(content.includes('activeTab === \'overview\''), 'Page must contain Overview tab');
  assert.ok(content.includes('activeTab === \'users\''), 'Page must contain Users tab');
  assert.ok(content.includes('activeTab === \'superadmins\''), 'Page must contain Super Admins tab');
  assert.ok(content.includes('activeTab === \'audit\''), 'Page must contain Activity & Audit tab');
  assert.ok(content.includes('activeTab === \'system\''), 'Page must contain System Status tab');

  assert.ok(content.includes('Create Super Admin'), 'Root Admin can create Super Admins');
  assert.ok(content.includes('confirmDisableAdmin'), 'Page must contain confirmation dialog for disabling Super Admin');
  assert.ok(content.includes('confirmDeleteAdmin'), 'Page must contain confirmation dialog for deleting Super Admin');
  assert.ok(content.includes('confirmRevokeAdminSessions'), 'Page must contain confirmation dialog for revoking admin sessions');
});

test('Super Admin Portal: Strictly excludes Super Admin creation and management controls', () => {
  const pagePath = path.resolve(webSrc, 'pages/SuperAdminPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('Super Admin Portal'), 'Page must display Super Admin Portal title');
  assert.ok(content.includes('activeTab === \'overview\''), 'Page must contain Overview tab');
  assert.ok(content.includes('activeTab === \'users\''), 'Page must contain Users tab');
  assert.ok(content.includes('activeTab === \'activity\''), 'Page must contain User Activity tab');

  // Restrictions verification:
  assert.equal(content.includes('createSuperAdmin'), false, 'Super Admin portal must NOT call createSuperAdmin');
  assert.equal(content.includes('Create Super Admin'), false, 'Super Admin portal must NOT contain Create Super Admin button');
  assert.equal(content.includes('deleteSuperAdmin'), false, 'Super Admin portal must NOT call deleteSuperAdmin');
  assert.equal(content.includes('revokeSuperAdminSessions'), false, 'Super Admin portal must NOT call revokeSuperAdminSessions');
  assert.equal(content.includes('listSuperAdmins'), false, 'Super Admin portal must NOT list other Super Admins');
});

test('User Registration Page: Contains required fields and client validations', () => {
  const pagePath = path.resolve(webSrc, 'pages/RegisterPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes('Create Account'), 'Page must display Create Account title');
  assert.ok(content.includes('id="reg-username"'), 'Page must have username input');
  assert.ok(content.includes('id="reg-fullname"'), 'Page must have fullname input');
  assert.ok(content.includes('id="reg-email"'), 'Page must have email input');
  assert.ok(content.includes('id="reg-password"'), 'Page must have password input');
  assert.ok(content.includes('id="reg-confirm-password"'), 'Page must have confirm password input');
});

test('Settings Page: Administrator shortcuts are restricted by role', () => {
  const pagePath = path.resolve(webSrc, 'pages/SettingsPage.tsx');
  const content = fs.readFileSync(pagePath, 'utf8');

  assert.ok(content.includes("user?.role === 'root_admin'"), 'Must guard Root Admin Portal button');
  assert.ok(content.includes("user?.role === 'superadmin'"), 'Must guard Super Admin Portal button');
  assert.ok(content.includes("Root Admin Portal"), 'Root Admin portal button text');
  assert.ok(content.includes("Super Admin Portal"), 'Super Admin portal button text');
});

test('Security Hygiene: Zero secrets in frontend source', () => {
  const filesToCheck = [
    path.resolve(webSrc, 'pages/AdministratorPage.tsx'),
    path.resolve(webSrc, 'pages/SuperAdminPage.tsx'),
    path.resolve(webSrc, 'pages/RegisterPage.tsx'),
    path.resolve(webSrc, 'pages/LoginPage.tsx'),
    path.resolve(webSrc, 'lib/auth-context.tsx'),
    path.resolve(webSrc, 'lib/api-client.ts'),
  ];

  for (const f of filesToCheck) {
    const text = fs.readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{20,}/, `No JWT tokens in ${path.basename(f)}`);
    assert.doesNotMatch(text, /mongodb(\+srv)?:\/\//, `No MongoDB URIs in ${path.basename(f)}`);
    assert.doesNotMatch(text, /scrypt\$v1\$/, `No password hashes in ${path.basename(f)}`);
  }
});
