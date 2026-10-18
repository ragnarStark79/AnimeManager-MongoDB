import test from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.resolve(__dirname, '../../../scripts/init-indexes.js');
const LOCAL_TEST_URI = 'mongodb://127.0.0.1:27017';

test('Init Indexes CLI: --help flag prints usage and exits cleanly', () => {
  const output = execSync(`node "${scriptPath}" --help`).toString();
  assert.ok(output.includes('AnimeManager — MongoDB Index Initialization Utility'));
  assert.ok(output.includes('--database'));
  assert.ok(output.includes('--confirm'));
  assert.ok(output.includes('--dry-run'));
});

test('Init Indexes CLI: Rejects execution when --database is omitted', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('--database <name> is required'));
      return true;
    }
  );
});

test('Init Indexes CLI: Rejects forbidden development database "animemanager"', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Refusing to run index initialization on active development database: "animemanager"'));
      return true;
    }
  );
});

test('Init Indexes CLI (Fix 1): Rejects animemanager unconditionally even when --allow-test-target is supplied', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager --allow-test-target --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Refusing to run index initialization on active development database: "animemanager"'));
      assert.ok(output.includes('Development database protection is unconditional'));
      return true;
    }
  );
});

test('Init Indexes CLI (Fix 1): Rejects whitespace-only --database argument', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database "   " --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('--database <name> is required'));
      return true;
    }
  );
});

test('Init Indexes CLI (Fix 1): Rejects --allow-test-target when target database is not a test database', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager_production --allow-test-target --confirm`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('--allow-test-target was specified, but target "animemanager_production" is not an isolated test database'));
      return true;
    }
  );
});

test('Init Indexes CLI: Rejects test databases without --allow-test-target', () => {
  const forbiddenTargets = [
    'animemanager_test',
    'animemanager_atlas_verification_test',
    'test',
    'dev',
    'development',
    'staging_test',
  ];

  for (const dbName of forbiddenTargets) {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}" --database "${dbName}" --confirm`, { stdio: 'pipe' });
      },
      (err) => {
        const output = err.stderr?.toString() || err.stdout?.toString();
        assert.ok(
          output.includes('is a test database') ||
          output.includes('active development database') ||
          output.includes('forbidden development/test database'),
          `Target "${dbName}" must be rejected: ${output}`
        );
        return true;
      }
    );
  }
});

test('Init Indexes CLI: Rejects execution when --confirm is omitted', () => {
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager_production`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Index initialization requires explicit confirmation via the --confirm flag'));
      return true;
    }
  );
});

test('Init Indexes CLI: --dry-run prints planned index schemas without connecting', () => {
  const output = execSync(`node "${scriptPath}" --dry-run --database animemanager_production`).toString();
  assert.ok(output.includes('Mode: DRY RUN'));
  assert.ok(output.includes('Target Database: animemanager_production'));
  assert.ok(output.includes('idx_titles_owner_media_created'));
  assert.ok(output.includes('uq_titles_owner_provider_external_id [UNIQUE] [PARTIAL FILTER]'));
  assert.ok(output.includes('uq_collections_owner_normalized_name [UNIQUE]'));
  assert.ok(output.includes('uq_bookmarks_owner_title [UNIQUE]'));
  assert.ok(output.includes('Dry run complete. No network calls or database modifications occurred.'));
});

test('Init Indexes CLI (Fix 1): --dry-run performs zero network connection even with invalid URI and without --confirm', () => {
  const output = execSync(
    `node "${scriptPath}" --dry-run --database animemanager_production --uri "mongodb://invalid-host-that-does-not-exist:99999"`
  ).toString();
  assert.ok(output.includes('Mode: DRY RUN'));
  assert.ok(output.includes('Target Database: animemanager_production'));
  assert.ok(output.includes('Dry run complete. No network calls or database modifications occurred.'));
});

test('Init Indexes CLI (Fix 1): Permitted isolated test database accepted only with explicit --allow-test-target override', () => {
  // 1. Without --allow-test-target, animemanager_test is rejected by target validation before confirmation check
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager_test`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('is a test database. Pass --allow-test-target to authorize execution'));
      return true;
    }
  );

  // 2. With --allow-test-target, target validation succeeds and script advances to required --confirm check
  assert.throws(
    () => {
      execSync(`node "${scriptPath}" --database animemanager_test --allow-test-target`, { stdio: 'pipe' });
    },
    (err) => {
      const output = err.stderr?.toString() || err.stdout?.toString();
      assert.ok(output.includes('Safety check failed. Index initialization requires explicit confirmation via the --confirm flag'));
      return true;
    }
  );
});

test('Init Indexes CLI (Fix 1): Missing or malformed target database arguments fail safely before connecting', () => {
  const malformed = ['', '   ', '\t', '  \n  '];
  for (const arg of malformed) {
    assert.throws(
      () => {
        execSync(`node "${scriptPath}" --database "${arg}" --confirm`, { stdio: 'pipe' });
      },
      (err) => {
        const output = err.stderr?.toString() || err.stdout?.toString();
        assert.ok(output.includes('--database <name> is required'));
        return true;
      }
    );
  }
});

