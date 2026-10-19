import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { config } from '../dist/config/index.js';
import { createApp } from '../dist/app.js';
import { SESSION_COOKIE_NAME } from '../dist/utils/cookie.js';
import { hashPassword } from '../dist/utils/password.js';
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
const ATLAS_TEST_DB = process.env.TEST_MONGODB_DB_NAME || 'animemanager_phase16_test';
const TEST_OWNER_A = '10000000-0000-0000-0000-000000000001';
const TEST_OWNER_B = '20000000-0000-0000-0000-000000000002';

const app = createApp();

function getCookieFromResponse(res) {
  const cookies = res.headers['set-cookie'];
  const cookieHeader = Array.isArray(cookies) ? cookies.join('; ') : cookies || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
  assert.ok(match, 'Expected session cookie');
  return `${SESSION_COOKIE_NAME}=${match[1]}`;
}

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

  // Clean only synthetic test records before testing
  await db.collection('titles').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
  await db.collection('collections').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
  await db.collection('bookmarks').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
  await db.collection('users').deleteMany({ email: /@atlas-test\.animemanager\.local$/i });
  await db.collection('super_admins').deleteMany({ email: /@atlas-test\.animemanager\.local$/i });
});

after(async () => {
  try {
    const db = await getDb();
    if (db.databaseName === ATLAS_TEST_DB) {
      // Clean only synthetic test records - do NOT drop database
      await db.collection('titles').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
      await db.collection('collections').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
      await db.collection('bookmarks').deleteMany({ ownerId: { $in: [TEST_OWNER_A, TEST_OWNER_B] } });
      await db.collection('users').deleteMany({ email: /@atlas-test\.animemanager\.local$/i });
      await db.collection('super_admins').deleteMany({ email: /@atlas-test\.animemanager\.local$/i });
      await db.collection('user_sessions').deleteMany({});
      await db.collection('super_admin_sessions').deleteMany({});
      await db.collection('root_admin_sessions').deleteMany({});
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

// ══════════════════════════════════════════════════════════════════════════════
// PHASE 16: Three-Role Cloud Authentication, Isolation & Privacy Verification
// ══════════════════════════════════════════════════════════════════════════════

test('Atlas 13: Root Administrator Authentication, SHA-256 Session Storage & Session Lifecycle on Atlas', async () => {
  const db = await getDb();
  const rootEmail = 'test-root-atlas@atlas-test.animemanager.local';
  const rootPassword = 'Phase16RootPass!2026';
  const rootId = randomUUID();

  // Provision test root admin in Atlas
  const passwordHash = await hashPassword(rootPassword);
  await db.collection('root_admins').deleteMany({ email: rootEmail });
  await db.collection('root_admins').insertOne({
    _id: rootId,
    email: rootEmail,
    passwordHash,
    displayName: 'Root Administrator Atlas Test',
    role: 'root_admin',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
    lastLoginAt: null,
  });

  // Verify stored password hash uses scrypt$v1$ format
  const doc = await db.collection('root_admins').findOne({ _id: rootId });
  assert.ok(doc?.passwordHash.startsWith('scrypt$v1$'), 'Atlas root admin password must be scrypt-hashed');

  // Login failure on invalid password
  const failRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: rootEmail, password: 'WrongPassword123!' });
  assert.equal(failRes.status, 401);

  // Successful login
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: rootEmail, password: rootPassword });
  assert.equal(loginRes.status, 200);
  assert.equal(loginRes.body.data.user.role, 'root_admin');

  const cookie = getCookieFromResponse(loginRes);
  const rawToken = cookie.split('=')[1].split(';')[0];

  // Inspect Atlas root_admin_sessions: token must be SHA-256 hashed, NEVER plaintext
  const sessions = await db.collection('root_admin_sessions').find({ rootAdminId: rootId }).toArray();
  assert.ok(sessions.length >= 1, 'Expected at least one session record in Atlas');
  const foundSession = sessions.find((s) => !s.revokedAt);
  assert.ok(foundSession, 'Active session must exist in Atlas');
  assert.notEqual(foundSession.sessionTokenHash, rawToken, 'Session token must NOT be stored in plaintext');
  assert.equal(foundSession.sessionTokenHash.length, 64, 'Session token hash must be a 64-char SHA-256 hex string');

  // Verify session restoration via /api/v1/auth/me
  const meRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', cookie);
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.data.user.role, 'root_admin');
  assert.equal(meRes.body.data.user.email, rootEmail);

  // Logout invalidates session in Atlas
  const logoutRes = await request(app)
    .post('/api/v1/auth/logout')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookie);
  assert.equal(logoutRes.status, 200);

  // Subsequent request with revoked cookie returns 401
  const afterLogoutRes = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', cookie);
  assert.equal(afterLogoutRes.status, 401);
});

