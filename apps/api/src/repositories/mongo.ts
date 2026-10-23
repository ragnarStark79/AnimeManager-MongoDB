import { MongoClient, Db, Collection, ServerApiVersion, ClientSession } from 'mongodb';
import { config } from '../config/index.js';

export interface TitleAliasDoc {
  id?: string;
  alias: string;
  languageCode: string | null;
  aliasType: string | null;
}

export interface TitleGenreDoc {
  id?: string;
  name: string;
  slug: string;
}

export interface TitleTagDoc {
  id?: string;
  name: string;
  slug: string;
}

export interface TitleExternalSourceDoc {
  id?: string;
  provider: string;
  externalId: string;
  sourceUrl: string | null;
  lastFetchedAt?: Date | null;
}

export interface TitleDocument {
  _id: string; // UUID string identifier
  ownerId: string;
  mediaType: string;
  englishTitle: string;
  originalTitle: string | null;
  synopsis: string | null;
  background: string | null;
  coverUrl: string | null;
  coverStoragePath: string | null;
  coverSourceType: string;
  releaseYear: number | null;
  publicationStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  episodeCount: number | null;
  chapterCount: number | null;
  sourceScore: number | null;
  sourceRank: number | null;
  sourcePopularity: number | null;
  aliases: TitleAliasDoc[];
  genres: TitleGenreDoc[];
  tags: TitleTagDoc[];
  externalSources: TitleExternalSourceDoc[];
  createdAt: Date;
  updatedAt: Date;
}

export interface CollectionItemDoc {
  titleId: string;
  position: number;
  addedAt: Date;
}

