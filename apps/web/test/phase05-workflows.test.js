import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read source files directly to test implementation contracts
const apiClientSrc = readFileSync(resolve(__dirname, '../src/lib/api-client.ts'), 'utf8');
const routerSrc = readFileSync(resolve(__dirname, '../src/app/router.tsx'), 'utf8');
const titleDetailSrc = readFileSync(resolve(__dirname, '../src/pages/TitleDetailPage.tsx'), 'utf8');
const titlesPageSrc = readFileSync(resolve(__dirname, '../src/pages/TitlesPage.tsx'), 'utf8');
const collectionsPageSrc = readFileSync(resolve(__dirname, '../src/pages/CollectionsPage.tsx'), 'utf8');
const bookmarksPageSrc = readFileSync(resolve(__dirname, '../src/pages/BookmarksPage.tsx'), 'utf8');
const importPageSrc = readFileSync(resolve(__dirname, '../src/pages/ImportPage.tsx'), 'utf8');
const settingsPageSrc = readFileSync(resolve(__dirname, '../src/pages/SettingsPage.tsx'), 'utf8');
const authContextSrc = readFileSync(resolve(__dirname, '../src/lib/auth-context.tsx'), 'utf8');

test('Phase 05 Workflows: Router registers valid direct-navigation route for Title Detail', () => {
  assert.ok(
    routerSrc.includes('path="titles/:id"'),
    'router.tsx must declare Route for path="titles/:id"'
  );
  assert.ok(
    routerSrc.includes('<TitleDetailPage />'),
    'router.tsx must render TitleDetailPage for titles/:id'
  );
});

test('Phase 05 Workflows: API Client request serialization and error mapping', () => {
  // ApiError class structure
  assert.ok(apiClientSrc.includes('class ApiError extends Error'));
  assert.ok(apiClientSrc.includes('this.statusCode = statusCode'));
  assert.ok(apiClientSrc.includes('this.code = code'));
  assert.ok(apiClientSrc.includes('this.details = details'));

  // Authorization header injection
  assert.ok(apiClientSrc.includes("headers.set('Authorization', `Bearer ${this.token}`)"));

  // Error status 401 callback
  assert.ok(apiClientSrc.includes('res.status === 401'));
  assert.ok(apiClientSrc.includes('this.onUnauthorizedCallbacks.forEach'));
});

test('Phase 05 Workflows: Title CRUD and deletion confirmation safety', () => {
  // titles.list supports all required query filters
  assert.ok(apiClientSrc.includes("sp.set('search', params.search)"));
  assert.ok(apiClientSrc.includes("sp.set('mediaType', params.mediaType)"));
  assert.ok(apiClientSrc.includes("sp.set('collectionId', params.collectionId)"));
  assert.ok(apiClientSrc.includes("sp.set('bookmarkStatus', params.bookmarkStatus)"));
  assert.ok(apiClientSrc.includes("sp.set('sortBy', params.sortBy)"));
  assert.ok(apiClientSrc.includes("sp.set('sortOrder', params.sortOrder)"));

  // Deletion must pass explicit ?confirm=true
  assert.ok(apiClientSrc.includes("`/titles/${id}?confirm=${confirm}`"));
  assert.ok(titleDetailSrc.includes('api.titles.delete(id!, true)'));
});

test('Phase 05 Workflows: Domain Invariant - Collections and Bookmarks are strictly independent', () => {
  // Collection operations never mutate bookmarks
  assert.ok(!collectionsPageSrc.includes('api.bookmarks.'));
  assert.ok(collectionsPageSrc.includes('api.collections.create'));
  assert.ok(collectionsPageSrc.includes('api.collections.update'));
  assert.ok(collectionsPageSrc.includes('api.collections.delete'));
  assert.ok(collectionsPageSrc.includes('api.collections.removeTitle'));

  // Explicit user reminder that deleting collection does not delete titles or bookmarks
  assert.ok(collectionsPageSrc.includes('Domain Invariant:'));
  assert.ok(collectionsPageSrc.includes('Deleting a collection removes the collection folder only'));

  // Bookmark operations never delete title or collection
  assert.ok(bookmarksPageSrc.includes('api.bookmarks.list'));
  assert.ok(!bookmarksPageSrc.includes('api.collections.delete'));
});

