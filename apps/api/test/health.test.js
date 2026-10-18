import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { app } from '../dist/app.js';
import { resetMongoTestDatabase } from './helpers.js';

before(async () => {
  await resetMongoTestDatabase();
});

after(async () => {
  const { closeMongo } = await import('../dist/repositories/mongo.js');
  await closeMongo();
});

test('Health API: GET /api/v1/health returns system and database status', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'healthy');
  assert.equal(res.body.data.database, 'connected');
  assert.equal(res.body.data.version, '1.0.0');
  assert.ok(typeof res.body.data.uptime === 'number');
  assert.ok(res.body.meta.requestId);
  assert.ok(res.headers['x-request-id']);
});

test('Middleware: X-Request-ID header is preserved when supplied', async () => {
  const customId = 'req_custom_trace_99999';
  const res = await request(app)
    .get('/api/v1/health')
    .set('X-Request-ID', customId);

  assert.equal(res.status, 200);
  assert.equal(res.headers['x-request-id'], customId);
  assert.equal(res.body.meta.requestId, customId);
});

test('Error Handling: Unknown endpoints return consistent 404 envelope', async () => {
  const res = await request(app).get('/api/v1/unknown-endpoint');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
  assert.ok(res.body.error.message.includes('endpoint does not exist'));
  assert.ok(res.body.meta.requestId);
});