test('Atlas 14: Super Admin Creation, Initial Disabled Status, Activation Flow & Role Boundaries on Atlas', async () => {
  const db = await getDb();
  const rootEmail = 'test-root-atlas@atlas-test.animemanager.local';
  const rootPassword = 'Phase16RootPass!2026';
  const saEmail = 'test-sa-atlas@atlas-test.animemanager.local';
  const saPassword = 'Phase16SuperAdminPass!2026';

  // Login as Root Admin
  const rootLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: rootEmail, password: rootPassword });
  assert.equal(rootLogin.status, 200);
  const rootCookie = getCookieFromResponse(rootLogin);

  // Clean prior test superadmin if exists
  await db.collection('super_admins').deleteMany({ email: saEmail });

  // Root Admin creates Super Admin via authorized management API
  const createRes = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', rootCookie)
    .send({
      email: saEmail,
      password: saPassword,
      confirmPassword: saPassword,
      displayName: 'Cloud Super Admin Test',
    });
  assert.equal(createRes.status, 201);
  const createdSaId = createRes.body.data.id;
  assert.equal(createRes.body.data.role, 'superadmin');
  assert.equal(createRes.body.data.status, 'disabled', 'Super Admin must be disabled upon initial creation');

  // Verify in Atlas super_admins collection that status is disabled
  const saDoc = await db.collection('super_admins').findOne({ _id: createdSaId });
  assert.ok(saDoc);
  assert.equal(saDoc.status, 'disabled');
  assert.ok(saDoc.passwordHash.startsWith('scrypt$v1$'));

  // Disabled Super Admin CANNOT authenticate
  const disabledLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: saEmail, password: saPassword });
  assert.equal(disabledLoginRes.status, 401, 'Disabled Super Admin must be rejected');

  // Root Admin activates the Super Admin
  const activateRes = await request(app)
    .patch(`/api/v1/admin/super-admins/${createdSaId}/status`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', rootCookie)
    .send({ status: 'active' });
  assert.equal(activateRes.status, 200);
  assert.equal(activateRes.body.data.status, 'active');

  // Active Super Admin logs in successfully
  const saLoginRes = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: saEmail, password: saPassword });
  assert.equal(saLoginRes.status, 200);
  assert.equal(saLoginRes.body.data.user.role, 'superadmin');
  const saCookie = getCookieFromResponse(saLoginRes);

  // Super Admin reaches /api/v1/auth/me
  const saMe = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', saCookie);
  assert.equal(saMe.status, 200);
  assert.equal(saMe.body.data.user.role, 'superadmin');

  // Super Admin can access Super Admin endpoints (e.g. user activity)
  const saActivity = await request(app)
    .get('/api/v1/admin/user-activity')
    .set('Cookie', saCookie);
  assert.equal(saActivity.status, 200);

  // Super Admin CANNOT create another Super Admin (Role Boundary Guard)
  const peerCreateAttempt = await request(app)
    .post('/api/v1/admin/super-admins')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', saCookie)
    .send({
      email: 'peer-sa@atlas-test.animemanager.local',
      password: 'PeerPassword123!',
      confirmPassword: 'PeerPassword123!',
      displayName: 'Unauthorized Peer',
    });
  assert.equal(peerCreateAttempt.status, 403, 'Super Admin must NOT be allowed to create another Super Admin');
});

test('Atlas 15: Ordinary User Registration, Unique Constraints & Scrypt Password Hashing on Atlas', async () => {
  const db = await getDb();
  const userA_email = 'user-a@atlas-test.animemanager.local';
  const userA_username = 'usera_atlas';
  const userPassword = 'Phase16UserPass!2026';

  await db.collection('users').deleteMany({
    $or: [{ email: userA_email }, { username: userA_username }],
  });

  // Register User A
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: userA_email,
      username: userA_username,
      password: userPassword,
      confirmPassword: userPassword,
      displayName: 'User A Atlas',
    });
  assert.equal(regRes.status, 201);
  assert.equal(regRes.body.data.user.role, 'user');
  assert.equal(regRes.body.data.user.status, 'active');

  const userA_id = regRes.body.data.user.id;
  assert.ok(userA_id, 'User must have a unique identifier');

  // Verify document in Atlas users collection
  const userDoc = await db.collection('users').findOne({ _id: userA_id });
  assert.ok(userDoc);
  assert.equal(userDoc.email, userA_email);
  assert.equal(userDoc.username, userA_username);
  assert.ok(userDoc.passwordHash.startsWith('scrypt$v1$'));

  // Duplicate email registration rejected
  const dupEmailRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: userA_email.toUpperCase(), // case-insensitive check
      username: 'different_user',
      displayName: 'Duplicate Email User',
      password: userPassword,
      confirmPassword: userPassword,
    });
  assert.equal(dupEmailRes.status, 409, 'Duplicate email must be rejected with 409');

  // Duplicate username registration rejected
  const dupUsernameRes = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: 'different@atlas-test.animemanager.local',
      username: userA_username.toUpperCase(), // case-insensitive check
      displayName: 'Duplicate Username User',
      password: userPassword,
      confirmPassword: userPassword,
    });
  assert.equal(dupUsernameRes.status, 409, 'Duplicate username must be rejected with 409');

  // Ordinary User CANNOT access administrative APIs
  const userCookie = getCookieFromResponse(regRes);
  const adminAccess = await request(app)
    .get('/api/v1/admin/users')
    .set('Cookie', userCookie);
  assert.equal(adminAccess.status, 403, 'Ordinary user must be rejected from admin portal with 403');
});

