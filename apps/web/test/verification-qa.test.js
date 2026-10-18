import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webSrcDir = path.resolve(__dirname, '../src');

// Read source files
const collectionsPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/CollectionsPage.tsx'), 'utf-8');
const importPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/ImportPage.tsx'), 'utf-8');
const settingsPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/SettingsPage.tsx'), 'utf-8');
const myListPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/MyListPage.tsx'), 'utf-8');
const bookmarksPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/BookmarksPage.tsx'), 'utf-8');
const dashboardPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/Dashboard.tsx'), 'utf-8');
const titlesPageCode = fs.readFileSync(path.join(webSrcDir, 'pages/TitlesPage.tsx'), 'utf-8');
const headerCode = fs.readFileSync(path.join(webSrcDir, 'components/layout/Header.tsx'), 'utf-8');
const addModalCode = fs.readFileSync(path.join(webSrcDir, 'components/ui/AddTitleModal.tsx'), 'utf-8');

// Read CSS files
const headerCss = fs.readFileSync(path.join(webSrcDir, 'components/layout/Header.css'), 'utf-8');
const sidebarCss = fs.readFileSync(path.join(webSrcDir, 'components/layout/Sidebar.css'), 'utf-8');
const mobileNavCss = fs.readFileSync(path.join(webSrcDir, 'components/layout/MobileNav.css'), 'utf-8');
const appShellCss = fs.readFileSync(path.join(webSrcDir, 'components/layout/AppShell.css'), 'utf-8');
const dashboardCss = fs.readFileSync(path.join(webSrcDir, 'pages/Dashboard.css'), 'utf-8');
const titlesCss = fs.readFileSync(path.join(webSrcDir, 'pages/TitlesPage.css'), 'utf-8');
const bookmarksCss = fs.readFileSync(path.join(webSrcDir, 'pages/BookmarksPage.css'), 'utf-8');
const placeholderCss = fs.readFileSync(path.join(webSrcDir, 'pages/Placeholder.css'), 'utf-8');

/* ── 1. Modal Dismissal & Keyboard Navigation ── */
test('QA: CollectionsPage modal supports backdrop click and Escape key dismissal', () => {
  assert.ok(collectionsPageCode.includes("e.key === 'Escape'"), 'CollectionsPage must listen for Escape key');
  assert.ok(collectionsPageCode.includes('setNewOpen(false)'), 'Escape listener must close dialog');
  assert.ok(collectionsPageCode.includes('e.target === e.currentTarget'), 'Backdrop click must check target equality to avoid closing on panel click');
});

test('QA: AddTitleModal handles Escape and backdrop dismissal', () => {
  assert.ok(addModalCode.includes("addEventListener('cancel'"), 'AddTitleModal must listen to native dialog cancel event');
  assert.ok(addModalCode.includes('handleBackdropClick'), 'AddTitleModal must implement handleBackdropClick');
});

test('QA: Search inputs provide accessible Escape key dismissal', () => {
  assert.ok(titlesPageCode.includes("e.key === 'Escape'"), 'TitlesPage search input must handle Escape key');
  assert.ok(headerCode.includes("e.key === 'Escape'"), 'Header global search must handle Escape key');
});

/* ── 2. Honest Preview & Non-Persistence Disclosures ── */
test('QA: ImportPage clearly discloses Phase 05 status and does not pretend persistence', () => {
  assert.ok(importPageCode.includes('Import preview'), 'ImportPage must declare import preview');
  assert.ok(importPageCode.includes('Phase 05'), 'ImportPage must state connection in Phase 05');
  assert.ok(importPageCode.includes('disabled'), 'ImportPage search button must be disabled in Phase 04');
});

test('QA: SettingsPage clearly discloses that settings features are Phase 05 only', () => {
  assert.ok(settingsPageCode.includes('Phase 05'), 'SettingsPage must reference Phase 05');
  assert.ok(/No\s+options are functional in this phase/.test(settingsPageCode), 'SettingsPage must explicitly declare non-functional interface layout');
});

