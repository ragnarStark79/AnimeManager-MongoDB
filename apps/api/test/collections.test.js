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

test('Collections API: List collections with titleCount summaries', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/collections')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length >= 3);
  assert.ok(res.body.data[0].titleCount !== undefined);
});

test('Collections API: Create a new custom collection', async () => {
  const token = createToken(TEST_OWNER_A);

  const res = await request(app)
    .post('/api/v1/collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: 'Chill & Cozy',
      description: 'Slow-paced comforting series',
      icon: 'coffee',
      color: '#10b981',
      sortMode: 'title',
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.data.name, 'Chill & Cozy');
  assert.equal(res.body.data.sortMode, 'title');
});

test('Collections API: Reject case-insensitive duplicate collection names per owner', async () => {
  const token = createToken(TEST_OWNER_A);

  // 'Masterpieces' exists in seed fixtures
  const res = await request(app)
    .post('/api/v1/collections')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: '  masterpieces  ',
    });

  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'DUPLICATE_RESOURCE');
});

test('Collections API: Add titles to collection (multi-collection membership)', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';
  const seedColAction = '20000000-0000-0000-0000-000000000003';

  // In seed data, seedTitleAnime is in Masterpieces. Let's add it to Action & Martial Arts too!
  const addRes = await request(app)
    .post(`/api/v1/collections/${seedColAction}/titles`)
    .set('Authorization', `Bearer ${token}`)
    .send({ titleIds: [seedTitleAnime] });

  assert.equal(addRes.status, 200);

  // Verify collection detail shows the title
  const getColRes = await request(app)
    .get(`/api/v1/collections/${seedColAction}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(getColRes.status, 200);
  assert.ok(getColRes.body.data.titles.some((t) => t.id === seedTitleAnime));

  // Verify the title's detail also shows both collections
  const getTitleRes = await request(app)
    .get(`/api/v1/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getTitleRes.status, 200);
  assert.ok(getTitleRes.body.data.collections.length >= 2);
});

test('Collections API: Remove title from collection preserves title and bookmark', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';
  const seedColAction = '20000000-0000-0000-0000-000000000003';

  // Remove from Action
  const removeRes = await request(app)
    .delete(`/api/v1/collections/${seedColAction}/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${token}`);

  assert.equal(removeRes.status, 204);

  // Title still exists
  const getTitleRes = await request(app)
    .get(`/api/v1/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getTitleRes.status, 200);

  // Bookmark still exists
  assert.ok(getTitleRes.body.data.bookmark);
  assert.equal(getTitleRes.body.data.bookmark.status, 'completed');
});

test('Collections API: Delete collection preserves titles and bookmarks', async () => {
  const token = createToken(TEST_OWNER_A);

  // 1. Create temporary collection
  const createColRes = await request(app)
    .post('/api/v1/collections')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Temp Col To Delete' });
  assert.equal(createColRes.status, 201);
  const colId = createColRes.body.data.id;

  // 2. Add an existing seed title to this collection
  const seedTitleManga = '10000000-0000-0000-0000-000000000002';
  await request(app)
    .post(`/api/v1/collections/${colId}/titles`)
    .set('Authorization', `Bearer ${token}`)
    .send({ titleIds: [seedTitleManga] });

  // 3. Delete the collection
  const delColRes = await request(app)
    .delete(`/api/v1/collections/${colId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(delColRes.status, 204);

  // 4. Verify title and bookmark are completely intact
  const getTitleRes = await request(app)
    .get(`/api/v1/titles/${seedTitleManga}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getTitleRes.status, 200);
  assert.ok(getTitleRes.body.data.bookmark);
});
