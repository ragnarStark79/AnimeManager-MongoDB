import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function tryLoadEnv(): void {
  const candidatePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../.env'),
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

function createEnvSchema(sourceEnv: NodeJS.ProcessEnv) {
  return z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.preprocess((val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return val;
    }, z.string().min(1).optional()),
    DATABASE_URL: z.string().optional(),
    SUPABASE_DATABASE_URL: z.string().optional(),
    SUPABASE_JWT_SECRET: z.string().optional(),
    JWT_SECRET: z.preprocess(
      (val) => {
        const v = typeof val === 'string' ? val.trim() : val;
        if (v) return v;
        const legacy = sourceEnv.SUPABASE_JWT_SECRET?.trim();
        if (legacy) return legacy;
        return 'development-jwt-secret-min-16-chars-long!';
      },
      z.string().min(16, 'JWT_SECRET must be at least 16 characters')
    ),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    COVER_MAX_BYTES: z.coerce.number().int().positive().default(5242880),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI cannot be empty').default('mongodb://127.0.0.1:27017'),
    MONGODB_DB_NAME: z.preprocess((val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        return trimmed.length > 0 ? trimmed : undefined;
      }
      return val;
    }, z.string().min(1).optional()),
    METADATA_API_BASE_URL: z.string().url().default('https://api.tenrai.org/v1'),
    JIKAN_BASE_URL: z.string().url().optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    IMPORT_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
    IMPORT_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    JIKAN_CACHE_TTL_MS: z.coerce.number().int().positive().default(300000),
    JIKAN_CACHE_MAX_ENTRIES: z.coerce.number().int().positive().default(200),
    JIKAN_MIN_REQUEST_INTERVAL_MS: z.coerce.number().int().positive().default(350),
    ENABLE_DEV_AUTH: z.preprocess((val) => {
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return undefined;
    }, z.boolean().optional()),
    MFA_ENCRYPTION_KEY: z.preprocess(
      (val) => {
        if (typeof val === 'string') {
          const trimmed = val.trim();
          return trimmed.length > 0 ? trimmed : undefined;
        }
        return val;
      },
      z.string().min(32, 'MFA_ENCRYPTION_KEY must be at least 32 characters').optional()
    ),
  });
}

