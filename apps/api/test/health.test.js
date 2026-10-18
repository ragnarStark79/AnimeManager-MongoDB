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

test('Health API (Remediation C): Public health responses do NOT disclose infrastructure details', async () => {
  const res = await request(app).get('/api/v1/health');
  assert.equal(res.status, 200);

  // Explicitly assert removed sensitive diagnostic fields
  assert.equal(res.body.data.databaseHost, undefined, 'databaseHost must not be present');
  assert.equal(res.body.data.databaseTarget, undefined, 'databaseTarget must not be present');
  assert.equal(res.body.data.sanitizedHost, undefined, 'sanitizedHost must not be present');
  assert.equal(res.body.data.connectionUri, undefined, 'connectionUri must not be present');

  // Verify full response payload contains zero connection strings or database names
  const rawPayload = JSON.stringify(res.body);
  assert.ok(!rawPayload.includes('mongodb://'), 'Payload must not contain mongodb://');
  assert.ok(!rawPayload.includes('mongodb+srv://'), 'Payload must not contain mongodb+srv://');
  assert.ok(!rawPayload.includes('mongodb.net'), 'Payload must not contain mongodb.net');
  assert.ok(!rawPayload.includes('127.0.0.1:27017'), 'Payload must not contain 127.0.0.1:27017');
  assert.ok(!rawPayload.includes('localhost:27017'), 'Payload must not contain localhost:27017');
  assert.ok(!rawPayload.includes('animemanager'), 'Payload must not contain database name animemanager');
});

test('Health API (Remediation C): Degraded database state returns HTTP 503 without leaking details', async () => {
  const { setMongoDbOverride } = await import('../dist/repositories/mongo.js');

  // Simulate disconnected/failing database command
  setMongoDbOverride(async () => {
    throw new Error('Connection failed: ServerSelectionTimeout [sensitive-cluster.mongodb.net:27017]');
  });

  try {
    const res = await request(app).get('/api/v1/health');
    assert.equal(res.status, 503, 'Degraded health must return HTTP 503');
    assert.equal(res.body.data.status, 'degraded');
    assert.equal(res.body.data.database, 'disconnected');
    assert.equal(res.body.data.readiness, 'unready');

    // Confirm no internal error messages or connection strings are leaked
    assert.equal(res.body.data.databaseHost, undefined);
    assert.equal(res.body.data.databaseTarget, undefined);
    const rawPayload = JSON.stringify(res.body);
    assert.ok(!rawPayload.includes('ServerSelectionTimeout'));
    assert.ok(!rawPayload.includes('sensitive-cluster'));
  } finally {
    setMongoDbOverride(null);
  }
});

