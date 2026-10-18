import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../dist/config/index.js';

const VALID_PROD_SECRET = 'super-strong-production-jwt-secret-min-32-chars-long!';
const VALID_PROD_URI = 'mongodb+srv://cluster-prod.example.net';
const VALID_PROD_DB = 'animemanager_production';
const VALID_PROD_CORS = 'https://animemanager.vercel.app';

test('Config Safeguards: Local development defaults to animemanager and localhost CORS', () => {
  const devConfig = loadConfig({
    NODE_ENV: 'development',
    JWT_SECRET: 'dev-secret-min-16-chars!',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
  });

  assert.equal(devConfig.NODE_ENV, 'development');
  assert.equal(devConfig.MONGODB_DB_NAME, 'animemanager', 'Development defaults to animemanager');
  assert.equal(devConfig.CORS_ORIGIN, 'http://localhost:5173', 'Development defaults to localhost:5173');
});

test('Config Safeguards: Test environment defaults to animemanager and localhost CORS if omitted', () => {
  const testConfig = loadConfig({
    NODE_ENV: 'test',
    JWT_SECRET: 'test-secret-min-16-chars!',
    MONGODB_URI: 'mongodb://127.0.0.1:27017',
  });

  assert.equal(testConfig.NODE_ENV, 'test');
  assert.equal(testConfig.MONGODB_DB_NAME, 'animemanager');
  assert.equal(testConfig.CORS_ORIGIN, 'http://localhost:5173');
});

test('Config Safeguards (Remediation A): Production requires explicit MONGODB_DB_NAME', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        CORS_ORIGIN: VALID_PROD_CORS,
        // MONGODB_DB_NAME omitted
      });
    },
    (err) => {
      assert.ok(err.message.includes('MONGODB_DB_NAME is required in production'));
      return true;
    }
  );
});

test('Config Safeguards (Remediation A): Production rejects empty MONGODB_DB_NAME', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        CORS_ORIGIN: VALID_PROD_CORS,
        MONGODB_DB_NAME: '   ',
      });
    },
    (err) => {
      assert.ok(err.message.includes('MONGODB_DB_NAME is required in production'));
      return true;
    }
  );
});

test('Config Safeguards (Remediation A): Production rejects development database name "animemanager"', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        CORS_ORIGIN: VALID_PROD_CORS,
        MONGODB_DB_NAME: 'animemanager',
      });
    },
    (err) => {
      assert.ok(err.message.includes('cannot use development or test database "animemanager"'));
      return true;
    }
  );
});

test('Config Safeguards (Remediation A): Production rejects test databases', () => {
  const rejectedNames = [
    'animemanager_test',
    'animemanager_atlas_verification_test',
    'test',
    'dev',
    'development',
    'my_custom_test_db',
  ];

  for (const dbName of rejectedNames) {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: VALID_PROD_SECRET,
          MONGODB_URI: VALID_PROD_URI,
          CORS_ORIGIN: VALID_PROD_CORS,
          MONGODB_DB_NAME: dbName,
        });
      },
      (err) => {
        assert.ok(
          err.message.includes('cannot use development or test database'),
          `Should reject "${dbName}" in production`
        );
        return true;
      }
    );
  }
});

test('Config Safeguards (Remediation A): Production accepts valid isolated production database', () => {
  const prodConfig = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: VALID_PROD_SECRET,
    MONGODB_URI: VALID_PROD_URI,
    CORS_ORIGIN: VALID_PROD_CORS,
    MONGODB_DB_NAME: 'animemanager_production',
  });

  assert.equal(prodConfig.NODE_ENV, 'production');
  assert.equal(prodConfig.MONGODB_DB_NAME, 'animemanager_production');
});

test('Config Safeguards (Remediation B): Production requires explicit CORS_ORIGIN', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        MONGODB_DB_NAME: VALID_PROD_DB,
        // CORS_ORIGIN omitted
      });
    },
    (err) => {
      assert.ok(err.message.includes('CORS_ORIGIN is required in production'));
      return true;
    }
  );
});

test('Config Safeguards (Remediation B): Production rejects wildcard CORS "*"', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        MONGODB_DB_NAME: VALID_PROD_DB,
        CORS_ORIGIN: '*',
      });
    },
    (err) => {
      assert.ok(err.message.includes('cannot be wildcard "*" in production'));
      return true;
    }
  );
});

test('Config Safeguards (Remediation B): Production rejects localhost/127.0.0.1 CORS origins', () => {
  const localOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'https://animemanager.vercel.app, http://localhost:5173',
  ];

  for (const origin of localOrigins) {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: VALID_PROD_SECRET,
          MONGODB_URI: VALID_PROD_URI,
          MONGODB_DB_NAME: VALID_PROD_DB,
          CORS_ORIGIN: origin,
        });
      },
      (err) => {
        assert.ok(err.message.includes('cannot contain localhost/127.0.0.1 in production'));
        return true;
      }
    );
  }
});

test('Config Safeguards (Remediation B): Production rejects malformed CORS origins', () => {
  const malformedOrigins = ['not-a-valid-url', 'ftp://some-host.com', '://invalid'];

  for (const origin of malformedOrigins) {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: VALID_PROD_SECRET,
          MONGODB_URI: VALID_PROD_URI,
          MONGODB_DB_NAME: VALID_PROD_DB,
          CORS_ORIGIN: origin,
        });
      },
      (err) => {
        assert.ok(
          err.message.includes('Malformed origin in CORS_ORIGIN') || err.message.includes('Invalid protocol in CORS origin')
        );
        return true;
      }
    );
  }
});

