import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcDir = path.resolve(__dirname, '../src');

test('Router Configuration: All required Phase 04 Part 1 routes are registered', () => {
  const routerCode = fs.readFileSync(path.join(srcDir, 'app/router.tsx'), 'utf-8');

  // Verify shell wraps all routes
  assert.ok(routerCode.includes('<Route element={<AppShell />}>'), 'AppShell must wrap routes');

  // Verify all required routes
  assert.ok(routerCode.includes('element={<Dashboard />}'), 'Must register Dashboard index route');
  assert.ok(routerCode.includes('path="bookmarks"'), 'Must register /bookmarks route');
  assert.ok(routerCode.includes('path="my-list"'), 'Must register /my-list route');
  assert.ok(routerCode.includes('path="collections"'), 'Must register /collections route');
  assert.ok(routerCode.includes('path="titles"'), 'Must register /titles route');
  assert.ok(routerCode.includes('path="settings"'), 'Must register /settings route');
  assert.ok(routerCode.includes('path="*"'), 'Must register catch-all 404 route');
});

test('Navigation Scope: Sidebar contains only approved primary destinations and omits Import', () => {
  const sidebarCode = fs.readFileSync(path.join(srcDir, 'components/layout/Sidebar.tsx'), 'utf-8');

  assert.ok(sidebarCode.includes("to: '/'"), 'Sidebar must include Dashboard');
  assert.ok(sidebarCode.includes("to: '/bookmarks'"), 'Sidebar must include Bookmarks');
  assert.ok(sidebarCode.includes("to: '/my-list'"), 'Sidebar must include My List');
  assert.ok(sidebarCode.includes("to: '/collections'"), 'Sidebar must include Collections');
  assert.ok(sidebarCode.includes("to: '/titles'"), 'Sidebar must include Titles');
  assert.ok(sidebarCode.includes("to: '/settings'"), 'Sidebar must include Settings');

  // Import MUST NOT be in navItems
  assert.ok(
    !sidebarCode.includes("{ to: '/import'"),
    'Import must NOT be exposed as a primary navigation item in Sidebar'
  );
});

test('AppShell: Page titles map all destinations including Collections', () => {
  const shellCode = fs.readFileSync(path.join(srcDir, 'components/layout/AppShell.tsx'), 'utf-8');

  assert.ok(shellCode.includes("'/collections': 'Collections'"), 'AppShell must map /collections page title');
  assert.ok(shellCode.includes("'/my-list':"), 'AppShell must map /my-list page title');
  assert.ok(shellCode.includes("'/bookmarks':"), 'AppShell must map /bookmarks page title');
  assert.ok(shellCode.includes("'/titles':"), 'AppShell must map /titles page title');
});

test('Dashboard: Implements dual spotlight cards and navigation to all primary sections', () => {
  const dashboardCode = fs.readFileSync(path.join(srcDir, 'pages/Dashboard.tsx'), 'utf-8');

  assert.ok(dashboardCode.includes('spotlight-card--anime'), 'Dashboard must include anime spotlight card');
  assert.ok(dashboardCode.includes('spotlight-card--manhwa'), 'Dashboard must include manhwa spotlight card');
  assert.ok(dashboardCode.includes('dashboard-filter-section') || dashboardCode.includes('FilterChips'), 'Dashboard must include filter chips row');
  assert.ok(dashboardCode.includes('/bookmarks'), 'Dashboard must link to Bookmarks');
  assert.ok(dashboardCode.includes('/my-list'), 'Dashboard must link to My List');
  assert.ok(dashboardCode.includes('/collections'), 'Dashboard must link to Collections');
  assert.ok(dashboardCode.includes('/titles'), 'Dashboard must link to Titles');
});