export function loadConfig(envInput?: NodeJS.ProcessEnv) {
  if (!envInput) {
    tryLoadEnv();
  }
  const sourceEnv = envInput || process.env;
  const envSchema = createEnvSchema(sourceEnv);
  const result = envSchema.safeParse(sourceEnv);
  if (!result.success) {
    const missingKeys = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    if (sourceEnv.NODE_ENV !== 'test') {
      console.error(`\n[Config Error] Invalid or missing environment configuration:\n${missingKeys}\n`);
    }
    throw new Error(`[Config Error] Invalid or missing environment configuration: ${result.error.errors.map((e) => e.path.join('.')).join(', ')}`);
  }

  // Resolve legacy database URL for backward-compatibility with migration tools
  const effectiveDbUrl = sourceEnv.SUPABASE_DATABASE_URL?.trim() || result.data.DATABASE_URL || 'postgresql://localhost:5432/animemanager';

  let databaseTarget: 'supabase' | 'local_postgres' | 'remote_postgres' = 'local_postgres';
  if (effectiveDbUrl.includes('supabase.co') || effectiveDbUrl.includes('supabase.com')) {
    databaseTarget = 'supabase';
  } else if (effectiveDbUrl.includes('localhost') || effectiveDbUrl.includes('127.0.0.1')) {
    databaseTarget = 'local_postgres';
  } else {
    databaseTarget = 'remote_postgres';
  }

  let sanitizedDbHost = 'unknown';
  try {
    const parsedDbUrl = new URL(effectiveDbUrl);
    sanitizedDbHost = `${parsedDbUrl.host}${parsedDbUrl.pathname}`;
  } catch {
    sanitizedDbHost = 'invalid-connection-string';
  }

  // Strict Security Guards for Production Environment
  let effectiveDbName: string;
  let effectiveCorsOrigin: string;

  if (result.data.NODE_ENV === 'production') {
    if (result.data.ENABLE_DEV_AUTH === true) {
      throw new Error('[Config Error] Fatal: ENABLE_DEV_AUTH cannot be enabled in production environments.');
    }
    if (result.data.JWT_SECRET === 'development-jwt-secret-min-16-chars-long!') {
      throw new Error('[Config Error] Fatal: Insecure default JWT_SECRET cannot be used in production environments.');
    }
    if (result.data.MONGODB_URI.includes('localhost') || result.data.MONGODB_URI.includes('127.0.0.1')) {
      throw new Error('[Config Error] Fatal: Production environment cannot use localhost MongoDB.');
    }
    if (
      result.data.MFA_ENCRYPTION_KEY &&
      (result.data.MFA_ENCRYPTION_KEY === '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' ||
        result.data.MFA_ENCRYPTION_KEY.includes('development') ||
        result.data.MFA_ENCRYPTION_KEY.includes('test'))
    ) {
      throw new Error(
        '[Config Error] Fatal: Insecure default MFA_ENCRYPTION_KEY cannot be used in production environments.'
      );
    }

    // Remediation A: Explicit production database name validation
    const rawDbName = sourceEnv.MONGODB_DB_NAME?.trim();
    if (!rawDbName) {
      throw new Error(
        '[Config Error] Fatal: MONGODB_DB_NAME is required in production environments and must be explicitly configured.'
      );
    }

    const lowerDbName = rawDbName.toLowerCase();
    const forbiddenProductionDbNames = [
      'animemanager',
      'animemanager_test',
      'animemanager_atlas_verification_test',
      'test',
      'dev',
      'development',
    ];

    if (forbiddenProductionDbNames.includes(lowerDbName) || lowerDbName.includes('test')) {
      throw new Error(
        `[Config Error] Fatal: Production environment cannot use development or test database "${rawDbName}". Please configure an isolated production database name.`
      );
    }
    effectiveDbName = rawDbName;

    // Remediation B & Fix 2: Explicit production CORS configuration validation & origin normalization
    const rawCors = (sourceEnv.CORS_ORIGIN || '').trim();
    if (!rawCors) {
      throw new Error(
        '[Config Error] Fatal: CORS_ORIGIN is required in production environments and must be explicitly configured.'
      );
    }

    if (rawCors === '*' || rawCors.includes('*')) {
      throw new Error(
        '[Config Error] Fatal: CORS_ORIGIN cannot be wildcard "*" in production when credentials are enabled.'
      );
    }

    const rawOrigins = rawCors.split(',').map((o) => o.trim()).filter(Boolean);
    if (rawOrigins.length === 0) {
      throw new Error(
        '[Config Error] Fatal: CORS_ORIGIN is required in production environments and must contain at least one valid origin.'
      );
    }

    const normalizedOrigins: string[] = [];

    for (const origin of rawOrigins) {
      if (origin === '*' || origin.includes('*')) {
        throw new Error(
          '[Config Error] Fatal: CORS_ORIGIN cannot be wildcard "*" in production when credentials are enabled.'
        );
      }

      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        throw new Error(
          `[Config Error] Fatal: CORS_ORIGIN cannot contain localhost/127.0.0.1 in production environments: "${origin}".`
        );
      }

      let parsed: URL;
      try {
        parsed = new URL(origin);
      } catch {
        throw new Error(
          `[Config Error] Fatal: Malformed origin in CORS_ORIGIN: "${origin}". Must be a valid URL with protocol (e.g. "https://example.com").`
        );
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(`[Config Error] Fatal: Invalid protocol in CORS origin: "${origin}". Must be http: or https:.`);
      }

      if (parsed.username || parsed.password) {
        throw new Error(
          `[Config Error] Fatal: CORS_ORIGIN cannot contain embedded credentials (username/password): "${origin}".`
        );
      }

      if (parsed.search) {
        throw new Error(
          `[Config Error] Fatal: CORS_ORIGIN cannot contain query parameters: "${origin}". Must be a pure origin (e.g. "https://example.com").`
        );
      }

      if (parsed.hash) {
        throw new Error(
          `[Config Error] Fatal: CORS_ORIGIN cannot contain URL fragments/hashes: "${origin}". Must be a pure origin (e.g. "https://example.com").`
        );
      }

      // Trailing slash policy: A pure origin URL with only a root trailing slash (pathname === '/')
      // is normalized to parsed.origin (stripping the trailing slash). Subpaths (pathname !== '/' and !== '') are strictly rejected.
      if (parsed.pathname && parsed.pathname !== '/') {
        throw new Error(
          `[Config Error] Fatal: CORS_ORIGIN cannot contain URL paths ("${parsed.pathname}"): "${origin}". Must be a pure origin without path components (e.g. "https://example.com").`
        );
      }

      normalizedOrigins.push(parsed.origin);
    }

    effectiveCorsOrigin = normalizedOrigins.join(', ');
  } else {
    // Development / Test defaults
    effectiveDbName = result.data.MONGODB_DB_NAME || 'animemanager';
    effectiveCorsOrigin = result.data.CORS_ORIGIN || 'http://localhost:5173';
  }

  // Resolve effective metadata API base URL:
  // 1. Explicit METADATA_API_BASE_URL takes precedence
  // 2. Legacy JIKAN_BASE_URL is respected if not pointing to discontinued public api.jikan.moe
  // 3. Verified default is Tenrai v1 API (https://api.tenrai.org/v1)
  const defaultProviderUrl = 'https://api.tenrai.org/v1';
  let effectiveMetadataUrl = defaultProviderUrl;

  const rawMetadataUrl = sourceEnv.METADATA_API_BASE_URL?.trim();
  const rawJikanUrl = sourceEnv.JIKAN_BASE_URL?.trim();

  if (rawMetadataUrl) {
    effectiveMetadataUrl = rawMetadataUrl;
  } else if (rawJikanUrl) {
    if (rawJikanUrl.includes('api.jikan.moe')) {
      if (result.data.NODE_ENV !== 'test') {
        console.warn(
          '[Config Warning] JIKAN_BASE_URL points to discontinued api.jikan.moe. Falling back to Tenrai v1 (https://api.tenrai.org/v1).'
        );
      }
      effectiveMetadataUrl = defaultProviderUrl;
    } else {
      effectiveMetadataUrl = rawJikanUrl;
    }
  }

  return {
    ...result.data,
    CORS_ORIGIN: effectiveCorsOrigin,
    MONGODB_DB_NAME: effectiveDbName,
    JWT_SECRET: result.data.JWT_SECRET,
    SUPABASE_JWT_SECRET: result.data.JWT_SECRET,
    DATABASE_URL: effectiveDbUrl,
    databaseTarget,
    sanitizedDbHost,
    METADATA_API_BASE_URL: effectiveMetadataUrl,
    JIKAN_BASE_URL: effectiveMetadataUrl,
  };
}

export type Config = ReturnType<typeof loadConfig>;
export const config: Config = loadConfig();
