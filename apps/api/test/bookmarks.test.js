import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../dist/app.js';
import { createToken, TEST_OWNER_A, resetMongoTestDatabase } from './helpers.js';

before(async () => {
  await resetMongoTestDatabase();
});

after(async () => {
  const { closeMongo } = await import('../dist/repositories/mongo.js');
  await closeMongo();
});

test('Bookmarks API: List bookmarks with status filters', async () => {
  const token = createToken(TEST_OWNER_A);

  const resAll = await request(app)
    .get('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resAll.status, 200);
  assert.ok(Array.isArray(resAll.body.data));
  assert.ok(resAll.body.data.length >= 3);

  const resCompleted = await request(app)
    .get('/api/v1/bookmarks?status=completed')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resCompleted.status, 200);
  assert.ok(resCompleted.body.data.every((b) => b.status === 'completed'));
});

test('Bookmarks API: Create a bookmark for a title without one', async () => {
  const token = createToken(TEST_OWNER_A);

  // 1. Create a title without a bookmark
  const titleRes = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'anime',
      englishTitle: 'Untracked Anime Show',
      episodeCount: 24,
    });
  assert.equal(titleRes.status, 201);
  const titleId = titleRes.body.data.id;

  // 2. Create bookmark
  const bookmarkRes = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId,
      status: 'consuming',
      progress: 5,
      progressTotal: 24,
      personalRating: 8.5,
      priority: 4,
      notes: 'Strong first arc.',
    });

  assert.equal(bookmarkRes.status, 201);
  assert.equal(bookmarkRes.body.data.status, 'consuming');
  assert.equal(bookmarkRes.body.data.progress, 5);
  assert.equal(bookmarkRes.body.data.personalRating, 8.5);
});

test('Bookmarks API: Reject duplicate bookmark creation for same title', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';

  // Seed data already has a bookmark for this title
  const res = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId: seedTitleAnime,
      status: 'plan_to_consume',
    });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'CONFLICT');
});

test('Bookmarks API: Reject negative progress and invalid rating', async () => {
  const token = createToken(TEST_OWNER_A);
  const fakeUuid = '550e8400-e29b-41d4-a716-446655440000';

  // Negative progress
  const resNegative = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId: fakeUuid,
      status: 'consuming',
      progress: -2,
    });
  assert.equal(resNegative.status, 422);

  // Rating > 10
  const resRatingHigh = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId: fakeUuid,
      status: 'completed',
      personalRating: 10.5,
    });
  assert.equal(resRatingHigh.status, 422);
});

test('Bookmarks API: Reject progress exceeding progressTotal', async () => {
  const token = createToken(TEST_OWNER_A);

  const titleRes = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'anime',
      englishTitle: 'Short 12 Ep Anime',
      episodeCount: 12,
    });
  assert.equal(titleRes.status, 201);
  const titleId = titleRes.body.data.id;

  const resOverProgress = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId,
      status: 'consuming',
      progress: 15,
      progressTotal: 12,
    });

  assert.equal(resOverProgress.status, 400);
  assert.ok(resOverProgress.body.error.message.includes('cannot exceed total'));
});

test('Bookmarks API: Update bookmark progress and rating', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleManga = '10000000-0000-0000-0000-000000000002';

  // Find bookmark ID
  const titleRes = await request(app)
    .get(`/api/v1/titles/${seedTitleManga}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(titleRes.status, 200);
  const bookmarkId = titleRes.body.data.bookmark.id;

  const patchRes = await request(app)
    .patch(`/api/v1/bookmarks/${bookmarkId}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      progress: 50,
      personalRating: 9.0,
      notes: 'Peak chapter 50.',
    });

  assert.equal(patchRes.status, 200);
  assert.equal(patchRes.body.data.progress, 50);
  assert.equal(patchRes.body.data.personalRating, 9.0);
  assert.equal(patchRes.body.data.notes, 'Peak chapter 50.');
});

test('Bookmarks API: Upsert bookmark via PUT /titles/:id/bookmark', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleManhwa = '10000000-0000-0000-0000-000000000003';

  const upsertRes = await request(app)
    .put(`/api/v1/titles/${seedTitleManhwa}/bookmark`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      status: 'consuming',
      progress: 25,
      progressUnit: 'chapter',
      progressTotal: 110,
      personalRating: 9.2,
      notes: 'Terrific action sequences.',
    });

  assert.equal(upsertRes.status, 200);
  assert.equal(upsertRes.body.data.status, 'consuming');
  assert.equal(upsertRes.body.data.progress, 25);
  assert.equal(upsertRes.body.data.personalRating, 9.2);
});

test('Bookmarks API: Delete bookmark preserves the title', async () => {
  const token = createToken(TEST_OWNER_A);

  // 1. Create a title and bookmark
  const titleRes = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'manga',
      englishTitle: 'Title With Bookmark To Delete',
    });
  assert.equal(titleRes.status, 201);
  const titleId = titleRes.body.data.id;

  const bookmarkRes = await request(app)
    .post('/api/v1/bookmarks')
    .set('Authorization', `Bearer ${token}`)
    .send({
      titleId,
      status: 'plan_to_consume',
    });
  assert.equal(bookmarkRes.status, 201);
  const bookmarkId = bookmarkRes.body.data.id;

  // 2. Delete the bookmark
  const delRes = await request(app)
    .delete(`/api/v1/bookmarks/${bookmarkId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(delRes.status, 204);

  // 3. Verify title still exists
  const getTitleRes = await request(app)
    .get(`/api/v1/titles/${titleId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getTitleRes.status, 200);
  assert.equal(getTitleRes.body.data.bookmark, null);
});