export interface CollectionDocument {
  _id: string; // UUID string identifier
  ownerId: string;
  name: string; // Trimmed display name
  normalizedName: string; // Trimmed & lowercased for case-insensitive uniqueness
  description: string | null;
  coverUrl: string | null;
  icon: string | null;
  color: string | null;
  sortMode: string;
  items: CollectionItemDoc[];
  titleCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookmarkDocument {
  _id: string; // UUID string identifier
  ownerId: string;
  titleId: string;
  status: string;
  progress: number;
  progressUnit: string;
  progressTotal: number | null;
  priority: number | null;
  personalRating: number | null;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RootAdminDocument {
  _id: string; // UUID string identifier
  email: string; // Trimmed & lowercased for case-insensitive uniqueness
  username?: string; // Trimmed & lowercased for case-insensitive uniqueness
  passwordHash: string; // scrypt$v1$<saltHex>$<derivedKeyHex>
  displayName: string;
  role: 'root_admin';
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface RootAdminSessionDocument {
  _id: string; // UUID string identifier
  sessionTokenHash: string; // SHA-256 hash of raw token
  rootAdminId: string; // References RootAdminDocument._id
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SuperAdminDocument {
  _id: string; // UUID string identifier
  email: string; // Trimmed & lowercased for case-insensitive uniqueness
  username?: string; // Trimmed & lowercased
  passwordHash: string; // scrypt$v1$<saltHex>$<derivedKeyHex>
  displayName: string;
  role?: 'superadmin';
  status: 'active' | 'disabled';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface SuperAdminSessionDocument {
  _id: string; // UUID string identifier
  sessionTokenHash: string; // SHA-256 hash of raw token
  adminId: string; // References SuperAdminDocument._id
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface UserDocument {
  _id: string; // UUID string identifier (Personal Library Owner ID)
  email: string; // Trimmed & lowercased for case-insensitive uniqueness
  username: string; // Trimmed & lowercased for case-insensitive uniqueness
  passwordHash: string; // scrypt$v1$<saltHex>$<derivedKeyHex>
  displayName: string;
  role: 'user';
  status: 'active' | 'restricted' | 'disabled' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
}

export interface UserSessionDocument {
  _id: string; // UUID string identifier
  sessionTokenHash: string; // SHA-256 hash of raw token
  userId: string; // References UserDocument._id
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditLogDocument {
  _id: string; // UUID string identifier
  eventType: string;
  actorId: string;
  actorRole: 'root_admin' | 'superadmin' | 'user' | 'system';
  targetId?: string | null;
  targetType?: 'user' | 'superadmin' | 'root_admin' | 'library' | 'system';
  action: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

export interface AccountMfaDocument {
  _id: string; // UUID string identifier
  accountId: string; // References UserDocument._id, SuperAdminDocument._id, or RootAdminDocument._id
  accountRole: 'user' | 'superadmin' | 'root_admin';
  totpEnabled: boolean;
  encryptedTotpSecret: string | null; // AES-256-GCM encrypted active secret
  pendingEncryptedTotpSecret: string | null; // AES-256-GCM encrypted pending secret during enrollment
  pendingSetupExpiresAt: Date | null;
  lastUsedTimeStep: number | null; // RFC 6238 time step to prevent replay attacks
  recoveryCodeHashes: string[]; // SHA-256 hashes of single-use recovery codes
  enrolledAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}




export interface MongoHealthDetailed {
  connected: boolean;
  schemaReady: boolean;
  target: 'mongodb' | 'mongodb_atlas' | 'local_mongodb';
  sanitizedHost: string;
  collectionsCount: number;
  missingCollections?: string[];
}

const REQUIRED_CORE_COLLECTIONS = ['titles', 'collections', 'bookmarks'];

let clientInstance: MongoClient | null = null;
let clientConnectingPromise: Promise<MongoClient> | null = null;
let activeTestDbName: string | null = null;

export function assertSafeTestDatabaseName(name: string): void {
  const lower = name.toLowerCase().trim();
  if (!lower.includes('test') || lower === 'animemanager' || lower === 'production' || lower === 'prod') {
    throw new Error(
      `[SECURITY GUARD] Refusing to use database "${name}" in test mode. Test database name MUST contain "test" and cannot be production or development.`
    );
  }
}

export function setTestDbName(name: string | null): void {
  if (name !== null) {
    assertSafeTestDatabaseName(name);
  }
  activeTestDbName = name;
}

export function getEffectiveDbName(): string {
  if (activeTestDbName) return activeTestDbName;
  if (config.NODE_ENV === 'test') {
    const candidate = process.env.TEST_MONGODB_DB_NAME || 'animemanager_test';
    assertSafeTestDatabaseName(candidate);
    return candidate;
  }
  return config.MONGODB_DB_NAME || 'animemanager';
}

export function sanitizeMongoUri(uri: string): string {
  try {
    const url = new URL(uri);
    const path = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return uri.replace(/\/\/[^:]+:[^@]+@/, '//').replace(/\/+$/, '');
  }
}

export async function getMongoClient(): Promise<MongoClient> {
  if (clientInstance) {
    return clientInstance;
  }

  if (clientConnectingPromise) {
    return clientConnectingPromise;
  }

  const isServerless = Boolean(process.env.VERCEL);
  const isTest = config.NODE_ENV === 'test';

  const client = new MongoClient(config.MONGODB_URI, {
    maxPoolSize: isServerless ? 3 : isTest ? 5 : 20,
    minPoolSize: isServerless ? 0 : isTest ? 1 : 2,
    maxIdleTimeMS: isServerless ? 10000 : 30000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
  });

  clientConnectingPromise = client.connect().then((connectedClient) => {
    clientInstance = connectedClient;
    clientConnectingPromise = null;
    return connectedClient;
  }).catch((err) => {
    clientConnectingPromise = null;
    throw err;
  });

  return clientConnectingPromise;
}

let dbOverride: (() => Promise<Db>) | null = null;

export function setMongoDbOverride(fn: (() => Promise<Db>) | null): void {
  dbOverride = fn;
}

export async function getDb(name?: string): Promise<Db> {
  if (dbOverride) {
    return dbOverride();
  }
  const client = await getMongoClient();
  const dbName = name || getEffectiveDbName();
  return client.db(dbName);
}

export async function getTitlesCollection(): Promise<Collection<TitleDocument>> {
  const db = await getDb();
  return db.collection<TitleDocument>('titles');
}

export async function getCollectionsCollection(): Promise<Collection<CollectionDocument>> {
  const db = await getDb();
  return db.collection<CollectionDocument>('collections');
}

export async function getBookmarksCollection(): Promise<Collection<BookmarkDocument>> {
  const db = await getDb();
  return db.collection<BookmarkDocument>('bookmarks');
}

export async function getRootAdminsCollection(): Promise<Collection<RootAdminDocument>> {
  const db = await getDb();
  return db.collection<RootAdminDocument>('root_admins');
}

export async function getRootAdminSessionsCollection(): Promise<Collection<RootAdminSessionDocument>> {
  const db = await getDb();
  return db.collection<RootAdminSessionDocument>('root_admin_sessions');
}

export async function getSuperAdminsCollection(): Promise<Collection<SuperAdminDocument>> {
  const db = await getDb();
  return db.collection<SuperAdminDocument>('super_admins');
}

export async function getSuperAdminSessionsCollection(): Promise<Collection<SuperAdminSessionDocument>> {
  const db = await getDb();
  return db.collection<SuperAdminSessionDocument>('super_admin_sessions');
}

export async function getSessionsCollection(): Promise<Collection<SuperAdminSessionDocument>> {
  return getSuperAdminSessionsCollection();
}

export async function getUsersCollection(): Promise<Collection<UserDocument>> {
  const db = await getDb();
  return db.collection<UserDocument>('users');
}

export async function getUserSessionsCollection(): Promise<Collection<UserSessionDocument>> {
  const db = await getDb();
  return db.collection<UserSessionDocument>('user_sessions');
}

export async function getAuditLogsCollection(): Promise<Collection<AuditLogDocument>> {
  const db = await getDb();
  return db.collection<AuditLogDocument>('audit_logs');
}

export async function getAccountMfaCollection(): Promise<Collection<AccountMfaDocument>> {
  const db = await getDb();
  return db.collection<AccountMfaDocument>('account_mfa');
}


async function createIndexSafely(collection: any, spec: any, options: any): Promise<void> {
  try {
    await collection.createIndex(spec, options);
  } catch (err: any) {
    if (err?.code === 85) {
      return; // Index already exists with another name
    }
    throw err;
  }
}

export async function initIndexes(dbInstance?: Db): Promise<void> {
  const db = dbInstance || (await getDb());

  // 1. Titles indexes
  const titles = db.collection<TitleDocument>('titles');
  await createIndexSafely(titles, { ownerId: 1, mediaType: 1, createdAt: -1 }, { name: 'idx_titles_owner_media_created' });
  await createIndexSafely(titles, { ownerId: 1, englishTitle: 1 }, { name: 'idx_titles_owner_english_title' });
  await createIndexSafely(titles, { ownerId: 1, releaseYear: -1 }, { name: 'idx_titles_owner_year' });
  await createIndexSafely(titles, { ownerId: 1, createdAt: -1 }, { name: 'idx_titles_owner_created' });
  await createIndexSafely(
    titles,
    { ownerId: 1, 'externalSources.provider': 1, 'externalSources.externalId': 1 },
    {
      name: 'uq_titles_owner_provider_external_id',
      unique: true,
      partialFilterExpression: { 'externalSources.externalId': { $exists: true } },
    }
  );

  // 2. Collections indexes
  const collections = db.collection<CollectionDocument>('collections');
  await createIndexSafely(
    collections,
    { ownerId: 1, normalizedName: 1 },
    { name: 'uq_collections_owner_normalized_name', unique: true }
  );
  await createIndexSafely(collections, { ownerId: 1, createdAt: 1 }, { name: 'idx_collections_owner_created' });
  await createIndexSafely(collections, { 'items.titleId': 1 }, { name: 'idx_collections_items_title_id' });

  // 3. Bookmarks indexes
  const bookmarks = db.collection<BookmarkDocument>('bookmarks');
  await createIndexSafely(
    bookmarks,
    { ownerId: 1, titleId: 1 },
    { name: 'uq_bookmarks_owner_title', unique: true }
  );
  await createIndexSafely(bookmarks, { ownerId: 1, status: 1, updatedAt: -1 }, { name: 'idx_bookmarks_owner_status_updated' });
  await createIndexSafely(bookmarks, { ownerId: 1, personalRating: -1 }, { name: 'idx_bookmarks_owner_rating' });
  await createIndexSafely(bookmarks, { ownerId: 1, priority: -1 }, { name: 'idx_bookmarks_owner_priority' });
  await createIndexSafely(bookmarks, { ownerId: 1, progress: -1 }, { name: 'idx_bookmarks_owner_progress' });

  // 4. Root Admin indexes
  const rootAdmins = db.collection<RootAdminDocument>('root_admins');
  await createIndexSafely(
    rootAdmins,
    { email: 1 },
    { name: 'uq_root_admins_email', unique: true }
  );
  await createIndexSafely(
    rootAdmins,
    { username: 1 },
    { name: 'uq_root_admins_username', unique: true, partialFilterExpression: { username: { $type: 'string' } } }
  );

  const rootAdminSessions = db.collection<RootAdminSessionDocument>('root_admin_sessions');
  await createIndexSafely(
    rootAdminSessions,
    { sessionTokenHash: 1 },
    { name: 'uq_root_admin_sessions_token_hash', unique: true }
  );
  await createIndexSafely(rootAdminSessions, { rootAdminId: 1 }, { name: 'idx_root_admin_sessions_admin_id' });
  await createIndexSafely(rootAdminSessions, { expiresAt: 1 }, { name: 'idx_root_admin_sessions_expires_at' });

  // 5. Super Admin indexes
  const superAdmins = db.collection<SuperAdminDocument>('super_admins');
  await createIndexSafely(
    superAdmins,
    { email: 1 },
    { name: 'uq_super_admins_email', unique: true }
  );
  await createIndexSafely(
    superAdmins,
    { username: 1 },
    { name: 'uq_super_admins_username', unique: true, partialFilterExpression: { username: { $type: 'string' } } }
  );

  const superAdminSessions = db.collection<SuperAdminSessionDocument>('super_admin_sessions');
  await createIndexSafely(
    superAdminSessions,
    { sessionTokenHash: 1 },
    { name: 'uq_sessions_token_hash', unique: true }
  );
  await createIndexSafely(superAdminSessions, { adminId: 1 }, { name: 'idx_sessions_admin_id' });
  await createIndexSafely(superAdminSessions, { expiresAt: 1 }, { name: 'idx_sessions_expires_at' });

  // 6. Users indexes
  const users = db.collection<UserDocument>('users');
  await createIndexSafely(
    users,
    { email: 1 },
    { name: 'uq_users_email', unique: true }
  );
  await createIndexSafely(
    users,
    { username: 1 },
    { name: 'uq_users_username', unique: true }
  );

  const userSessions = db.collection<UserSessionDocument>('user_sessions');
  await createIndexSafely(
    userSessions,
    { sessionTokenHash: 1 },
    { name: 'uq_user_sessions_token_hash', unique: true }
  );
  await createIndexSafely(userSessions, { userId: 1 }, { name: 'idx_user_sessions_user_id' });
  await createIndexSafely(userSessions, { expiresAt: 1 }, { name: 'idx_user_sessions_expires_at' });

  // 7. Audit Log indexes
  const auditLogs = db.collection<AuditLogDocument>('audit_logs');
  await createIndexSafely(auditLogs, { timestamp: -1 }, { name: 'idx_audit_logs_timestamp' });
  await createIndexSafely(auditLogs, { actorId: 1, timestamp: -1 }, { name: 'idx_audit_logs_actor' });
  await createIndexSafely(auditLogs, { targetId: 1, timestamp: -1 }, { name: 'idx_audit_logs_target' });
  await createIndexSafely(auditLogs, { eventType: 1, timestamp: -1 }, { name: 'idx_audit_logs_event_type' });

  // 8. Account MFA indexes
  const accountMfa = db.collection<AccountMfaDocument>('account_mfa');
  await createIndexSafely(
    accountMfa,
    { accountId: 1, accountRole: 1 },
    { name: 'uq_account_mfa_account_role', unique: true }
  );
  await createIndexSafely(accountMfa, { accountId: 1 }, { name: 'idx_account_mfa_account_id' });
}


export async function checkHealthDetailed(): Promise<MongoHealthDetailed> {
  const sanitizedHost = sanitizeMongoUri(config.MONGODB_URI);
  let target: 'mongodb' | 'mongodb_atlas' | 'local_mongodb' = 'local_mongodb';
  if (config.MONGODB_URI.includes('mongodb+srv://') || config.MONGODB_URI.includes('.mongodb.net')) {
    target = 'mongodb_atlas';
  } else if (!config.MONGODB_URI.includes('localhost') && !config.MONGODB_URI.includes('127.0.0.1')) {
    target = 'mongodb';
  }

  try {
    const db = await getDb();
    const ping = await db.command({ ping: 1 });
    const isConnected = Boolean(ping && (ping.ok === 1 || ping.ok === true));

    if (!isConnected) {
      return {
        connected: false,
        schemaReady: false,
        target,
        sanitizedHost,
        collectionsCount: 0,
      };
    }

    const cols = await db.listCollections().toArray();
    const existingColNames = new Set(cols.map((c) => c.name));
    const missing = REQUIRED_CORE_COLLECTIONS.filter((c) => !existingColNames.has(c));

    const baseHost = sanitizedHost.replace(/\/+$/, '');
    const fullSanitizedHost = `${baseHost}/${getEffectiveDbName()}`;

    return {
      connected: true,
      schemaReady: missing.length === 0,
      target,
      sanitizedHost: fullSanitizedHost,
      collectionsCount: cols.length,
      missingCollections: missing.length > 0 ? missing : undefined,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (config.NODE_ENV !== 'test') {
      console.warn(`[AnimeManager Mongo] Health check failed: ${msg}`);
    }
    const baseHost = sanitizedHost.replace(/\/+$/, '');
    return {
      connected: false,
      schemaReady: false,
      target,
      sanitizedHost: `${baseHost}/${getEffectiveDbName()}`,
      collectionsCount: 0,
    };
  }
}

export async function withOptionalTransaction<T>(
  callback: (session?: ClientSession) => Promise<T>
): Promise<T> {
  const client = await getMongoClient();
  let session: ClientSession | undefined;
  try {
    session = client.startSession();
    let result: T;
    try {
      await session.withTransaction(async () => {
        result = await callback(session);
      });
      return result!;
    } catch (txnError: unknown) {
      const msg = txnError instanceof Error ? txnError.message : String(txnError);
      // Standalone mongod does not support transactions (fails with code 20)
      if (
        msg.includes('Transaction numbers are only allowed on a replica set member') ||
        (txnError as { code?: number }).code === 20
      ) {
        return await callback(undefined);
      }
      throw txnError;
    }
  } finally {
    if (session) {
      try {
        await session.endSession();
      } catch {
        // ignore session cleanup error
      }
    }
  }
}

export async function closeMongo(): Promise<void> {
  if (clientInstance) {
    try {
      await clientInstance.close();
    } finally {
      clientInstance = null;
      clientConnectingPromise = null;
    }
  }
}