test('QA: Preview forms have disabled submit buttons preventing false saves', () => {
  assert.ok(addModalCode.includes('Save Title (Phase 05)'), 'AddTitleModal submit button must indicate Phase 05');
  assert.ok(addModalCode.includes('disabled'), 'AddTitleModal submit button must be disabled');
  assert.ok(collectionsPageCode.includes('Save Collection (Phase 05)'), 'CollectionsPage submit button must indicate Phase 05');
  assert.ok(collectionsPageCode.includes('disabled'), 'CollectionsPage submit button must be disabled');
});

/* ── 3. Conceptual Distinction (My List vs Bookmarks) ── */
test('QA: My List and Bookmarks maintain strict conceptual distinction in UI', () => {
  assert.ok(myListPageCode.includes('My List vs. Bookmarks:'), 'MyListPage must explain the distinction between My List and Bookmarks');
  assert.ok(myListPageCode.includes('folders and groupings'), 'MyListPage must define My List as organizational folders/groupings');
  assert.ok(/independently of your collections/.test(bookmarksPageCode), 'BookmarksPage must state independent tracking');
});

/* ── 4. Responsive CSS Breakpoint Integrity ── */
test('QA: Header CSS accommodates desktop, tablet, and 360px mobile viewports', () => {
  assert.ok(headerCss.includes('@media (max-width: 1080px)'), 'Header must hide nav pill at <=1080px transition');
  assert.ok(headerCss.includes('@media (max-width: 768px)'), 'Header must adjust for tablet/mobile at <=768px');
  assert.ok(headerCss.includes('@media (max-width: 480px)'), 'Header must adjust for narrow mobile at <=480px');
  assert.ok(headerCss.includes('min-width: 0'), 'Header search must define min-width: 0 to prevent mobile overflow');
});

test('QA: Layout adapts between desktop sidebar and mobile bottom navigation at 768px', () => {
  assert.ok(sidebarCss.includes('@media (max-width: 768px)'), 'Sidebar must hide at <=768px');
  assert.ok(sidebarCss.includes('display: none'), 'Sidebar must use display: none at mobile');
  assert.ok(mobileNavCss.includes('@media (max-width: 768px)'), 'MobileNav must activate at <=768px');
  assert.ok(appShellCss.includes('margin-left: 0'), 'AppShell must reset sidebar margin at <=768px');
  assert.ok(appShellCss.includes('calc(64px'), 'AppShell must add bottom padding to prevent content underlap with mobile nav');
});

test('QA: Poster grids support 2-column mobile layout for 360px and 390px viewports', () => {
  assert.ok(titlesCss.includes('@media (max-width: 400px)'), 'TitlesPage must provide 400px mobile breakpoint');
  assert.ok(titlesCss.includes('grid-template-columns: repeat(2, 1fr)'), 'TitlesPage must enforce 2-column grid on mobile');
  assert.ok(bookmarksCss.includes('@media (max-width: 400px)'), 'BookmarksPage must provide 400px mobile breakpoint');
  assert.ok(bookmarksCss.includes('grid-template-columns: repeat(2, 1fr)'), 'BookmarksPage must enforce 2-column grid on mobile');
  assert.ok(dashboardCss.includes('@media (max-width: 480px)'), 'Dashboard must provide 480px mobile breakpoint');
  assert.ok(dashboardCss.includes('grid-template-columns: repeat(2, 1fr)'), 'Dashboard must enforce 2-column grid on mobile');
});

test('QA: Placeholder modals and search controls handle mobile viewports without overflow', () => {
  assert.ok(placeholderCss.includes('@media (max-width: 500px)'), 'Placeholder.css must provide mobile breakpoint');
  assert.ok(placeholderCss.includes('.placeholder-import-search'), 'Import search must adapt on mobile');
  assert.ok(placeholderCss.includes('.collections-modal-panel'), 'Collections modal must adapt on mobile');
});
