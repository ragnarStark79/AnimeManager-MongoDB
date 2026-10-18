import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uiDir = path.resolve(__dirname, '../src/components/ui');

test('Shared UI Components: index.ts exports all 8 required design system components', () => {
  const indexContent = fs.readFileSync(path.join(uiDir, 'index.ts'), 'utf-8');

  const requiredExports = [
    'Button',
    'Badge',
    'Input',
    'GlassCard',
    'PosterCard',
    'EmptyState',
    'LoadingState',
    'ErrorState',
  ];

  for (const exp of requiredExports) {
    assert.ok(
      indexContent.includes(`export { ${exp} }`) || indexContent.includes(`export { ${exp}`),
      `UI barrel index.ts must export ${exp}`
    );
  }
});

test('PosterCard: verifies aspect ratio, fallback support, and rating presentation', () => {
  const posterCode = fs.readFileSync(path.join(uiDir, 'PosterCard.tsx'), 'utf-8');
  const posterCss = fs.readFileSync(path.join(uiDir, 'PosterCard.css'), 'utf-8');

  assert.ok(posterCode.includes('onError='), 'Must provide fallback when image fails to load');
  assert.ok(posterCode.includes('poster-card-sub-rating'), 'Must display rating in card meta');
  assert.ok(posterCss.includes('aspect-ratio: var(--poster-aspect)'), 'Must enforce 2:3 aspect ratio');
});

test('Input: accessible form control with label and aria bindings', () => {
  const inputCode = fs.readFileSync(path.join(uiDir, 'Input.tsx'), 'utf-8');

  assert.ok(inputCode.includes('htmlFor='), 'Input must link label with htmlFor');
  assert.ok(inputCode.includes('aria-describedby'), 'Input must bind hint/error via aria-describedby');
  assert.ok(inputCode.includes('aria-invalid'), 'Input must bind aria-invalid on error');
});

test('EmptyState & LoadingState: accessible status containers', () => {
  const emptyCode = fs.readFileSync(path.join(uiDir, 'EmptyState.tsx'), 'utf-8');
  const loadingCode = fs.readFileSync(path.join(uiDir, 'LoadingState.tsx'), 'utf-8');
  const errorCode = fs.readFileSync(path.join(uiDir, 'ErrorState.tsx'), 'utf-8');

  assert.ok(emptyCode.includes('role="status"'), 'EmptyState must use role="status"');
  assert.ok(loadingCode.includes('role="status"'), 'LoadingState must use role="status"');
  assert.ok(loadingCode.includes('aria-live="polite"'), 'LoadingState must use aria-live');
  assert.ok(errorCode.includes('role="alert"'), 'ErrorState must use role="alert"');
});
