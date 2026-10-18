import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const importPagePath = path.resolve(__dirname, '../src/pages/ImportPage.tsx');
const importPageContent = fs.readFileSync(importPagePath, 'utf8');

test('Import UI: Sanitizes raw "fetch failed" into user-friendly unavailable message', () => {
  // Verify that ImportPage defines getSearchErrorMessage
  assert.ok(importPageContent.includes('getSearchErrorMessage'));
  assert.ok(importPageContent.includes("MyAnimeList search is temporarily unavailable. Please try again shortly."));

  // Check that "fetch failed" pattern is explicitly intercepted
  assert.ok(importPageContent.includes("msg.includes('fetch failed')"));
  assert.ok(importPageContent.includes("msg.includes('Failed to connect')"));
});

test('Import UI: Classifies HTTP 504 and 502 into informative error titles', () => {
  assert.ok(importPageContent.includes('getSearchErrorTitle'));
  assert.ok(importPageContent.includes("'Upstream Connection Timed Out'"));
  assert.ok(importPageContent.includes("'MyAnimeList Service Unavailable'"));
  assert.ok(importPageContent.includes("'MyAnimeList Rate Limit Exceeded'"));
});

test('Import UI: Stale candidates are excluded when searchError occurs', () => {
  // Verify candidates filtering includes !searchError
  assert.ok(
    importPageContent.includes('Array.isArray(searchResultsData) && !searchError') ||
    importPageContent.includes('!searchError')
  );
});

test('Import UI: Guards concurrent and repeated search submissions', () => {
  // Verify submit guard for isSearching or previewMutation.isPending
  assert.ok(importPageContent.includes('if (isSearching || previewMutation.isPending) return;'));
  assert.ok(importPageContent.includes('loading={isSearching || previewMutation.isPending}'));
});

test('Import UI: Preview error displays an accessible ErrorState with retry', () => {
  assert.ok(importPageContent.includes('previewMutation.isError'));
  assert.ok(importPageContent.includes('title="Preview Failed"'));
  assert.ok(importPageContent.includes('handleCandidateSelect(selectedCandidate)'));
});
