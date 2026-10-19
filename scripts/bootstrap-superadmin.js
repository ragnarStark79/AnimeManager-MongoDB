#!/usr/bin/env node

/**
 * bootstrap-superadmin.js
 *
 * Dedicated CLI provisioning script for AnimeManager MongoDB Edition Super Administrators.
 *
 * Safety & Security Guards:
 * - Requires explicit target database name (--database or --db)
 * - Refuses execution against production databases (e.g. animemanager_production)
 * - Prohibits default passwords; requires password via flag, stdin, or interactive prompt
 * - Refuses to overwrite existing administrator accounts by default
 * - Never prints or logs passwords, password hashes, or full database connection strings
 * - Initializes uniqueness indexes on super_admins collection
 * - Requires explicit --confirm flag to execute writes
 *
 * Usage:
 *   node scripts/bootstrap-superadmin.js --database <name> --email <email> --password <pwd> --confirm
 */

import { MongoClient } from 'mongodb';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scryptAsync = promisify(crypto.scrypt);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

function tryLoadEnv() {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../.env'),
  ];
  for (const envPath of candidatePaths) {
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const idx = trimmed.indexOf('=');
          if (idx !== -1) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (!(key in process.env)) {
              process.env[key] = val;
            }
          }
        }
        break;
      } catch {
        // Fall back to existing process.env
      }
    }
  }
}
tryLoadEnv();

const args = process.argv.slice(2);

