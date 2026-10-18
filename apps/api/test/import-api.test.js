import test, { before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../dist/app.js';
import { jikanClient } from '../dist/services/import/jikan.client.js';
import { createToken, TEST_OWNER_A, TEST_OWNER_B, resetMongoTestDatabase } from './helpers.js';
import { getTitlesCollection, getCollectionsCollection, closeMongo } from '../dist/repositories/mongo.js';

before(async () => {
  await resetMongoTestDatabase();
});

after(async () => {
  await closeMongo();
});

afterEach(() => {
  jikanClient.resetFetchFn();
  jikanClient.clearCache();
});

test('Import API Security: Reject unauthenticated requests to import endpoints', async () => {
  const r1 = await request(app).get('/api/v1/import/jikan/search?q=naruto&type=anime');
  assert.equal(r1.status, 401);
  assert.equal(r1.body.error.code, 'UNAUTHORIZED');

  const r2 = await request(app).get('/api/v1/import/preview?id=5114&type=anime');
  assert.equal(r2.status, 401);

  const r3 = await request(app).post('/api/v1/import/commit').send({});
  assert.equal(r3.status, 401);
});

test('Import Search API: Valid query returns normalized results without reviews', async () => {
  const token = createToken(TEST_OWNER_A);

  jikanClient.setFetchFn(async () =>
    new Response(
      JSON.stringify({
        data: [
          {
            mal_id: 11061,
            title: 'Hunter x Hunter (2011)',
            title_english: 'Hunter x Hunter',
            type: 'TV',
            score: 9.04,
            rank: 10,
            status: 'Finished Airing',
            synopsis: 'Hunters dedicate themselves to tracking down secret treasures...',
            year: 2011,
          },
        ],
        pagination: { has_next_page: false },
      }),
      { status: 200 }
    )
  );

  const res = await request(app)
    .get('/api/v1/import/jikan/search?q=Hunter&type=anime&page=1&limit=5')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.data.length, 1);
  assert.equal(res.body.data[0].malId, 11061);
  assert.equal(res.body.data[0].englishTitle, 'Hunter x Hunter');
  assert.equal(res.body.data[0].mediaType, 'anime');
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.hasNextPage, false);
});

