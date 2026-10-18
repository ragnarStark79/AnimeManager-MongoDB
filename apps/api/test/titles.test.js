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

test('Titles API: List seed titles with pagination and metadata', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/titles?page=1&pageSize=10')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data));
  assert.equal(res.body.pagination.page, 1);
  assert.equal(res.body.pagination.pageSize, 10);
  assert.ok(res.body.pagination.total >= 3);
});

test('Titles API: Search across english_title, original_title, and aliases', async () => {
  const token = createToken(TEST_OWNER_A);

  // Search by english title
  const resEnglish = await request(app)
    .get('/api/v1/titles?search=Astral')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resEnglish.status, 200);
  assert.ok(resEnglish.body.data.some((t) => t.englishTitle.includes('Astral')));

  // Search by original title
  const resOriginal = await request(app)
    .get('/api/v1/titles?search=星空')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resOriginal.status, 200);
  assert.ok(resOriginal.body.data.some((t) => t.originalTitle && t.originalTitle.includes('星空')));

  // Search by alias (from title_aliases table)
  const resAlias = await request(app)
    .get('/api/v1/titles?search=Hoshizora')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resAlias.status, 200);
  assert.ok(resAlias.body.data.some((t) => t.englishTitle.includes('Echoes of the Astral Sky')));
});

test('Titles API: Filter by mediaType', async () => {
  const token = createToken(TEST_OWNER_A);

  const resAnime = await request(app)
    .get('/api/v1/titles?mediaType=anime')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resAnime.status, 200);
  assert.ok(resAnime.body.data.every((t) => t.mediaType === 'anime'));

  const resManhwa = await request(app)
    .get('/api/v1/titles?mediaType=manhwa')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resManhwa.status, 200);
  assert.ok(resManhwa.body.data.every((t) => t.mediaType === 'manhwa'));
});

test('Titles API: Sorting support by title and releaseYear', async () => {
  const token = createToken(TEST_OWNER_A);

  const resAsc = await request(app)
    .get('/api/v1/titles?sortBy=title&sortOrder=asc')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resAsc.status, 200);
  assert.ok(resAsc.body.data.length >= 2);

  const firstTitle = resAsc.body.data[0].englishTitle;
  const secondTitle = resAsc.body.data[1].englishTitle;
  assert.ok(firstTitle.localeCompare(secondTitle) <= 0);
});

test('Titles API: Create a manual title with aliases, genres, and tags', async () => {
  const token = createToken(TEST_OWNER_A);

  const payload = {
    mediaType: 'manga',
    englishTitle: 'The Horizon Edge',
    originalTitle: '地平線の果て',
    aliases: [
      { title: 'Beyond Horizon', languageCode: 'en', aliasType: 'translated' }
    ],
    synopsis: 'A gripping survival story.',
    releaseYear: 2022,
    chapterCount: 48,
    genres: ['Adventure', 'Drama'],
    tags: ['Survival', 'Mystery'],
  };

  const res = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send(payload);

  assert.equal(res.status, 201);
  assert.equal(res.body.data.englishTitle, 'The Horizon Edge');
  assert.equal(res.body.data.mediaType, 'manga');
  assert.equal(res.body.data.aliases.length, 1);
  assert.equal(res.body.data.genres.length, 2);
  assert.equal(res.body.data.tags.length, 2);

  const newTitleId = res.body.data.id;

  // Retrieve by ID
  const getRes = await request(app)
    .get(`/api/v1/titles/${newTitleId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.data.englishTitle, 'The Horizon Edge');
});

test('Titles API: Reject creation with invalid media type or missing required fields', async () => {
  const token = createToken(TEST_OWNER_A);

  // Invalid media type
  const resBadType = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'novel',
      englishTitle: 'A Good Book',
    });
  assert.equal(resBadType.status, 422);
  assert.equal(resBadType.body.error.code, 'VALIDATION_ERROR');

  // Blank english title
  const resBlank = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'anime',
      englishTitle: '   ',
    });
  assert.equal(resBlank.status, 422);
});

test('Titles API: Update existing title', async () => {
  const token = createToken(TEST_OWNER_A);
  const seedTitleAnime = '10000000-0000-0000-0000-000000000001';

  const res = await request(app)
    .patch(`/api/v1/titles/${seedTitleAnime}`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      synopsis: 'Updated synopsis with richer details.',
      releaseYear: 2024,
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.synopsis, 'Updated synopsis with richer details.');
});

test('Titles API: Delete title requires explicit confirmation', async () => {
  const token = createToken(TEST_OWNER_A);

  // 1. Create a transient title
  const createRes = await request(app)
    .post('/api/v1/titles')
    .set('Authorization', `Bearer ${token}`)
    .send({
      mediaType: 'anime',
      englishTitle: 'Transient To Be Deleted',
    });
  assert.equal(createRes.status, 201);
  const titleId = createRes.body.data.id;

  // 2. Attempt deletion without ?confirm=true
  const resNoConfirm = await request(app)
    .delete(`/api/v1/titles/${titleId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resNoConfirm.status, 400);
  assert.ok(resNoConfirm.body.error.message.includes('explicit confirmation'));

  // 3. Delete with ?confirm=true
  const resConfirm = await request(app)
    .delete(`/api/v1/titles/${titleId}?confirm=true`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(resConfirm.status, 204);

  // 4. Verify title no longer exists
  const getRes = await request(app)
    .get(`/api/v1/titles/${titleId}`)
    .set('Authorization', `Bearer ${token}`);
  assert.equal(getRes.status, 404);
});