test('Atlas 16: Multi-Tenant Personal Library Isolation on Atlas', async () => {
  const userA_email = 'user-a-lib@atlas-test.animemanager.local';
  const userB_email = 'user-b-lib@atlas-test.animemanager.local';
  const password = 'Phase16UserPass!2026';

  const db = await getDb();
  await db.collection('users').deleteMany({ email: { $in: [userA_email, userB_email] } });

  // Register User A
  const regA = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: userA_email,
      username: 'usera_lib_' + Date.now(),
      password,
      confirmPassword: password,
      displayName: 'User A',
    });
  assert.equal(regA.status, 201);
  const cookieA = getCookieFromResponse(regA);
  const userA_id = regA.body.data.user.id;

  // Register User B
  const regB = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: userB_email,
      username: 'userb_lib_' + Date.now(),
      password,
      confirmPassword: password,
      displayName: 'User B',
    });
  assert.equal(regB.status, 201);
  const cookieB = getCookieFromResponse(regB);
  const userB_id = regB.body.data.user.id;

  // 1. User A creates a title in their personal library
  const titleARes = await request(app)
    .post('/api/v1/titles')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookieA)
    .send({
      mediaType: 'anime',
      englishTitle: 'User A Private Anime',
      releaseYear: 2026,
    });
  assert.equal(titleARes.status, 201);
  const titleA_id = titleARes.body.data.id;

  // 2. User B creates a different title in their personal library
  const titleBRes = await request(app)
    .post('/api/v1/titles')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookieB)
    .send({
      mediaType: 'manga',
      englishTitle: 'User B Private Manga',
      releaseYear: 2025,
    });
  assert.equal(titleBRes.status, 201);
  const titleB_id = titleBRes.body.data.id;

  // 3. User A can retrieve User A title
  const fetchARes = await request(app)
    .get(`/api/v1/titles/${titleA_id}`)
    .set('Cookie', cookieA);
  assert.equal(fetchARes.status, 200);
  assert.equal(fetchARes.body.data.englishTitle, 'User A Private Anime');

  // 4. User B CANNOT retrieve User A title (Strict 404 Isolation)
  const crossFetchRes = await request(app)
    .get(`/api/v1/titles/${titleA_id}`)
    .set('Cookie', cookieB);
  assert.equal(crossFetchRes.status, 404, 'Cross-user read must return 404');

  // 5. User B CANNOT edit User A title
  const crossUpdateRes = await request(app)
    .put(`/api/v1/titles/${titleA_id}`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookieB)
    .send({ englishTitle: 'Hacked Title Attempt' });
  assert.equal(crossUpdateRes.status, 404, 'Cross-user update must return 404');

  // 6. User B CANNOT delete User A title
  const crossDeleteRes = await request(app)
    .delete(`/api/v1/titles/${titleA_id}?confirm=true`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookieB);
  assert.equal(crossDeleteRes.status, 404, 'Cross-user delete must return 404');

  // Verify User A title was NOT mutated or deleted in Atlas
  const verifiedDocA = await db.collection('titles').findOne({ _id: titleA_id });
  assert.ok(verifiedDocA);
  assert.equal(verifiedDocA.englishTitle, 'User A Private Anime');
  assert.equal(verifiedDocA.ownerId, userA_id);

  // 7. Client ownerId spoofing prevention:
  // User A attempts to specify User B's ownerId in request body
  const spoofRes = await request(app)
    .post('/api/v1/titles')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', cookieA)
    .send({
      mediaType: 'anime',
      englishTitle: 'Spoofed OwnerId Title',
      ownerId: userB_id, // Spoof attempt
    });
  assert.equal(spoofRes.status, 201);
  const spoofedTitleId = spoofRes.body.data.id;

  // Verify in Atlas that ownerId is User A (from session), NOT the spoofed User B id
  const spoofDoc = await db.collection('titles').findOne({ _id: spoofedTitleId });
  assert.equal(spoofDoc?.ownerId, userA_id, 'Server MUST bind to session ownerId, ignoring spoofed client ownerId');
});

