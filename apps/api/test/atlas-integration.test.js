import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { config } from '../dist/config/index.js';
import {
  getMongoClient,
  getDb,
  setTestDbName,
  getEffectiveDbName,
  initIndexes,
  checkHealthDetailed,
  closeMongo,
  withOptionalTransaction,
} from '../dist/repositories/mongo.js';
import { titlesRepository } from '../dist/repositories/titles.repository.js';
import { collectionsRepository } from '../dist/repositories/collections.repository.js';
import { bookmarksRepository } from '../dist/repositories/bookmarks.repository.js';
import { ImportService } from '../dist/services/import/import.service.js';

// Dedicated Atlas Verification Test Database
const ATLAS_TEST_DB = 'animemanager_atlas_verification_test';
const TEST_OWNER_A = '10000000-0000-0000-0000-000000000001';
const TEST_OWNER_B = '20000000-0000-0000-0000-000000000002';

// Security Guard: Abort immediately if not pointing to Atlas
if (!config.MONGODB_URI.includes('mongodb+srv://') && !config.MONGODB_URI.includes('.mongodb.net')) {
  throw new Error(
    `[ATLAS GUARD] atlas-integration.test.js requires an active MongoDB Atlas cluster URI, got: ${config.MONGODB_URI}`
  );
}

before(async () => {
  setTestDbName(ATLAS_TEST_DB);
  const db = await getDb();
  if (db.databaseName !== ATLAS_TEST_DB) {
    throw new Error(
      `[ATLAS GUARD] Target database mismatch: expected ${ATLAS_TEST_DB}, got ${db.databaseName}`
    );
  }

  // Idempotent index initialization in dedicated Atlas test DB
  await initIndexes(db);

  // Clean only synthetic test owner records before testing
  await db.collection('titles').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
  await db.collection('collections').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
  await db.collection('bookmarks').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
});

after(async () => {
  try {
    const db = await getDb();
    if (db.databaseName === ATLAS_TEST_DB) {
      // Clean only synthetic test owner records - do NOT drop database
      await db.collection('titles').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
      await db.collection('collections').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
      await db.collection('bookmarks').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
    }
  } finally {
    setTestDbName(null);
    await closeMongo();
  }
});

test('Atlas 01: Cluster Topology & Health Reporting', async () => {
  const client = await getMongoClient();
  const topologyType = client.topology?.description?.type;
  assert.ok(
    topologyType === 'ReplicaSetWithPrimary' || topologyType === 'Sharded',
    `Expected replica set or sharded topology on Atlas, got ${topologyType}`
  );

  const health = await checkHealthDetailed();
  assert.equal(health.connected, true);
  assert.equal(health.target, 'mongodb_atlas');
  assert.equal(health.schemaReady, true);
  assert.ok(!health.sanitizedHost.includes('@'), 'Sanitized host must not contain credentials');
  assert.ok(health.sanitizedHost.includes('cluster0.fovkyj5.mongodb.net'));
});

