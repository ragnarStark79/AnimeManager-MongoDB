import jwt from 'jsonwebtoken';
import { execSync } from 'node:child_process';
import { config } from '../dist/config/index.js';

export const TEST_OWNER_A = '00000000-0000-0000-0000-000000000001';
export const TEST_OWNER_B = '00000000-0000-0000-0000-000000000002';

export function createToken(ownerId, options = {}) {
  const secret = options.secret || config.JWT_SECRET;
  const payload = {
    sub: ownerId,
    email: options.email || `user_${ownerId.slice(0, 8)}@example.com`,
    role: options.role || 'authenticated',
  };
  return jwt.sign(payload, secret, {
    expiresIn: options.expiresIn || '1h',
  });
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../');

// Resets the isolated MongoDB test database with strict safety guards.
// Alias for resetMongoTestDatabase to prevent silent no-op test execution.
export async function resetTestDatabase() {
  return resetMongoTestDatabase();
}

export function assertSafeTestEnvironment(dbName, uri) {
  const normalizedDb = (dbName || '').toLowerCase().trim();
  if (!normalizedDb.includes('test') || normalizedDb === 'animemanager' || normalizedDb === 'production') {
    throw new Error(
      `[SECURITY GUARD] Destructive cleanup aborted: Database "${dbName}" is not an isolated test database!`
    );
  }
  if (uri && (uri.includes('mongodb+srv://') || uri.includes('.mongodb.net'))) {
    throw new Error(
      '[SECURITY GUARD] Destructive cleanup aborted: MONGODB_URI points to a remote cloud / Atlas cluster!'
    );
  }
}

export async function resetMongoTestDatabase() {
  const { getDb, initIndexes, setTestDbName } = await import('../dist/repositories/mongo.js');
  setTestDbName('animemanager_test');
  const db = await getDb();
  assertSafeTestEnvironment(db.databaseName, config.MONGODB_URI);
  try {
    const existingCollections = await db.listCollections().toArray();
    for (const c of existingCollections) {
      await db.collection(c.name).deleteMany({});
    }
    await initIndexes(db);

    const v_owner_id = '00000000-0000-0000-0000-000000000001';
    const now = new Date('2024-01-01T00:00:00.000Z');

    const titles = [
      {
        _id: '10000000-0000-0000-0000-000000000001',
        ownerId: v_owner_id,
        mediaType: 'anime',
        englishTitle: 'Echoes of the Astral Sky',
        originalTitle: '星空のエコー',
        synopsis: 'A solitary cartographer maps forgotten constellations across a fractured sky realm.',
        background: 'Original animated production by Studio Starlight.',
        coverUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=800&auto=format&fit=crop&q=80',
        coverStoragePath: null,
        coverSourceType: 'url',
        releaseYear: 2024,
        publicationStatus: 'Finished Airing',
        startDate: '2024-01-05',
        endDate: '2024-03-29',
        episodeCount: 12,
        chapterCount: null,
        sourceScore: 8.75,
        sourceRank: 42,
        sourcePopularity: 1200,
        aliases: [
          { id: '50000000-0000-0000-0000-000000000001', alias: 'Hoshizora no Echo', languageCode: 'ja', aliasType: 'romanized' },
        ],
        genres: [
          { id: '30000000-0000-0000-0000-000000000002', name: 'Fantasy', slug: 'fantasy' },
          { id: '30000000-0000-0000-0000-000000000003', name: 'Drama', slug: 'drama' },
        ],
        tags: [
          { id: '40000000-0000-0000-0000-000000000001', name: 'High Magic', slug: 'high-magic' },
        ],
        externalSources: [
          { id: '60000000-0000-0000-0000-000000000001', provider: 'myanimelist', externalId: '99001', sourceUrl: 'https://myanimelist.net/anime/99001/astral_sky' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '10000000-0000-0000-0000-000000000002',
        ownerId: v_owner_id,
        mediaType: 'manga',
        englishTitle: 'Chronicles of the Wind Blade',
        originalTitle: '風刃の記録',
        synopsis: 'A wandering swordsman carries a fractured blade that whispers secrets of ancient techniques.',
        background: 'Serialized in Monthly Shonen Horizon.',
        coverUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=800&auto=format&fit=crop&q=80',
        coverStoragePath: null,
        coverSourceType: 'url',
        releaseYear: 2021,
        publicationStatus: 'Publishing',
        startDate: '2021-06-15',
        endDate: null,
        episodeCount: null,
        chapterCount: 75,
        sourceScore: 8.4,
        sourceRank: 150,
        sourcePopularity: 3400,
        aliases: [
          { id: '50000000-0000-0000-0000-000000000002', alias: 'Kazenoba no Kiroku', languageCode: 'ja', aliasType: 'romanized' },
        ],
        genres: [
          { id: '30000000-0000-0000-0000-000000000001', name: 'Action', slug: 'action' },
          { id: '30000000-0000-0000-0000-000000000004', name: 'Martial Arts', slug: 'martial-arts' },
        ],
        tags: [],
        externalSources: [
          { id: '60000000-0000-0000-0000-000000000002', provider: 'myanimelist', externalId: '99002', sourceUrl: 'https://myanimelist.net/manga/99002/wind_blade' },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '10000000-0000-0000-0000-000000000003',
        ownerId: v_owner_id,
        mediaType: 'manhwa',
        englishTitle: 'The Heavenly Sovereign Return',
        originalTitle: '천마군림보',
        synopsis: 'Betrayed by his closest disciples, the Heavenly Sovereign awakens three centuries later in the body of an exiled noble.',
        background: 'Adapted from the hit web novel by Moonlit Studio.',
        coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80',
        coverStoragePath: null,
        coverSourceType: 'url',
        releaseYear: 2023,
        publicationStatus: 'Publishing',
        startDate: '2023-04-10',
        endDate: null,
        episodeCount: null,
        chapterCount: 110,
        sourceScore: 9.1,
        sourceRank: 18,
        sourcePopularity: 850,
        aliases: [
          { id: '50000000-0000-0000-0000-000000000003', alias: 'Return of the Heavenly Demon', languageCode: 'en', aliasType: 'translated' },
        ],
        genres: [
          { id: '30000000-0000-0000-0000-000000000001', name: 'Action', slug: 'action' },
          { id: '30000000-0000-0000-0000-000000000002', name: 'Fantasy', slug: 'fantasy' },
          { id: '30000000-0000-0000-0000-000000000004', name: 'Martial Arts', slug: 'martial-arts' },
        ],
        tags: [
          { id: '40000000-0000-0000-0000-000000000002', name: 'Reincarnation', slug: 'reincarnation' },
        ],
        externalSources: [
          { id: '60000000-0000-0000-0000-000000000003', provider: 'myanimelist', externalId: '99003', sourceUrl: 'https://myanimelist.net/manga/99003/heavenly_sovereign' },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];

    const collections = [
      {
        _id: '20000000-0000-0000-0000-000000000001',
        ownerId: v_owner_id,
        name: 'Masterpieces',
        normalizedName: 'masterpieces',
        description: 'Unforgettable narratives and exceptional art direction',
        icon: 'star',
        color: '#38bdf8',
        sortMode: 'custom',
        titleCount: 2,
        items: [
          { titleId: '10000000-0000-0000-0000-000000000001', position: 1, addedAt: now },
          { titleId: '10000000-0000-0000-0000-000000000002', position: 2, addedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '20000000-0000-0000-0000-000000000002',
        ownerId: v_owner_id,
        name: 'Current Reading',
        normalizedName: 'current reading',
        description: 'Active reading list for weekly manhwa and manga chapters',
        icon: 'book-open',
        color: '#10b981',
        sortMode: 'date_added',
        titleCount: 1,
        items: [
          { titleId: '10000000-0000-0000-0000-000000000003', position: 1, addedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '20000000-0000-0000-0000-000000000003',
        ownerId: v_owner_id,
        name: 'Action & Martial Arts',
        normalizedName: 'action & martial arts',
        description: 'High-adrenaline choreography and cultivation works',
        icon: 'flame',
        color: '#f59e0b',
        sortMode: 'title',
        titleCount: 2,
        items: [
          { titleId: '10000000-0000-0000-0000-000000000002', position: 1, addedAt: now },
          { titleId: '10000000-0000-0000-0000-000000000003', position: 2, addedAt: now },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ];

    const bookmarks = [
      {
        _id: '70000000-0000-0000-0000-000000000001',
        ownerId: v_owner_id,
        titleId: '10000000-0000-0000-0000-000000000001',
        status: 'completed',
        progress: 12,
        progressUnit: 'episode',
        progressTotal: 12,
        priority: 5,
        personalRating: 9.5,
        notes: 'Phenomenal finale. The soundtrack is breathtaking.',
        startedAt: '2024-01-05',
        completedAt: '2024-03-29',
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '70000000-0000-0000-0000-000000000002',
        ownerId: v_owner_id,
        titleId: '10000000-0000-0000-0000-000000000002',
        status: 'consuming',
        progress: 45,
        progressUnit: 'chapter',
        progressTotal: 75,
        priority: 4,
        personalRating: 8.5,
        notes: 'The tournament arc pacing is superb.',
        startedAt: '2023-08-10',
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        _id: '70000000-0000-0000-0000-000000000003',
        ownerId: v_owner_id,
        titleId: '10000000-0000-0000-0000-000000000003',
        status: 'plan_to_consume',
        progress: 0,
        progressUnit: 'chapter',
        progressTotal: 110,
        priority: 3,
        personalRating: null,
        notes: 'Recommended by the community for top-tier art.',
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    await db.collection('titles').insertMany(titles);
    await db.collection('collections').insertMany(collections);
    await db.collection('bookmarks').insertMany(bookmarks);
  } catch (err) {
    console.error('ERROR IN resetMongoTestDatabase:', err);
    throw err;
  }
}

