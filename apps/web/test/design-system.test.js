import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stylesDir = path.resolve(__dirname, '../src/styles');

test('Design Tokens: tokens.css defines all required Flix.id design tokens', () => {
  const tokensContent = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf-8');

  // Typography tokens
  assert.ok(tokensContent.includes('--font-display:'), 'Must define display font');
  assert.ok(tokensContent.includes('--font-body:'), 'Must define body font');
  assert.ok(tokensContent.includes('--text-sm:'), 'Must define text scale');
  assert.ok(tokensContent.includes('--text-4xl:'), 'Must define heading scale');

  // Atmospheric background and glass surfaces
  assert.ok(tokensContent.includes('--bg-base:'), 'Must define base background token');
  assert.ok(tokensContent.includes('--bg-deep:'), 'Must define deep background token');
  assert.ok(tokensContent.includes('--glass-light:'), 'Must define translucent glass surface');
  assert.ok(tokensContent.includes('--glass-mid:'), 'Must define medium glass surface');
  assert.ok(tokensContent.includes('--glass-border:'), 'Must define frosted glass border');

  // Radii and poster aspect ratio
  assert.ok(tokensContent.includes('--radius-xl:'), 'Must define large rounded corner');
  assert.ok(tokensContent.includes('--radius-pill:'), 'Must define pill radius');
  assert.ok(tokensContent.includes('--poster-aspect: 2 / 3'), 'Must define 2:3 poster aspect ratio');

  // Motion reduction
  assert.ok(tokensContent.includes('prefers-reduced-motion: reduce'), 'Must support reduced motion');
});

test('Glassmorphism: glassmorphism.css provides backdrop filter utilities and fallback', () => {
  const glassContent = fs.readFileSync(path.join(stylesDir, 'glassmorphism.css'), 'utf-8');

  assert.ok(glassContent.includes('.glass'), 'Must define .glass utility');
  assert.ok(glassContent.includes('.glass-interactive'), 'Must define .glass-interactive utility');
  assert.ok(glassContent.includes('backdrop-filter: var(--blur-md)'), 'Must utilize backdrop blur');
  assert.ok(glassContent.includes('@supports not (backdrop-filter: blur(1px))'), 'Must provide fallback when blur is unsupported');
});

test('Global Styles: global.css imports design system and sets atmospheric background', () => {
  const globalContent = fs.readFileSync(path.join(stylesDir, 'global.css'), 'utf-8');

  assert.ok(globalContent.includes("@import './tokens.css';"), 'Must import tokens.css');
  assert.ok(globalContent.includes("@import './glassmorphism.css';"), 'Must import glassmorphism.css');
  assert.ok(globalContent.includes("@import './animations.css';"), 'Must import animations.css');
  assert.ok(globalContent.includes('radial-gradient'), 'Must render atmospheric radial lighting');
  assert.ok(globalContent.includes('.sr-only'), 'Must include screen reader only accessible utility');
});
