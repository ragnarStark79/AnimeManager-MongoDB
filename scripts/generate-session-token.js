#!/usr/bin/env node

/**
 * generate-session-token.js
 *
 * Utility for generating a valid, long-lived personal owner session token (JWT)
 * for use in AnimeManager production deployments (e.g. Vercel).
 *
 * Usage:
 *   node scripts/generate-session-token.js [options] [owner_uuid] [email]
 *
 * Options:
 *   --print, --show      Explicitly print the full token to terminal
 *   --copy               Copy the token directly to macOS clipboard without displaying
 *   --raw, --token-only  Output only the raw token string (ideal for piping)
 *   --help               Display this help message
 *
 * Security:
 *   - By default, the full token is masked to prevent accidental terminal exposure.
 *   - The signing secret is never printed or written to disk.
 *   - No credentials or tokens are saved to filesystem files.
 */

import jwt from 'jsonwebtoken';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
AnimeManager — Personal Production Session Token Generator

Usage:
  node scripts/generate-session-token.js [options] [owner_uuid] [email]

Options:
  --print, --show      Explicitly print the full token to terminal
  --copy               Copy the token directly to macOS clipboard (never displayed)
  --raw, --token-only  Output only the raw token string (ideal for piping to pbcopy)
  --help, -h           Show this help message

Examples:
  node scripts/generate-session-token.js
  node scripts/generate-session-token.js --print
  node scripts/generate-session-token.js --copy
  node scripts/generate-session-token.js --raw | pbcopy
`);
  process.exit(0);
}

const showToken = args.includes('--print') || args.includes('--show');
const rawOnly = args.includes('--raw') || args.includes('--token-only');
const shouldCopy = args.includes('--copy');

// Filter out flag arguments to extract positional ownerId and email
const positionalArgs = args.filter((a) => !a.startsWith('--'));

function loadSecret() {
  if (process.env.JWT_SECRET?.trim()) {
    return process.env.JWT_SECRET.trim();
  }
  if (process.env.SUPABASE_JWT_SECRET?.trim()) {
    return process.env.SUPABASE_JWT_SECRET.trim();
  }

  const envPath = path.resolve(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    let legacyFallback = null;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (key === 'JWT_SECRET' && val) {
          return val;
        }
        if (key === 'SUPABASE_JWT_SECRET' && val && !legacyFallback) {
          legacyFallback = val;
        }
      }
    }
    if (legacyFallback) {
      return legacyFallback;
    }
  }

  return null;
}

const secret = loadSecret();

if (!secret) {
  console.error('\n❌ Error: JWT_SECRET (or legacy SUPABASE_JWT_SECRET) was not found in process.env or .env file.');
  console.error('Please ensure JWT_SECRET is set in your .env file.\n');
  process.exit(1);
}

if (secret.length < 16) {
  console.error('\n❌ Error: JWT_SECRET (or legacy SUPABASE_JWT_SECRET) is too short (must be >= 16 characters).\n');
  process.exit(1);
}

// Default owner UUID: seeded library owner
const DEFAULT_OWNER_ID = '00000000-0000-0000-0000-000000000001';
const ownerId = positionalArgs[0]?.trim() || DEFAULT_OWNER_ID;
const email = positionalArgs[1]?.trim() || 'owner@example.com';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
if (!UUID_REGEX.test(ownerId)) {
  console.error(`\n❌ Error: Invalid owner UUID '${ownerId}'. Must match standard 8-4-4-4-12 UUID format.\n`);
  process.exit(1);
}

const payload = {
  sub: ownerId,
  email,
  role: 'authenticated',
  aud: 'authenticated',
  app_metadata: { provider: 'animemanager' },
  user_metadata: { name: 'Library Owner' },
};

// 365-day personal session
const token = jwt.sign(payload, secret, {
  algorithm: 'HS256',
  expiresIn: '365d',
  issuer: 'animemanager',
});

// If raw mode requested, output ONLY the token without decoration
if (rawOnly) {
  process.stdout.write(token);
  process.exit(0);
}

// If --copy requested on macOS, pipe directly to pbcopy
if (shouldCopy) {
  if (process.platform === 'darwin') {
    const pbcopy = spawn('pbcopy');
    pbcopy.stdin.write(token);
    pbcopy.stdin.end();
  } else {
    console.warn('\n⚠ Note: Direct clipboard copy via pbcopy is supported on macOS.');
  }
}

const maskedToken = `${token.slice(0, 12)}...[REDACTED_${token.length - 24}_CHARS]...${token.slice(-12)}`;

console.log('\n================================================================================');
console.log('       AnimeManager — Production Personal Session Token Generator               ');
console.log('================================================================================');
console.log(`Owner UUID:  ${ownerId}`);
console.log(`Email:       ${email}`);
console.log(`Algorithm:   HS256`);
console.log(`Validity:    365 days`);
console.log(`Token Size:  ${token.length} characters`);
console.log('--------------------------------------------------------------------------------');

if (shouldCopy && process.platform === 'darwin') {
  console.log('✔ Token successfully copied to macOS clipboard! (Not displayed on screen for safety)');
  console.log('  You can now paste it directly into https://animemanager.vercel.app/settings\n');
} else if (showToken) {
  console.log('YOUR PRODUCTION SESSION TOKEN (--print flag active):');
  console.log(token);
  console.log('--------------------------------------------------------------------------------');
  console.log('⚠ Security reminder: Clear your terminal scrollback buffer after copying.');
} else {
  console.log(`Masked Token Preview: ${maskedToken}`);
  console.log('--------------------------------------------------------------------------------');
  console.log('🔒 Security Notice: The full token is masked to prevent accidental screen exposure.');
  console.log('   - To copy directly to clipboard without printing:');
  console.log('       node scripts/generate-session-token.js --copy');
  console.log('   - To pipe directly to macOS clipboard:');
  console.log('       node scripts/generate-session-token.js --raw | pbcopy');
  console.log('   - To explicitly print the token to terminal:');
  console.log('       node scripts/generate-session-token.js --print');
}

console.log('--------------------------------------------------------------------------------');
console.log('HOW TO USE ON VERCEL PRODUCTION:');
console.log('  1. Open: https://animemanager.vercel.app/settings');
console.log('  2. Scroll to "Authentication & Owner Session"');
console.log('  3. Paste the token into "Bearer JWT Token (Local Storage)"');
console.log('  4. Click "Save Token"');
console.log('================================================================================\n');
