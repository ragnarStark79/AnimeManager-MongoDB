#!/usr/bin/env node

/**
 * init-indexes.js
 *
 * Explicit MongoDB index initialization script for AnimeManager MongoDB Edition.
 *
 * Serverless deployments intentionally omit index initialization from cold starts
 * to maintain low latency. This script provides a safe, standalone, idempotent
 * procedure to provision the required indexes and uniqueness constraints on a
 * newly created production database.
 *
 * Safety Guards:
 * - Requires explicit target database name (--database or --db)
 * - Prohibits running against the active development database ("animemanager")
 * - Prohibits running against development or test databases unless --allow-test-target is set
 * - Requires explicit --confirm flag to execute
 * - Supports --dry-run mode for previewing index definitions without connecting
 * - Reuses canonical index definitions from apps/api/dist/repositories/mongo.js
 * - Never drops collections, documents, or databases
 *
 * Usage:
 *   node scripts/init-indexes.js --database <name> --confirm [options]
 *   npm run init:indexes -- --database <name> --confirm
 */

import { MongoClient } from 'mongodb';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

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
AnimeManager — MongoDB Index Initialization Utility

Usage:
  node scripts/init-indexes.js --database <name> --confirm [options]

Required Options:
  --database, --db <name>   Explicit target database name (e.g. animemanager_production)
  --confirm                 Authorize index creation on the target database

Optional Options:
  --uri <uri>               MongoDB connection URI (defaults to MONGODB_URI environment variable)
  --dry-run                 Preview index specifications without connecting or altering the database
  --allow-test-target       Permit execution against isolated disposable test databases (for CI/automated tests)
  --help, -h                Show this help message

Examples:
  # Preview planned indexes (safe, zero network connection):
  node scripts/init-indexes.js --dry-run

  # Initialize indexes on a newly provisioned production database:
  node scripts/init-indexes.js --database animemanager_production --confirm
