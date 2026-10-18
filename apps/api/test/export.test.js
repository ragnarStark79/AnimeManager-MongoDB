import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../dist/app.js';
import { createToken, TEST_OWNER_A, TEST_OWNER_B, resetMongoTestDatabase } from './helpers.js';

before(async () => {
  await resetMongoTestDatabase();
});

after(async () => {
  const { closeMongo } = await import('../dist/repositories/mongo.js');
  await closeMongo();
});

test('Export API: Reject unauthenticated export requests', async () => {
  const jsonRes = await request(app).get('/api/v1/export/json');
  assert.equal(jsonRes.status, 401);

  const csvRes = await request(app).get('/api/v1/export/csv');
  assert.equal(csvRes.status, 401);
});

test('Export API: Export full relational library as JSON for authenticated owner', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/export/json')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
  assert.ok(res.headers['content-disposition'].includes('attachment; filename="animemanager_backup_'));

  const body = res.body;
  assert.equal(body.version, '1.0.0');
  assert.equal(body.ownerId, TEST_OWNER_A);
  assert.ok(body.exportedAt);
  assert.ok(Array.isArray(body.titles));
  assert.ok(Array.isArray(body.collections));
  assert.ok(Array.isArray(body.bookmarks));

  // Should contain seed titles
  assert.ok(body.titles.length >= 3);
  const anime = body.titles.find((t) => t.englishTitle === 'Echoes of the Astral Sky');
  assert.ok(anime);
  assert.equal(anime.mediaType, 'anime');
  assert.ok(Array.isArray(anime.aliases));
  assert.ok(Array.isArray(anime.genres));

  // Should contain collections
  assert.ok(body.collections.length >= 2);
  const masterpieceCol = body.collections.find((c) => c.name === 'Masterpieces');
  assert.ok(masterpieceCol);
  assert.ok(Array.isArray(masterpieceCol.titles));
});

test('Export API: Export tabular CSV of titles with bookmark tracking and collections', async () => {
  const token = createToken(TEST_OWNER_A);
  const res = await request(app)
    .get('/api/v1/export/csv')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(res.status, 200);
  assert.ok(res.headers['content-type'].includes('text/csv'));
  assert.ok(res.headers['content-disposition'].includes('attachment; filename="animemanager_titles_'));

  const text = res.text;
  const lines = text.split('\r\n');
  assert.ok(lines.length >= 4); // Header + at least 3 seed titles

  const header = lines[0];
  assert.ok(header.includes('Title ID'));
  assert.ok(header.includes('Media Type'));
  assert.ok(header.includes('English Title'));
  assert.ok(header.includes('Bookmark Status'));
  assert.ok(header.includes('Collections'));

  assert.ok(text.includes('Echoes of the Astral Sky'));
  assert.ok(text.includes('Chronicles of the Wind Blade'));
  assert.ok(text.includes('The Heavenly Sovereign Return'));
});

test('Export API: Owner B export is strictly isolated from Owner A data', async () => {
  const tokenB = createToken(TEST_OWNER_B);
  const res = await request(app)
    .get('/api/v1/export/json')
    .set('Authorization', `Bearer ${tokenB}`);

  assert.equal(res.status, 200);
  assert.equal(res.body.ownerId, TEST_OWNER_B);
  // Owner B has zero titles in seed data
  assert.equal(res.body.titles.length, 0);
  assert.equal(res.body.collections.length, 0);
  assert.equal(res.body.bookmarks.length, 0);

  const csvRes = await request(app)
    .get('/api/v1/export/csv')
    .set('Authorization', `Bearer ${tokenB}`);

  assert.equal(csvRes.status, 200);
  const lines = csvRes.text.split('\r\n').filter(Boolean);
  // Header only, zero rows
  assert.equal(lines.length, 1);
});