test('Atlas 02: Title CRUD, Nested Relations & Query Filters', async () => {
  const titleId = randomUUID();
  const created = await titlesRepository.create(TEST_OWNER_A, {
    mediaType: 'anime',
    englishTitle: 'Atlas Cloud Chronicle',
    originalTitle: 'クラウド年代記',
    synopsis: 'A test anime running on MongoDB Atlas cloud cluster.',
    releaseYear: 2026,
    publicationStatus: 'Currently Airing',
    episodeCount: 24,
    sourceScore: 9.15,
    aliases: [
      { title: 'Cloud Chronicle', languageCode: 'en', aliasType: 'english' },
      { title: 'Cloud Chrono', languageCode: null, aliasType: null },
    ],
    genres: ['Sci-Fi', 'Adventure'],
    tags: ['Cyberpunk', 'Space'],
    externalSources: [
      {
        provider: 'myanimelist',
        externalId: '9999991',
        sourceUrl: 'https://myanimelist.net/anime/9999991',
      },
    ],
  });

  assert.ok(created.id);
  assert.equal(created.englishTitle, 'Atlas Cloud Chronicle');
  assert.equal(created.aliases.length, 2);
  assert.equal(created.genres.length, 2);
  assert.equal(created.tags.length, 2);

  // Read by ID
  const fetched = await titlesRepository.findById(TEST_OWNER_A, created.id);
  assert.ok(fetched);
  assert.equal(fetched.englishTitle, 'Atlas Cloud Chronicle');

  // Search filter
  const searchResults = await titlesRepository.list(TEST_OWNER_A, { q: 'Chronicle' });
  assert.ok(searchResults.items.some((t) => t.id === created.id));

  // Update
  const updated = await titlesRepository.update(TEST_OWNER_A, created.id, {
    synopsis: 'Updated synopsis on Atlas.',
    sourceScore: 9.5,
  });
  assert.ok(updated);
  assert.equal(updated.synopsis, 'Updated synopsis on Atlas.');
  assert.equal(updated.sourceScore, 9.5);
});

test('Atlas 03: Bookmarks CRUD, Constraints & Unique Index Enforcement', async () => {
  const title = await titlesRepository.create(TEST_OWNER_A, {
    mediaType: 'manga',
    englishTitle: 'Atlas Manga Test',
  });

  // Create Bookmark
  const bookmark = await bookmarksRepository.create(TEST_OWNER_A, {
    titleId: title.id,
    status: 'reading',
    progress: 15,
    progressUnit: 'chapter',
    progressTotal: 100,
    priority: 1,
    personalRating: 9,
    notes: 'Initial Atlas bookmark note',
  });
  assert.ok(bookmark.id);
  assert.equal(bookmark.status, 'reading');
  assert.equal(bookmark.progress, 15);

  // Unique constraint enforcement: cannot create second bookmark for same owner & title
  await assert.rejects(
    async () => {
      await bookmarksRepository.create(TEST_OWNER_A, {
        titleId: title.id,
        status: 'completed',
        progress: 100,
      });
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes('already exists') || msg.includes('E11000') || msg.includes('duplicate key');
    }
  );

  // Direct Upsert atomically modifies existing bookmark
  const upserted = await bookmarksRepository.upsertByTitleId(TEST_OWNER_A, title.id, {
    status: 'completed',
    progress: 100,
    personalRating: 10,
  });
  assert.equal(upserted.id, bookmark.id);
  assert.equal(upserted.status, 'completed');
  assert.equal(upserted.progress, 100);
  assert.equal(upserted.personalRating, 10);
});

test('Atlas 04: Collections Creation & Case-Insensitive Unique Normalized Name', async () => {
  // Create collection with whitespace & mixed case
  const col1 = await collectionsRepository.create(TEST_OWNER_A, {
    name: '  Masterpieces Of Sci-Fi  ',
    description: 'Top sci-fi list',
  });
  assert.equal(col1.name, 'Masterpieces Of Sci-Fi');

  // Attempt duplicate normalized name under same owner
  await assert.rejects(
    async () => {
      await collectionsRepository.create(TEST_OWNER_A, {
        name: 'masterpieces of sci-fi',
      });
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes('already exists') || msg.includes('E11000');
    }
  );

  // Tenant isolation: Owner B CAN create identical collection name
  const colOwnerB = await collectionsRepository.create(TEST_OWNER_B, {
    name: 'Masterpieces Of Sci-Fi',
  });
  assert.ok(colOwnerB.id);
  assert.equal(colOwnerB.name, 'Masterpieces Of Sci-Fi');
});