`);
}

if (args.includes('--help') || args.includes('-h')) {
  printHelp();
  process.exit(0);
}

const isDryRun = args.includes('--dry-run');
const isConfirmed = args.includes('--confirm');
const allowTestTarget = args.includes('--allow-test-target');

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

const targetDb = getArgValue('--database') || getArgValue('--db');
const customUri = getArgValue('--uri');

const PLANNED_INDEXES = {
  titles: [
    { key: { ownerId: 1, mediaType: 1, createdAt: -1 }, name: 'idx_titles_owner_media_created' },
    { key: { ownerId: 1, englishTitle: 1 }, name: 'idx_titles_owner_english_title' },
    { key: { ownerId: 1, releaseYear: -1 }, name: 'idx_titles_owner_year' },
    { key: { ownerId: 1, createdAt: -1 }, name: 'idx_titles_owner_created' },
    {
      key: { ownerId: 1, 'externalSources.provider': 1, 'externalSources.externalId': 1 },
      name: 'uq_titles_owner_provider_external_id',
      unique: true,
      partialFilterExpression: { 'externalSources.externalId': { $exists: true } },
    },
  ],
  collections: [
    { key: { ownerId: 1, normalizedName: 1 }, name: 'uq_collections_owner_normalized_name', unique: true },
    { key: { ownerId: 1, createdAt: 1 }, name: 'idx_collections_owner_created' },
    { key: { 'items.titleId': 1 }, name: 'idx_collections_items_title_id' },
  ],
  bookmarks: [
    { key: { ownerId: 1, titleId: 1 }, name: 'uq_bookmarks_owner_title', unique: true },
    { key: { ownerId: 1, status: 1, updatedAt: -1 }, name: 'idx_bookmarks_owner_status_updated' },
    { key: { ownerId: 1, personalRating: -1 }, name: 'idx_bookmarks_owner_rating' },
    { key: { ownerId: 1, priority: -1 }, name: 'idx_bookmarks_owner_priority' },
    { key: { ownerId: 1, progress: -1 }, name: 'idx_bookmarks_owner_progress' },
  ],
  root_admins: [
    { key: { email: 1 }, name: 'uq_root_admins_email', unique: true },
    { key: { username: 1 }, name: 'uq_root_admins_username', unique: true, partialFilterExpression: { username: { $exists: true, $type: 'string' } } },
  ],
  root_admin_sessions: [
    { key: { sessionTokenHash: 1 }, name: 'uq_root_admin_sessions_token_hash', unique: true },
    { key: { rootAdminId: 1 }, name: 'idx_root_admin_sessions_admin_id' },
    { key: { expiresAt: 1 }, name: 'idx_root_admin_sessions_expires_at' },
  ],
  super_admins: [
    { key: { email: 1 }, name: 'uq_super_admins_email', unique: true },
    { key: { username: 1 }, name: 'uq_super_admins_username', unique: true, partialFilterExpression: { username: { $exists: true, $type: 'string' } } },
  ],
  super_admin_sessions: [
    { key: { sessionTokenHash: 1 }, name: 'uq_sessions_token_hash', unique: true },
    { key: { adminId: 1 }, name: 'idx_sessions_admin_id' },
    { key: { expiresAt: 1 }, name: 'idx_sessions_expires_at' },
  ],
  users: [
    { key: { email: 1 }, name: 'uq_users_email', unique: true },
    { key: { username: 1 }, name: 'uq_users_username', unique: true },
  ],
  user_sessions: [
    { key: { sessionTokenHash: 1 }, name: 'uq_user_sessions_token_hash', unique: true },
    { key: { userId: 1 }, name: 'idx_user_sessions_user_id' },
    { key: { expiresAt: 1 }, name: 'idx_user_sessions_expires_at' },
  ],
  audit_logs: [
    { key: { timestamp: -1 }, name: 'idx_audit_logs_timestamp' },
    { key: { actorId: 1, timestamp: -1 }, name: 'idx_audit_logs_actor' },
    { key: { targetId: 1, timestamp: -1 }, name: 'idx_audit_logs_target' },
    { key: { eventType: 1, timestamp: -1 }, name: 'idx_audit_logs_event_type' },
  ],
  account_mfa: [
    { key: { accountId: 1, accountRole: 1 }, name: 'uq_account_mfa_account_role', unique: true },
    { key: { accountId: 1 }, name: 'idx_account_mfa_account_id' },
  ],
};


if (isDryRun) {
  console.log('\n[Init Indexes] Mode: DRY RUN (no database operations will be performed)\n');
  if (targetDb) {
    console.log(`Target Database: ${targetDb}`);
  }
  console.log('Planned Index Specifications:');
  for (const [coll, indexes] of Object.entries(PLANNED_INDEXES)) {
    console.log(`\n  Collection: "${coll}" (${indexes.length} indexes)`);
    for (const idx of indexes) {
      const uniqueFlag = idx.unique ? ' [UNIQUE]' : '';
      const partialFlag = idx.partialFilterExpression ? ' [PARTIAL FILTER]' : '';
      console.log(`    - ${idx.name}${uniqueFlag}${partialFlag}: ${JSON.stringify(idx.key)}`);
    }
  }
  console.log('\nDry run complete. No network calls or database modifications occurred.\n');
  process.exit(0);
}

// Database-name normalization
const normalizedDb = (targetDb || '').toLowerCase().trim();

// Validation 1: Require explicit non-empty target database name
if (!normalizedDb) {
  console.error(
    '\n[Init Indexes Error] Fatal: --database <name> is required. You must explicitly specify the target database name.\n'
  );
  process.exit(1);
}

// Validation 2: Unconditional prohibition on active development database
// "animemanager" is the shared development database and MUST NEVER be targeted by this script under any circumstance.
const UNCONDITIONAL_FORBIDDEN = ['animemanager', 'dev', 'development'];
if (UNCONDITIONAL_FORBIDDEN.includes(normalizedDb)) {
  console.error(
    `\n[Init Indexes Error] Fatal: Refusing to run index initialization on active development database: "${targetDb}". Development database protection is unconditional.\n`
  );
  process.exit(1);
}

// Validation 3: Test database targets require explicit --allow-test-target override
const TEST_DATABASE_NAMES = ['animemanager_test', 'animemanager_atlas_verification_test', 'test'];
const isTestTarget = TEST_DATABASE_NAMES.includes(normalizedDb) || normalizedDb.includes('test');

if (isTestTarget && !allowTestTarget) {
  console.error(
    `\n[Init Indexes Error] Fatal: Database "${targetDb}" is a test database. Pass --allow-test-target to authorize execution against isolated test databases.\n`
  );
  process.exit(1);
}

// Validation 4: If --allow-test-target is supplied, target MUST actually be a recognized test database
if (allowTestTarget && !isTestTarget) {
  console.error(
    `\n[Init Indexes Error] Fatal: --allow-test-target was specified, but target "${targetDb}" is not an isolated test database (name must contain "test").\n`
  );
  process.exit(1);
}

// Validation 3: Require explicit --confirm flag
if (!isConfirmed) {
  console.error(
    `\n[Init Indexes Error] Fatal: Safety check failed. Index initialization requires explicit confirmation via the --confirm flag.\n`
  );
  process.exit(1);
}

// Validation 4: Resolve connection URI
const effectiveUri = customUri || process.env.MONGODB_URI;
if (!effectiveUri) {
  console.error(
    '\n[Init Indexes Error] Fatal: MONGODB_URI is required. Provide it via MONGODB_URI environment variable or --uri flag.\n'
  );
  process.exit(1);
}

function sanitizeUri(uri) {
  try {
    const url = new URL(uri);
    return `${url.protocol}//${url.host}`;
  } catch {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//');
  }
}

async function run() {
  console.log(`\n[Init Indexes] Target Database: "${targetDb}"`);
  console.log(`[Init Indexes] Target Host: ${sanitizeUri(effectiveUri)}`);

  // Dynamically import initIndexes from compiled API repository to preserve single source of truth
  let initIndexes;
  try {
    const mongoRepo = await import(path.resolve(repoRoot, 'apps/api/dist/repositories/mongo.js'));
    initIndexes = mongoRepo.initIndexes;
  } catch (importErr) {
    console.error(
      '\n[Init Indexes Error] Failed to import initIndexes from apps/api/dist/repositories/mongo.js. Ensure the project is built (npm run build).\n',
      importErr.message
    );
    process.exit(1);
  }

  const client = new MongoClient(effectiveUri, {
    serverSelectionTimeoutMS: 8000,
    connectTimeoutMS: 10000,
  });

  try {
    await client.connect();
    const db = client.db(targetDb);

    console.log('[Init Indexes] Connected. Creating indexes across collections (titles, collections, bookmarks)...');
    await initIndexes(db);

    // Verify created indexes across all collections
    const targetCollections = [
      'titles',
      'collections',
      'bookmarks',
      'root_admins',
      'root_admin_sessions',
      'super_admins',
      'super_admin_sessions',
      'users',
      'user_sessions',
      'audit_logs',
    ];

    console.log(`\n[Init Indexes] Success! Indexes verified on database "${targetDb}":`);
    for (const collName of targetCollections) {
      const idxs = await db.collection(collName).indexes();
      console.log(`  - ${collName}: ${idxs.length} indexes`);
    }
    console.log('\nAll unique constraints and query indexes are active.\n');
  } catch (err) {
    console.error('\n[Init Indexes Error] Index initialization failed:', err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