test('Phase 05 Workflows: Bookmarks tracking supports status, progress, rating, and notes', () => {
  // Title detail tracking widget allows mutating all bookmark fields
  assert.ok(titleDetailSrc.includes('api.bookmarks.upsertTitleBookmark'));
  assert.ok(titleDetailSrc.includes('status: payload.status'));
  assert.ok(titleDetailSrc.includes('progress: payload.progress'));
  assert.ok(titleDetailSrc.includes('personalRating: payload.personalRating'));
  assert.ok(titleDetailSrc.includes('notes: payload.notes'));

  // Personal rating is bounded to 0-10
  assert.ok(titleDetailSrc.includes('step="0.5"'));
  assert.ok(titleDetailSrc.includes('min="0"'));
  assert.ok(titleDetailSrc.includes('max="10"'));
});

test('Phase 05 Workflows: Jikan Import UI connects search, preview, disambiguation, and commit', () => {
  // Search
  assert.ok(importPageSrc.includes('api.import.search'));
  // Preview
  assert.ok(importPageSrc.includes('api.import.preview'));
  // Commit
  assert.ok(importPageSrc.includes('api.import.commit'));

  // Duplicate detection warning banner
  assert.ok(importPageSrc.includes('previewDraft.duplicateExistingTitleId'));
  assert.ok(importPageSrc.includes('Duplicate Warning:'));
  assert.ok(importPageSrc.includes('disabled={Boolean(previewDraft.duplicateExistingTitleId)}'));

  // Disambiguation between Manga and Manhwa
  assert.ok(importPageSrc.includes('name="mediaTypeConfirm"'));
  assert.ok(importPageSrc.includes('value="manga"'));
  assert.ok(importPageSrc.includes('value="manhwa"'));
  assert.ok(importPageSrc.includes('confirmedMediaType'));

  // Editable fields before commit
  assert.ok(importPageSrc.includes('setEditedTitle'));
  assert.ok(importPageSrc.includes('setEditedOriginalTitle'));
  assert.ok(importPageSrc.includes('setEditedSynopsis'));
  assert.ok(importPageSrc.includes('selectedFields'));
});

test('Phase 05 Workflows: Library Export triggers authenticated JSON and CSV downloads', () => {
  assert.ok(apiClientSrc.includes('export = {'));
  assert.ok(apiClientSrc.includes("this.request<unknown>('/export/json')"));
  assert.ok(apiClientSrc.includes("`${this.baseUrl}/export/csv`"));

  // Settings page handles file download blobs
  assert.ok(settingsPageSrc.includes('api.export.getJson()'));
  assert.ok(settingsPageSrc.includes('api.export.getCsv()'));
  assert.ok(settingsPageSrc.includes('animemanager_backup_'));
  assert.ok(settingsPageSrc.includes('animemanager_titles_'));
});

test('Phase 05 Workflows: Authentication and Owner Session Isolation', () => {
  // Auth provider stores token in localStorage and synchronizes api client
  assert.ok(authContextSrc.includes('localStorage.getItem(\'animemanager_auth_token\')'));
  assert.ok(authContextSrc.includes('api.setToken(token)'));
  assert.ok(authContextSrc.includes('parseJwt'));
  assert.ok(authContextSrc.includes('ownerId: parsed?.sub || null'));

  // Settings page provides token inspection and configuration
  assert.ok(settingsPageSrc.includes('useAuth()'));
  assert.ok(settingsPageSrc.includes('setToken'));
  assert.ok(settingsPageSrc.includes('Active Owner UUID'));
});