test('Config Safeguards (Remediation B): Production accepts valid origins (single and comma-separated)', () => {
  const singleConfig = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: VALID_PROD_SECRET,
    MONGODB_URI: VALID_PROD_URI,
    MONGODB_DB_NAME: VALID_PROD_DB,
    CORS_ORIGIN: 'https://animemanager.vercel.app',
  });
  assert.equal(singleConfig.CORS_ORIGIN, 'https://animemanager.vercel.app');

  const multiConfig = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: VALID_PROD_SECRET,
    MONGODB_URI: VALID_PROD_URI,
    MONGODB_DB_NAME: VALID_PROD_DB,
    CORS_ORIGIN: 'https://animemanager.vercel.app, https://animemanager.example.com',
  });
  assert.equal(multiConfig.CORS_ORIGIN, 'https://animemanager.vercel.app, https://animemanager.example.com');
});

test('Config Safeguards: Production rejects insecure default JWT_SECRET and localhost MONGODB_URI', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: 'development-jwt-secret-min-16-chars-long!',
        MONGODB_URI: VALID_PROD_URI,
        MONGODB_DB_NAME: VALID_PROD_DB,
        CORS_ORIGIN: VALID_PROD_CORS,
      });
    },
    (err) => {
      assert.ok(err.message.includes('Insecure default JWT_SECRET cannot be used in production'));
      return true;
    }
  );

  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: 'mongodb://localhost:27017',
        MONGODB_DB_NAME: VALID_PROD_DB,
        CORS_ORIGIN: VALID_PROD_CORS,
      });
    },
    (err) => {
      assert.ok(err.message.includes('Production environment cannot use localhost MongoDB'));
      return true;
    }
  );
});

test('Config Safeguards: Error messages never disclose credentials or connection strings', () => {
  try {
    loadConfig({
      NODE_ENV: 'production',
      JWT_SECRET: VALID_PROD_SECRET,
      MONGODB_URI: 'mongodb://super_secret_user:super_secret_password@localhost:27017',
      MONGODB_DB_NAME: VALID_PROD_DB,
      CORS_ORIGIN: VALID_PROD_CORS,
    });
    assert.fail('Should have thrown error for localhost URI');
  } catch (err) {
    assert.ok(!err.message.includes('super_secret_user'));
    assert.ok(!err.message.includes('super_secret_password'));
    assert.ok(!err.message.includes('mongodb://'));
  }
});

test('Config Safeguards (Fix 2): Normalizes trailing slash on valid production origins', () => {
  const configSingle = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: VALID_PROD_SECRET,
    MONGODB_URI: VALID_PROD_URI,
    MONGODB_DB_NAME: VALID_PROD_DB,
    CORS_ORIGIN: 'https://animemanager.vercel.app/',
  });
  assert.equal(configSingle.CORS_ORIGIN, 'https://animemanager.vercel.app');

  const configMulti = loadConfig({
    NODE_ENV: 'production',
    JWT_SECRET: VALID_PROD_SECRET,
    MONGODB_URI: VALID_PROD_URI,
    MONGODB_DB_NAME: VALID_PROD_DB,
    CORS_ORIGIN: 'https://animemanager.vercel.app/, https://animemanager.example.com/',
  });
  assert.equal(configMulti.CORS_ORIGIN, 'https://animemanager.vercel.app, https://animemanager.example.com');
});

test('Config Safeguards (Fix 2): Rejects production origins containing subpaths', () => {
  const pathOrigins = [
    'https://animemanager.vercel.app/app',
    'https://animemanager.vercel.app/api/v1',
    'https://animemanager.vercel.app/settings/',
  ];

  for (const origin of pathOrigins) {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: VALID_PROD_SECRET,
          MONGODB_URI: VALID_PROD_URI,
          MONGODB_DB_NAME: VALID_PROD_DB,
          CORS_ORIGIN: origin,
        });
      },
      (err) => {
        assert.ok(
          err.message.includes('CORS_ORIGIN cannot contain URL paths'),
          `Origin with path "${origin}" must be rejected`
        );
        return true;
      }
    );
  }
});

test('Config Safeguards (Fix 2): Rejects production origins containing query parameters', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        MONGODB_DB_NAME: VALID_PROD_DB,
        CORS_ORIGIN: 'https://animemanager.vercel.app?source=web',
      });
    },
    (err) => {
      assert.ok(err.message.includes('CORS_ORIGIN cannot contain query parameters'));
      return true;
    }
  );
});

test('Config Safeguards (Fix 2): Rejects production origins containing URL fragments', () => {
  assert.throws(
    () => {
      loadConfig({
        NODE_ENV: 'production',
        JWT_SECRET: VALID_PROD_SECRET,
        MONGODB_URI: VALID_PROD_URI,
        MONGODB_DB_NAME: VALID_PROD_DB,
        CORS_ORIGIN: 'https://animemanager.vercel.app#section',
      });
    },
    (err) => {
      assert.ok(err.message.includes('CORS_ORIGIN cannot contain URL fragments/hashes'));
      return true;
    }
  );
});

test('Config Safeguards (Fix 2): Rejects production origins containing embedded credentials', () => {
  const credentialOrigins = [
    'https://user:password@animemanager.vercel.app',
    'https://admin@animemanager.vercel.app',
  ];

  for (const origin of credentialOrigins) {
    assert.throws(
      () => {
        loadConfig({
          NODE_ENV: 'production',
          JWT_SECRET: VALID_PROD_SECRET,
          MONGODB_URI: VALID_PROD_URI,
          MONGODB_DB_NAME: VALID_PROD_DB,
          CORS_ORIGIN: origin,
        });
      },
      (err) => {
        assert.ok(
          err.message.includes('CORS_ORIGIN cannot contain embedded credentials'),
          `Origin with credentials "${origin}" must be rejected`
        );
        return true;
      }
    );
  }
});