test('Atlas 05: Collection Membership & Atomic Title Counts', async () => {
  const col = await collectionsRepository.create(TEST_OWNER_A, { name: 'Membership Test' });
  const t1 = await titlesRepository.create(TEST_OWNER_A, { englishTitle: 'Title One', mediaType: 'anime' });
  const t2 = await titlesRepository.create(TEST_OWNER_A, { englishTitle: 'Title Two', mediaType: 'anime' });

  // Add t1
  await collectionsRepository.addTitles(TEST_OWNER_A, col.id, [t1.id]);
  let fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);

  // Add t1 again: idempotent, count does NOT drift
  await collectionsRepository.addTitles(TEST_OWNER_A, col.id, [t1.id]);
  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);

  // Add t2: count becomes 2
  await collectionsRepository.addTitles(TEST_OWNER_A, col.id, [t2.id]);
  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 2);

  // Remove t1
  const removed1 = await collectionsRepository.removeTitle(TEST_OWNER_A, col.id, t1.id);
  assert.equal(removed1, true);
  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);

  // Remove t1 again: idempotent
  const removed1Again = await collectionsRepository.removeTitle(TEST_OWNER_A, col.id, t1.id);
  assert.equal(removed1Again, false);
  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);
});

test('Atlas 06: Concurrency Protection on Membership & Counters', async () => {
  const col = await collectionsRepository.create(TEST_OWNER_A, { name: 'Concurrency Test' });
  const t = await titlesRepository.create(TEST_OWNER_A, { englishTitle: 'Concurrent Title', mediaType: 'anime' });

  // 10 concurrent requests adding the SAME title
  await Promise.all(
    Array.from({ length: 10 }).map(() => collectionsRepository.addTitles(TEST_OWNER_A, col.id, [t.id]))
  );

  let fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);
  assert.equal(fetchedCol?.titles.length, 1);

  // 10 concurrent requests removing the SAME title
  const removeResults = await Promise.all(
    Array.from({ length: 10 }).map(() => collectionsRepository.removeTitle(TEST_OWNER_A, col.id, t.id))
  );
  const successRemoves = removeResults.filter(Boolean);
  assert.equal(successRemoves.length, 1, 'Exactly one concurrent remove must return true');

  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 0);
  assert.equal(fetchedCol?.titles.length, 0);
});

test('Atlas 07: Tenant Isolation Between Distinct Owners', async () => {
  const titleA = await titlesRepository.create(TEST_OWNER_A, { englishTitle: 'Private Title A', mediaType: 'anime' });

  // Owner B cannot view Owner A title
  const readAttempt = await titlesRepository.findById(TEST_OWNER_B, titleA.id);
  assert.equal(readAttempt, null);

  // Owner B cannot update Owner A title
  const updateAttempt = await titlesRepository.update(TEST_OWNER_B, titleA.id, { englishTitle: 'Hacked Title' });
  assert.equal(updateAttempt, null);

  // Owner B cannot delete Owner A title
  const deleteAttempt = await titlesRepository.delete(TEST_OWNER_B, titleA.id);
  assert.equal(deleteAttempt, false);

  // Owner B collection cannot attach Owner A title
  const colB = await collectionsRepository.create(TEST_OWNER_B, { name: 'Owner B Col' });
  await assert.rejects(
    async () => {
      await collectionsRepository.addTitles(TEST_OWNER_B, colB.id, [titleA.id]);
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return msg.includes('do not belong to you') || msg.includes('not found');
    }
  );
});

