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

export async function initIndexes(dbInstance?: Db): Promise<void> {
  const db = dbInstance || (await getDb());

  // 1. Titles indexes
  const titles = db.collection<TitleDocument>('titles');
  await titles.createIndex({ ownerId: 1, mediaType: 1, createdAt: -1 }, { name: 'idx_titles_owner_media_created' });
  await titles.createIndex({ ownerId: 1, englishTitle: 1 }, { name: 'idx_titles_owner_english_title' });
  await titles.createIndex({ ownerId: 1, releaseYear: -1 }, { name: 'idx_titles_owner_year' });
  await titles.createIndex({ ownerId: 1, createdAt: -1 }, { name: 'idx_titles_owner_created' });
  await titles.createIndex(
    { ownerId: 1, 'externalSources.provider': 1, 'externalSources.externalId': 1 },
    {
      name: 'uq_titles_owner_provider_external_id',
      unique: true,
      partialFilterExpression: { 'externalSources.externalId': { $exists: true } },
    }
  );

  // 2. Collections indexes
  const collections = db.collection<CollectionDocument>('collections');
  // Unique compound index on ownerId and normalizedName (trimmed and lowercased)
  await collections.createIndex(
    { ownerId: 1, normalizedName: 1 },
    { name: 'uq_collections_owner_normalized_name', unique: true }
  );
  await collections.createIndex({ ownerId: 1, createdAt: 1 }, { name: 'idx_collections_owner_created' });
  await collections.createIndex({ 'items.titleId': 1 }, { name: 'idx_collections_items_title_id' });

  // 3. Bookmarks indexes
  const bookmarks = db.collection<BookmarkDocument>('bookmarks');
  await bookmarks.createIndex(
    { ownerId: 1, titleId: 1 },
    { name: 'uq_bookmarks_owner_title', unique: true }
  );
  await bookmarks.createIndex({ ownerId: 1, status: 1, updatedAt: -1 }, { name: 'idx_bookmarks_owner_status_updated' });
  await bookmarks.createIndex({ ownerId: 1, personalRating: -1 }, { name: 'idx_bookmarks_owner_rating' });
  await bookmarks.createIndex({ ownerId: 1, priority: -1 }, { name: 'idx_bookmarks_owner_priority' });
  await bookmarks.createIndex({ ownerId: 1, progress: -1 }, { name: 'idx_bookmarks_owner_progress' });
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