test('Atlas 17: Privacy-Preserving Activity Audit Logging on Atlas', async () => {
  const db = await getDb();
  const rootEmail = 'test-root-atlas@atlas-test.animemanager.local';
  const rootPassword = 'Phase16RootPass!2026';

  // Login as Root Admin to inspect audit logs
  const rootLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: rootEmail, password: rootPassword });
  assert.equal(rootLogin.status, 200);
  const rootCookie = getCookieFromResponse(rootLogin);

  // Fetch recent audit logs from API
  const auditRes = await request(app)
    .get('/api/v1/admin/audit-logs')
    .set('Cookie', rootCookie);
  assert.equal(auditRes.status, 200);
  const auditItems = auditRes.body.data || [];
  assert.ok(auditItems.length > 0, 'Audit logs must be recorded in Atlas');

  // Verify directly from Atlas audit_logs collection
  const allLogs = await db.collection('audit_logs').find({}).toArray();
  assert.ok(allLogs.length > 0, 'Audit log collection must contain documents in Atlas');

  // PRIVACY VERIFICATION:
  // Library operations must NEVER record title name, original title, synopsis, rating, or notes
  for (const log of allLogs) {
    if (log.targetType === 'library' || log.eventType.startsWith('title.')) {
      if (log.metadata) {
        assert.equal(
          log.metadata.englishTitle,
          undefined,
          `Privacy violation: englishTitle exposed in audit log event ${log.eventType}`
        );
        assert.equal(
          log.metadata.originalTitle,
          undefined,
          `Privacy violation: originalTitle exposed in audit log event ${log.eventType}`
        );
        assert.equal(
          log.metadata.synopsis,
          undefined,
          `Privacy violation: synopsis exposed in audit log event ${log.eventType}`
        );
        assert.equal(
          log.metadata.personalRating,
          undefined,
          `Privacy violation: personalRating exposed in audit log event ${log.eventType}`
        );
      }
    }

    // Auth events must NEVER contain passwords, hashes, or session tokens
    if (log.eventType.startsWith('auth.')) {
      if (log.metadata) {
        assert.equal(log.metadata.password, undefined, 'Privacy violation: password exposed in audit metadata');
        assert.equal(log.metadata.passwordHash, undefined, 'Privacy violation: passwordHash exposed in audit metadata');
        assert.equal(log.metadata.sessionToken, undefined, 'Privacy violation: sessionToken exposed in audit metadata');
      }
    }
  }
});

test('Atlas 18: Account Disablement Invalidates Existing Sessions on Atlas', async () => {
  const db = await getDb();
  const rootEmail = 'test-root-atlas@atlas-test.animemanager.local';
  const rootPassword = 'Phase16RootPass!2026';
  const victimEmail = 'victim-user@atlas-test.animemanager.local';
  const victimPass = 'Phase16VictimPass!2026';

  await db.collection('users').deleteMany({ email: victimEmail });

  // 1. Register victim user
  const reg = await request(app)
    .post('/api/v1/auth/register')
    .set('Origin', 'http://localhost:5173')
    .send({
      email: victimEmail,
      username: 'victim_atlas_' + Date.now(),
      displayName: 'Victim User',
      password: victimPass,
      confirmPassword: victimPass,
    });
  assert.equal(reg.status, 201);
  const victimCookie = getCookieFromResponse(reg);
  const victimId = reg.body.data.user.id;

  // Verify victim session works
  const meBefore = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', victimCookie);
  assert.equal(meBefore.status, 200);

  // 2. Root Admin logs in and disables the victim user
  const rootLogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: rootEmail, password: rootPassword });
  assert.equal(rootLogin.status, 200);
  const rootCookie = getCookieFromResponse(rootLogin);

  const disableRes = await request(app)
    .patch(`/api/v1/admin/users/${victimId}/status`)
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', rootCookie)
    .send({ status: 'disabled' });
  assert.equal(disableRes.status, 200);

  // 3. Victim user attempts to use existing cookie -> MUST be rejected (401 or 403)
  const meAfter = await request(app)
    .get('/api/v1/auth/me')
    .set('Cookie', victimCookie);
  assert.ok(
    meAfter.status === 401 || meAfter.status === 403,
    `Disabled user session must be rejected, got HTTP ${meAfter.status}`
  );

  // 4. Victim user attempts to log in again -> Rejected with 401 or 403 Account is disabled
  const relogin = await request(app)
    .post('/api/v1/auth/login')
    .set('Origin', 'http://localhost:5173')
    .send({ email: victimEmail, password: victimPass });
  assert.ok(relogin.status === 401 || relogin.status === 403, 'Disabled user login must return 401 or 403');
});
