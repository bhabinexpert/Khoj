'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { Job } = require('../../src/models/Job');
const { setupTestDb, teardownTestDb, clearCollections, makeJob } = require('../helpers/db');

const app = createApp();

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(clearCollections);

const ingest = (jobs) => request(app).post('/api/jobs/ingest').send({ jobs });

describe('GET /health', () => {
  it('reports the service and db state', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'khoj-backend', db: 'connected' });
  });
});

describe('POST /api/jobs/ingest', () => {
  it('inserts new postings', async () => {
    const res = await ingest([makeJob(), makeJob()]).expect(200);
    expect(res.body).toMatchObject({ received: 2, inserted: 2, updated: 0, skipped: 0 });
    expect(await Job.countDocuments()).toBe(2);
  });

  it('accepts a bare array body too', async () => {
    await request(app).post('/api/jobs/ingest').send([makeJob()]).expect(200);
    expect(await Job.countDocuments()).toBe(1);
  });

  it('is idempotent — re-ingesting the same posting updates instead of duplicating', async () => {
    const job = makeJob();
    await ingest([job]).expect(200);
    const res = await ingest([job]).expect(200);

    expect(res.body).toMatchObject({ inserted: 0, updated: 1 });
    expect(await Job.countDocuments()).toBe(1);
  });

  it('collapses duplicates inside a single payload', async () => {
    const shared = { title: 'DevOps Engineer', company: 'CloudFactory', description: 'Run our Kubernetes clusters.' };
    const res = await ingest([
      makeJob({ ...shared, sourcePlatform: 'merojob', sourceUrl: 'https://merojob.com/devops/' }),
      makeJob({ ...shared, sourcePlatform: 'jobaxle', sourceUrl: 'https://jobaxle.com/jobs/devops' }),
    ]).expect(200);

    expect(res.body).toMatchObject({ received: 2, inserted: 1, merged: 1 });

    const stored = await Job.findOne({ title: 'DevOps Engineer' }).lean();
    expect(stored.sources.map((s) => s.platform).sort()).toEqual(['jobaxle', 'merojob']);
  });

  it('merges a cross-platform duplicate into an existing stored job', async () => {
    const shared = { title: 'QA Engineer', company: 'Fusemachines', description: 'Own our automated test suite.' };
    await ingest([makeJob({ ...shared, sourcePlatform: 'merojob', sourceUrl: 'https://merojob.com/qa/' })]);

    const res = await ingest([
      makeJob({ ...shared, sourcePlatform: 'jobaxle', sourceUrl: 'https://jobaxle.com/jobs/qa' }),
    ]).expect(200);

    expect(res.body).toMatchObject({ inserted: 0, updated: 1, merged: 1 });
    expect(await Job.countDocuments()).toBe(1);

    const detail = await request(app).get(`/api/jobs?q=${encodeURIComponent('QA Engineer')}`).expect(200);
    expect(detail.body.data[0].allSources).toHaveLength(2);
  });

  it('skips malformed postings but keeps the good ones', async () => {
    const res = await ingest([makeJob(), { title: 'No url' }, null]).expect(200);
    expect(res.body).toMatchObject({ received: 3, inserted: 1, skipped: 2 });
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('rejects a body that is not a job array', async () => {
    await request(app).post('/api/jobs/ingest').send({ nope: true }).expect(400);
  });

  it('rejects oversized batches', async () => {
    const res = await ingest(Array.from({ length: 501 }, () => makeJob())).expect(400);
    expect(res.body.message).toMatch(/at most 500/);
  });

  it('accepts an empty batch as a no-op', async () => {
    const res = await ingest([]).expect(200);
    expect(res.body.received).toBe(0);
  });
});