test('Import Search API: Rejects invalid parameters with 422 validation envelope', async () => {
  const token = createToken(TEST_OWNER_A);

  // Missing query and type
  const res = await request(app)
    .get('/api/v1/import/jikan/search')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('Import Preview API: Preview via URL and ID+type does NOT mutate database', async () => {
  const token = createToken(TEST_OWNER_A);

  jikanClient.setFetchFn(async () =>
    new Response(
      JSON.stringify({
        data: {
          mal_id: 5114,
          title: 'Fullmetal Alchemist: Brotherhood',
          title_english: 'Fullmetal Alchemist: Brotherhood',
          title_japanese: '鋼の錬金術師 FULLMETAL ALCHEMIST',
          type: 'TV',
          episodes: 64,
          score: 9.1,
          synopsis: 'Two brothers search for the philosopher stone...',
        },
      }),
      { status: 200 }
    )
  );

  // Check initial title count
  const titlesCol = await getTitlesCollection();
  const initialCount = await titlesCol.countDocuments({});

  // 1. Preview by URL
  const r1 = await request(app)
    .get('/api/v1/import/preview?url=https://myanimelist.net/anime/5114/Fullmetal_Alchemist')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(r1.status, 200);
  assert.equal(r1.body.data.externalId, '5114');
  assert.equal(r1.body.data.englishTitle, 'Fullmetal Alchemist: Brotherhood');
  assert.equal(r1.body.data.duplicateExistingTitleId, null);

  // 2. Preview by ID and Type
  const r2 = await request(app)
    .get('/api/v1/import/preview?id=5114&type=anime')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(r2.status, 200);
  assert.equal(r2.body.data.externalId, '5114');

  // Verify that count has not changed!
  const finalCount = await titlesCol.countDocuments({});
  assert.equal(finalCount, initialCount, 'Preview must never mutate database');
});

test('Import Preview API: Rejects adversarial SSRF URLs and conflicting parameters', async () => {
  const token = createToken(TEST_OWNER_A);

  // 1. SSRF URL attempt
  const r1 = await request(app)
    .get('/api/v1/import/preview?url=https://169.254.169.254/anime/5114')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(r1.status, 400);
  assert.equal(r1.body.error.code, 'BAD_REQUEST');

  // 2. Conflicting URL and requested type
  const r2 = await request(app)
    .get('/api/v1/import/preview?url=https://myanimelist.net/anime/5114&type=manga')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(r2.status, 400);
  assert.ok(r2.body.error.message.includes('conflicts'));
});

test('Import Preview API: Duplicate detection identifies existing local title', async () => {
  const token = createToken(TEST_OWNER_A);

  // In seed.sql, Astral Sky has external_sources record (myanimelist, '99001')
  jikanClient.setFetchFn(async () =>
    new Response(
      JSON.stringify({
        data: {
          mal_id: 99001,
          title: 'Echoes of the Astral Sky',
          title_english: 'Echoes of the Astral Sky',
          type: 'TV',
          score: 8.45,
        },
      }),
      { status: 200 }
    )
  );

  const res = await request(app)
    .get('/api/v1/import/preview?id=99001&type=anime')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(res.body.data.duplicateExistingTitleId);
  assert.equal(res.body.data.duplicateExistingTitleName, 'Echoes of the Astral Sky');
  assert.ok(res.body.data.warnings.some((w) => w.includes('already been imported')));
});

test('Import Commit API: Atomically creates title, external source, bookmark, and collections', async () => {
  const token = createToken(TEST_OWNER_A);

  // Get one of Owner A's collections from seed
  const collectionsCol = await getCollectionsCollection();
  const colDoc = await collectionsCol.findOne({ ownerId: TEST_OWNER_A });
  const collectionId = colDoc._id;

  const commitPayload = {
    draft: {
      provider: 'myanimelist',
      externalId: '80001',
      sourceUrl: 'https://myanimelist.net/anime/80001',
      mediaType: 'anime',
      englishTitle: 'Steins;Gate: Test Import',
      originalTitle: 'シュタインズ・ゲート',
      aliases: [{ title: 'Steins Gate', languageCode: 'en', aliasType: 'translated' }],
      synopsis: 'A self-proclaimed mad scientist discovers time travel.',
      background: 'Critically acclaimed visual novel adaptation.',
      coverUrl: 'https://example.com/steinsgate.jpg',
      releaseYear: 2011,
      publicationStatus: 'Finished Airing',
      startDate: '2011-04-06',
      endDate: '2011-09-14',
      episodeCount: 24,
      sourceScore: 9.07,
      genres: ['Sci-Fi', 'Suspense'],
      tags: ['Time Travel', 'Conspiracy'],
      sourceRetrievedAt: new Date().toISOString(),
      warnings: [],
    },
    selectedFields: {
      englishTitle: true,
      originalTitle: true,
      aliases: true,
      synopsis: true,
      background: false, // Intentionally unselected!
      coverUrl: true,
      releaseYear: true,
      publicationStatus: true,
      startDate: true,
      endDate: true,
      episodeCount: true,
      sourceScore: true,
      genres: true,
      tags: true,
    },
    initialBookmark: {
      status: 'consuming',
      progress: 12,
      progressUnit: 'episode',
      progressTotal: 24,
      personalRating: 9.5,
      notes: 'Episode 12 cliffhanger was mindblowing.',
    },
    collectionIds: [collectionId],
  };

  const res = await request(app)
    .post('/api/v1/import/commit')
    .set('Authorization', `Bearer ${token}`)
    .send(commitPayload);

  assert.equal(res.status, 201);
  const title = res.body.data;
  assert.ok(title.id);
  assert.equal(title.englishTitle, 'Steins;Gate: Test Import');
  assert.equal(title.originalTitle, 'シュタインズ・ゲート');
  assert.equal(title.background, null, 'Unselected background field must not be saved');
  assert.equal(title.episodeCount, 24);
  assert.equal(title.coverUrl, 'https://example.com/steinsgate.jpg');

  // Verify external sources mapping persisted
  assert.ok(Array.isArray(title.externalSources));
  assert.equal(title.externalSources.length, 1);
  assert.equal(title.externalSources[0].externalId, '80001');

  // Verify initial bookmark persisted
  assert.ok(title.bookmark);
  assert.equal(title.bookmark.status, 'consuming');
  assert.equal(title.bookmark.progress, 12);
  assert.equal(title.bookmark.personalRating, 9.5);

  // Verify collection membership persisted
  assert.ok(Array.isArray(title.collections));
  assert.equal(title.collections.length, 1);
  assert.equal(title.collections[0].id, collectionId);
});

test('Import Commit API: Rejects duplicate import attempts with 409 DUPLICATE_IMPORT', async () => {
  const token = createToken(TEST_OWNER_A);

  const duplicatePayload = {
    draft: {
      provider: 'myanimelist',
      externalId: '80001', // Already created in previous test!
      sourceUrl: 'https://myanimelist.net/anime/80001',
      mediaType: 'anime',
      englishTitle: 'Steins;Gate: Duplicate Attempt',
      sourceRetrievedAt: new Date().toISOString(),
      warnings: [],
    },
    selectedFields: { englishTitle: true },
  };

  const res = await request(app)
    .post('/api/v1/import/commit')
    .set('Authorization', `Bearer ${token}`)
    .send(duplicatePayload);

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DUPLICATE_IMPORT');
  assert.ok(res.body.error.message.includes('already been imported'));
});

test('Import Commit API: Transaction rollback on failure leaves zero orphaned title records', async () => {
  const token = createToken(TEST_OWNER_A);

  // Ensure Owner B has a collection
  const collectionsCol = await getCollectionsCollection();
  let ownerBCol = await collectionsCol.findOne({ ownerId: TEST_OWNER_B });
  let ownerBCollectionId;
  if (ownerBCol) {
    ownerBCollectionId = ownerBCol._id;
  } else {
    const { randomUUID } = await import('node:crypto');
    const newColId = randomUUID();
    await collectionsCol.insertOne({
      _id: newColId,
      ownerId: TEST_OWNER_B,
      name: 'Owner B Private List',
      normalizedName: 'owner b private list',
      items: [],
      titleCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    ownerBCollectionId = newColId;
  }

  const titlesCol = await getTitlesCollection();
  const countBefore = await titlesCol.countDocuments({ ownerId: TEST_OWNER_A });

  const illegalPayload = {
    draft: {
      provider: 'myanimelist',
      externalId: '88888',
      sourceUrl: 'https://myanimelist.net/anime/88888',
      mediaType: 'anime',
      englishTitle: 'Rollback Test Title',
      sourceRetrievedAt: new Date().toISOString(),
      warnings: [],
    },
    selectedFields: { englishTitle: true },
    // Attaching Owner B collection should fail with 403 Forbidden!
    collectionIds: [ownerBCollectionId],
  };

  const res = await request(app)
    .post('/api/v1/import/commit')
    .set('Authorization', `Bearer ${token}`)
    .send(illegalPayload);

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'FORBIDDEN');

  // Verify title count has NOT increased (transaction cleanly rolled back)
  const countAfter = await titlesCol.countDocuments({ ownerId: TEST_OWNER_A });
  assert.equal(countAfter, countBefore, 'Failed import commit must roll back completely');
});

test('Resilience: Manual title creation remains fully operational when Jikan is unavailable', async () => {
  const token = createToken(TEST_OWNER_A);

  // Mock Jikan as completely down / throwing 503
  jikanClient.setFetchFn(async () => new Response('Jikan Down', { status: 503 }));

  // Preview should fail safely
  const previewRes = await request(app)
    .get('/api/v1/import/preview?id=123&type=anime')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(previewRes.status, 502);
  assert.equal(previewRes.body.error.code, 'EXTERNAL_PROVIDER_UNAVAILABLE');

  // But manual title creation POST /api/v1/titles MUST STILL SUCCEED!
  const manualRes = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'anime',
      englishTitle: 'Completely Offline Manual Anime',
      synopsis: 'Created while Jikan was down.',
    });

  assert.equal(manualRes.status, 201);
  assert.equal(manualRes.body.data.englishTitle, 'Completely Offline Manual Anime');
});

test('Import Search API: Upstream timeout returns 504 EXTERNAL_PROVIDER_TIMEOUT with UPSTREAM_TIMEOUT category', async () => {
  const token = createToken(TEST_OWNER_A);

  jikanClient.setFetchFn(async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'UND_ERR_CONNECT_TIMEOUT', message: 'Connect Timeout Error' };
    throw err;
  });

  const res = await request(app)
    .get('/api/v1/import/jikan/search?q=frieren&type=anime')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 504);
  assert.equal(res.body.error.code, 'EXTERNAL_PROVIDER_TIMEOUT');
  assert.ok(res.body.error.details.some((d) => d.category === 'UPSTREAM_TIMEOUT'));
  assert.ok(!res.body.error.message.includes('fetch failed'));
});

test('Import Search API: Upstream DNS failure returns 502 with UPSTREAM_DNS_ERROR category', async () => {
  const token = createToken(TEST_OWNER_A);

  jikanClient.setFetchFn(async () => {
    const err = new TypeError('fetch failed');
    err.cause = { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND' };
    throw err;
  });

  const res = await request(app)
    .get('/api/v1/import/jikan/search?q=frieren&type=anime')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 502);
  assert.equal(res.body.error.code, 'EXTERNAL_PROVIDER_UNAVAILABLE');
  assert.ok(res.body.error.details.some((d) => d.category === 'UPSTREAM_DNS_ERROR'));
});

test('Import Search API: Empty candidate result returns 200 with empty array rather than error', async () => {
  const token = createToken(TEST_OWNER_A);

  jikanClient.setFetchFn(async () =>
    new Response(JSON.stringify({ data: [], pagination: { has_next_page: false } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );

  const res = await request(app)
    .get('/api/v1/import/jikan/search?q=NonExistentTitle123456&type=anime')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
  assert.equal(res.body.pagination.hasNextPage, false);
});