function printHelp() {
  console.log(`
AnimeManager — Super Admin Provisioning Utility

Usage:
  node scripts/bootstrap-superadmin.js --database <name> --email <email> [options]

Required Options:
  --database, --db <name>      Target database name (e.g. animemanager, animemanager_test)
  --email <email>              Administrator email address
  --confirm                    Authorize provisioning writes to the target database

Optional Options:
  --password <password>        Administrator password (if omitted, read from secure prompt/stdin)
  --display-name, --name <n>   Administrator display name (defaults to email username)
  --uri <uri>                  MongoDB connection URI (defaults to MONGODB_URI env var)
  --dry-run                    Simulate provisioning without modifying the database
  --help, -h                   Show this help message

Security Constraints:
  - Production databases (animemanager_production) are strictly refused by this utility.
  - Existing administrators cannot be overwritten.
  - Passwords and password hashes are never logged or echoed.
`);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

function getArgValue(flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length && !args[idx + 1].startsWith('--')) {
    return args[idx + 1].trim();
  }
  const prefix = `${flag}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) {
    return match.slice(prefix.length).trim();
  }
  return null;
}

const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');
const targetDb = getArgValue('--database') || getArgValue('--db');
const rawEmail = getArgValue('--email');
let rawPassword = getArgValue('--password');
const displayName = getArgValue('--display-name') || getArgValue('--name');
const customUri = getArgValue('--uri');

// ── Validation 1: Explicit target database required ──
if (!targetDb || !targetDb.trim()) {
  console.error('\n[Provisioning Error] Fatal: --database <name> is required. You must explicitly specify the target database.\n');
  process.exit(1);
}

const normalizedDb = targetDb.toLowerCase().trim();

// ── Validation 2: Refuse production database ──
if (
  normalizedDb === 'animemanager_production' ||
  normalizedDb.includes('production') ||
  normalizedDb.endsWith('_prod') ||
  normalizedDb === 'prod'
) {
  console.error(`\n[SECURITY GUARD] Fatal: Refusing to run administrator provisioning on production database: "${targetDb}".`);
  console.error('Production provisioning must be executed through a separately authorized, controlled release procedure.\n');
  process.exit(1);
}

// ── Validation 3: Email required and valid ──
if (!rawEmail || !rawEmail.includes('@') || !rawEmail.includes('.')) {
  console.error('\n[Provisioning Error] Fatal: A valid --email address is required.\n');
  process.exit(1);
}

const normalizedEmail = rawEmail.trim().toLowerCase();

async function hashPasswordScrypt(password) {
  const salt = crypto.randomBytes(16);
  const derivedKey = await scryptAsync(password, salt, 64);
  return `scrypt$v1$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

async function promptPassword() {
  if (rawPassword) return rawPassword;

  // If stdin is piped
  if (!process.stdin.isTTY) {
    return new Promise((resolve) => {
      let data = '';
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk) => { data += chunk; });
      process.stdin.on('end', () => {
        resolve(data.trim());
      });
    });
  }

  // Interactive prompt
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Enter Super Admin password: ', (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function sanitizeUri(uri) {
  try {
    const url = new URL(uri);
    const pathPart = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${pathPart}`;
  } catch {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//').replace(/\/+$/, '');
  }
}

async function run() {
  rawPassword = await promptPassword();

  if (!rawPassword || rawPassword.length < 8) {
    console.error('\n[Provisioning Error] Fatal: Password must be at least 8 characters long.\n');
    process.exit(1);
  }

  const effectiveDisplayName = (displayName || normalizedEmail.split('@')[0] || 'Super Admin').trim();

  if (isDryRun) {
    console.log('\n[Provisioning] Mode: DRY RUN (no database operations performed)');
    console.log(`Target Database: "${normalizedDb}"`);
    console.log(`Email:           "${normalizedEmail}"`);
    console.log(`Display Name:    "${effectiveDisplayName}"`);
    console.log('Password:        [REDACTED]');
    console.log('\nDry run complete. No modifications occurred.\n');
    process.exit(0);
  }

  if (!isConfirmed) {
    console.error(`
[Provisioning Error] Operation not confirmed.
To write Super Admin credentials to "${normalizedDb}", you must pass --confirm.
`);
    process.exit(1);
  }

  const isRootAdmin = args.includes('--root') || getArgValue('--role') === 'root_admin';
  const targetCollectionName = isRootAdmin ? 'root_admins' : 'super_admins';
  const targetRoleTitle = isRootAdmin ? 'Root Administrator' : 'Super Admin';

  const mongoUri = customUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const sanitizedHost = sanitizeUri(mongoUri);

  console.log(`\nConnecting to: ${sanitizedHost}/${normalizedDb}`);
  const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 5000 });

  try {
    await client.connect();
    const db = client.db(normalizedDb);
    const adminsCol = db.collection(targetCollectionName);

    // Ensure unique index
    await adminsCol.createIndex(
      { email: 1 },
      { name: `uq_${targetCollectionName}_email`, unique: true }
    );

    // Check for existing administrator with same email
    const existing = await adminsCol.findOne({ email: normalizedEmail });
    if (existing) {
      console.error(`\n[Provisioning Error] Administrator with email "${normalizedEmail}" already exists in ${targetCollectionName}.`);
      console.error('Provisioning refuses to overwrite existing administrator credentials.\n');
      process.exit(1);
    }

    const passwordHash = await hashPasswordScrypt(rawPassword);
    const now = new Date();
    const adminDoc = {
      _id: crypto.randomUUID(),
      email: normalizedEmail,
      passwordHash,
      displayName: effectiveDisplayName,
      role: isRootAdmin ? 'root_admin' : 'superadmin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
    };

    await adminsCol.insertOne(adminDoc);

    console.log(`
✔ ${targetRoleTitle} provisioned successfully!
  Database:     ${normalizedDb}
  Collection:   ${targetCollectionName}
  Admin ID:     ${adminDoc._id}
  Email:        ${adminDoc.email}
  Display Name: ${adminDoc.displayName}
  Role:         ${adminDoc.role}
  Status:       ${adminDoc.status}
  Created:      ${adminDoc.createdAt.toISOString()}
`);
  } finally {
    await client.close();
  }
}

run().catch((err) => {
  console.error('\n[Provisioning Error] Fatal:', err.message || err);
  process.exit(1);
});