test('Atlas 08: Title Deletion Referential Cascade', async () => {
  const title = await titlesRepository.create(TEST_OWNER_A, { englishTitle: 'Cascade Target', mediaType: 'anime' });
  const bookmark = await bookmarksRepository.create(TEST_OWNER_A, { titleId: title.id, status: 'plan_to_read' });
  const col = await collectionsRepository.create(TEST_OWNER_A, { name: 'Cascade Col' });
  await collectionsRepository.addTitles(TEST_OWNER_A, col.id, [title.id]);

  let fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 1);

  // Delete title with cascade
  const deleted = await titlesRepository.delete(TEST_OWNER_A, title.id);
  assert.equal(deleted, true);

  // Verify title is deleted
  assert.equal(await titlesRepository.findById(TEST_OWNER_A, title.id), null);

  // Verify associated bookmark is cascaded
  assert.equal(await bookmarksRepository.findByTitleId(TEST_OWNER_A, title.id), null);

  // Verify title was removed from collection items and titleCount decremented
  fetchedCol = await collectionsRepository.findById(TEST_OWNER_A, col.id);
  assert.equal(fetchedCol?.titleCount, 0);
  assert.equal(fetchedCol?.titles.length, 0);
});

test('Atlas 09: Multi-Document ACID Transaction Commit on Replica Set', async () => {
  const db = await getDb();
  const testTitleId = randomUUID();
  const testBookmarkId = randomUUID();
  const testColId = randomUUID();

  // Execute a multi-document atomic transaction across 3 collections
  await withOptionalTransaction(async (session) => {
    assert.ok(session, 'Replica Set MUST provide an active ClientSession');

    // 1. Insert Title
    await db.collection('titles').insertOne(
      {
        _id: testTitleId,
        ownerId: TEST_OWNER_A,
        mediaType: 'anime',
        englishTitle: 'Atomic Commit Test',
        originalTitle: null,
        synopsis: null,
        background: null,
        coverUrl: null,
        coverStoragePath: null,
        coverSourceType: 'none',
        releaseYear: 2026,
        publicationStatus: null,
        startDate: null,
        endDate: null,
        episodeCount: null,
        chapterCount: null,
        sourceScore: null,
        sourceRank: null,
        sourcePopularity: null,
        aliases: [],
        genres: [],
        tags: [],
        externalSources: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session }
    );

    // 2. Insert Bookmark
    await db.collection('bookmarks').insertOne(
      {
        _id: testBookmarkId,
        ownerId: TEST_OWNER_A,
        titleId: testTitleId,
        status: 'reading',
        progress: 1,
        progressUnit: 'episode',
        progressTotal: 12,
        priority: 1,
        personalRating: null,
        notes: null,
        startedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session }
    );

    // 3. Insert Collection
    await db.collection('collections').insertOne(
      {
        _id: testColId,
        ownerId: TEST_OWNER_A,
        name: 'Atomic Col Test',
        normalizedName: 'atomic col test',
        description: null,
        coverUrl: null,
        icon: null,
        color: null,
        sortMode: 'custom',
        items: [{ titleId: testTitleId, position: 0, addedAt: new Date() }],
        titleCount: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      { session }
    );
  });

  // Verify all 3 documents persist after transaction commit
  const titleDoc = await db.collection('titles').findOne({ _id: testTitleId });
  const bookmarkDoc = await db.collection('bookmarks').findOne({ _id: testBookmarkId });
  const colDoc = await db.collection('collections').findOne({ _id: testColId });

  assert.ok(titleDoc, 'Title must exist after committed transaction');
  assert.ok(bookmarkDoc, 'Bookmark must exist after committed transaction');
  assert.ok(colDoc, 'Collection must exist after committed transaction');
});

test('Atlas 10: Mandatory ACID Transaction Rollback on Induced Mid-Transaction Failure', async () => {
  const db = await getDb();
  const testTitleId = randomUUID();
  const testBookmarkId = randomUUID();

  // Attempt multi-document transaction where Step 1 & 2 succeed, but Step 3 fails
  await assert.rejects(
    async () => {
      await withOptionalTransaction(async (session) => {
        assert.ok(session, 'Replica Set MUST provide an active ClientSession');

        // Step 1: Insert Title
        await db.collection('titles').insertOne(
          {
            _id: testTitleId,
            ownerId: TEST_OWNER_A,
            mediaType: 'anime',
            englishTitle: 'Rollback Candidate Title',
            originalTitle: null,
            synopsis: null,
            background: null,
            coverUrl: null,
            coverStoragePath: null,
            coverSourceType: 'none',
            releaseYear: 2026,
            publicationStatus: null,
            startDate: null,
            endDate: null,
            episodeCount: null,
            chapterCount: null,
            sourceScore: null,
            sourceRank: null,
            sourcePopularity: null,
            aliases: [],
            genres: [],
            tags: [],
            externalSources: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session }
        );

        // Step 2: Insert Bookmark
        await db.collection('bookmarks').insertOne(
          {
            _id: testBookmarkId,
            ownerId: TEST_OWNER_A,
            titleId: testTitleId,
            status: 'plan_to_read',
            progress: 0,
            progressUnit: 'episode',
            progressTotal: null,
            priority: null,
            personalRating: null,
            notes: null,
            startedAt: null,
            completedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          { session }
        );

        // Step 3: Deliberately induce an unhandled failure
        throw new Error('[CONTROLLED TEST FAILURE] Deliberate error to verify transaction rollback');
      });
    },
    /\[CONTROLLED TEST FAILURE\] Deliberate error to verify transaction rollback/
  );

  // CRITICAL VERIFICATION:
  // Neither the title nor the bookmark must exist in the database!
  const orphanTitle = await db.collection('titles').findOne({ _id: testTitleId });
  const orphanBookmark = await db.collection('bookmarks').findOne({ _id: testBookmarkId });

  assert.equal(
    orphanTitle,
    null,
    'ACID Rollback Failed: Title was committed despite transaction abort!'
  );
  assert.equal(
    orphanBookmark,
    null,
    'ACID Rollback Failed: Bookmark was committed despite transaction abort!'
  );
});

test('Atlas 11: Import Service Transaction Rollback on Validation Failure', async () => {
  const db = await getDb();
  const importService = new ImportService();
  const initialTitlesCount = await db.collection('titles').countDocuments({ ownerId: TEST_OWNER_A });

  // Attempt commit with invalid bookmark progress (negative progress)
  await assert.rejects(
    async () => {
      await importService.commit(
        TEST_OWNER_A,
        {
          draft: {
            externalId: 9876543,
            mediaType: 'anime',
            canonicalUrl: 'https://myanimelist.net/anime/9876543',
            sourceUrl: 'https://myanimelist.net/anime/9876543',
            englishTitle: 'Failed Import Title',
            originalTitle: null,
            synopsis: null,
            background: null,
            coverUrl: null,
            releaseYear: null,
            publicationStatus: null,
            startDate: null,
            endDate: null,
            episodeCount: 12,
            chapterCount: null,
            sourceScore: null,
            sourceRank: null,
            sourcePopularity: null,
            aliases: [],
            genres: [],
            tags: [],
            warnings: [],
          },
          selectedFields: {
            englishTitle: true,
          },
          initialBookmark: {
            status: 'reading',
            progress: -5, // Invalid: will throw ValidationError inside transaction
          },
        }
      );
    },
    /Progress cannot be negative/
  );

  // Verify that rollback occurred and NO orphaned title was inserted
  const postTitlesCount = await db.collection('titles').countDocuments({ ownerId: TEST_OWNER_A });
  assert.equal(
    postTitlesCount,
    initialTitlesCount,
    'ACID Rollback Failed: Orphaned title document remained after import commit failure!'
  );
});

test('Atlas 12: Verify No Silent Fallback to Non-Transactional Writes on Error', async () => {
  let executionCount = 0;
  await assert.rejects(
    async () => {
      await withOptionalTransaction(async (session) => {
        executionCount++;
        assert.ok(session, 'Replica set session must be present');
        throw new Error('Specific business exception during transaction');
      });
    },
    /Specific business exception during transaction/
  );

  assert.equal(
    executionCount,
    1,
    'Callback must NOT be re-executed without session when error is not code 20'
  );
});
