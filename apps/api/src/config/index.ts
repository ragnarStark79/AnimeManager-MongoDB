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

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  DATABASE_URL: z.string().optional(),
  SUPABASE_DATABASE_URL: z.string().optional(),
  SUPABASE_JWT_SECRET: z.string().optional(),
  JWT_SECRET: z.preprocess(
    (val) => {
      const v = typeof val === 'string' ? val.trim() : val;
      if (v) return v;
      const legacy = process.env.SUPABASE_JWT_SECRET?.trim();
      if (legacy) return legacy;
      return 'development-jwt-secret-min-16-chars-long!';
    },
    z.string().min(16, 'JWT_SECRET must be at least 16 characters')
  ),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  COVER_MAX_BYTES: z.coerce.number().int().positive().default(5242880),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI cannot be empty').default('mongodb://127.0.0.1:27017'),
  MONGODB_DB_NAME: z.string().min(1, 'MONGODB_DB_NAME cannot be empty').default('animemanager'),
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
});

function loadConfig() {
  tryLoadEnv();
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missingKeys = result.error.errors.map((e) => `  - ${e.path.join('.')}: ${e.message}`).join('\n');
    console.error(`\n[Config Error] Invalid or missing environment configuration:\n${missingKeys}\n`);
    throw new Error(`[Config Error] Invalid or missing environment configuration: ${result.error.errors.map((e) => e.path.join('.')).join(', ')}`);
  }

  // Resolve legacy database URL for backward-compatibility with migration tools
  const effectiveDbUrl = process.env.SUPABASE_DATABASE_URL?.trim() || result.data.DATABASE_URL || 'postgresql://localhost:5432/animemanager';

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

  // Strict Security Guard: Never allow development auth, localhost MongoDB, or default dev JWT secret in production
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
  }

  // Resolve effective metadata API base URL:
  // 1. Explicit METADATA_API_BASE_URL takes precedence
  // 2. Legacy JIKAN_BASE_URL is respected if not pointing to discontinued public api.jikan.moe
  // 3. Verified default is Tenrai v1 API (https://api.tenrai.org/v1)
  const defaultProviderUrl = 'https://api.tenrai.org/v1';
  let effectiveMetadataUrl = defaultProviderUrl;

  const rawMetadataUrl = process.env.METADATA_API_BASE_URL?.trim();
  const rawJikanUrl = process.env.JIKAN_BASE_URL?.trim();

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
