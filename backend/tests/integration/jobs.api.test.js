'use strict';

const request = require('supertest');
const { createApp } = require('../../src/app');
const { setupTestDb, teardownTestDb, clearCollections, makeJob } = require('../helpers/db');

const app = createApp();

const seed = () =>
  request(app)
    .post('/api/jobs/ingest')
    .send({
      jobs: [
        makeJob({
          title: 'React Frontend Developer',
          company: 'Leapfrog Technology',
          description: 'Build modern interfaces with React and Tailwind CSS for global clients.',
          requiredSkills: ['React', 'Tailwind CSS'],
          jobType: 'full-time',
          experienceLevel: 'mid',
          location: 'Lalitpur',
          sourcePlatform: 'merojob',
          sourceUrl: 'https://merojob.com/react-frontend-developer/',
          postedDate: '2026-08-20T00:00:00.000Z',
        }),
        makeJob({
          title: 'Data Science Intern',
          company: 'Fusemachines',
          description: 'Assist the ML team with Python data pipelines and model evaluation.',
          requiredSkills: ['Python', 'Pandas'],
          jobType: 'internship',
          experienceLevel: 'entry',
          location: 'Kathmandu',
          sourcePlatform: 'jobaxle',
          sourceUrl: 'https://jobaxle.com/jobs/data-science-intern',
          postedDate: '2026-08-25T00:00:00.000Z',
          salary: null,
        }),
        makeJob({
          title: 'Remote DevOps Engineer',
          company: 'CloudFactory',
          description: 'Operate Kubernetes clusters and CI/CD pipelines across AWS.',
          requiredSkills: ['Kubernetes', 'AWS'],
          jobType: 'remote',
          experienceLevel: 'senior',
          location: 'Remote',
          sourcePlatform: 'merojob',
          sourceUrl: 'https://merojob.com/remote-devops-engineer/',
          postedDate: '2026-08-28T00:00:00.000Z',
          deadline: '2020-01-01T00:00:00.000Z', // long expired
        }),
      ],
    })
    .expect(200);

beforeAll(setupTestDb);
afterAll(teardownTestDb);
beforeEach(async () => {
  await clearCollections();
  await seed();
});

describe('GET /api/jobs', () => {
  it('returns newest-first with pagination metadata', async () => {
    const res = await request(app).get('/api/jobs').expect(200);

    // The DevOps posting is newest but long-expired, so it is hidden.
    expect(res.body.data.map((j) => j.title)).toEqual(['Data Science Intern', 'React Frontend Developer']);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1, hasNextPage: false });
  });

  it('exposes id, allSources and isExpired on every card', async () => {
    const [job] = (await request(app).get('/api/jobs').expect(200)).body.data;
    expect(job.id).toMatch(/^[0-9a-f]{24}$/);
    expect(job._id).toBeUndefined();
    expect(job.allSources[0]).toHaveProperty('url');
    expect(job.isExpired).toBe(false);
  });

  it('includes expired postings on request', async () => {
    const res = await request(app).get('/api/jobs?includeExpired=true').expect(200);
    expect(res.body.pagination.total).toBe(3);
    expect(res.body.data.find((j) => j.title === 'Remote DevOps Engineer').isExpired).toBe(true);
  });

  it('searches by keyword across title and description', async () => {
    const res = await request(app).get('/api/jobs?q=react').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].title).toBe('React Frontend Developer');
  });

  it('finds jobs by a keyword that only appears in the description', async () => {
    const res = await request(app).get('/api/jobs?q=pipelines&includeExpired=true').expect(200);
    expect(res.body.data.map((j) => j.title)).toContain('Remote DevOps Engineer');
  });

  it('filters by jobType, experienceLevel and source', async () => {
    expect((await request(app).get('/api/jobs?jobType=internship')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/jobs?experienceLevel=mid')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/jobs?source=jobaxle')).body.data).toHaveLength(1);
    expect((await request(app).get('/api/jobs?source=merojob&includeExpired=true')).body.data).toHaveLength(2);
  });

  it('filters by partial, case-insensitive location', async () => {
    const res = await request(app).get('/api/jobs?location=lalit').expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].location).toBe('Lalitpur');
  });

  it('filters by skill across required and preferred lists', async () => {
    const res = await request(app).get('/api/jobs?skills=pandas').expect(200);
    expect(res.body.data.map((j) => j.title)).toEqual(['Data Science Intern']);
  });

  it('combines filters with AND semantics', async () => {
    const res = await request(app).get('/api/jobs?jobType=internship&experienceLevel=senior').expect(200);
    expect(res.body.data).toHaveLength(0);
    expect(res.body.pagination.total).toBe(0);
  });

  it('paginates', async () => {
    const page1 = await request(app).get('/api/jobs?limit=1&page=1').expect(200);
    const page2 = await request(app).get('/api/jobs?limit=1&page=2').expect(200);

    expect(page1.body.data).toHaveLength(1);
    expect(page1.body.pagination).toMatchObject({ totalPages: 2, hasNextPage: true, hasPrevPage: false });
    expect(page2.body.pagination).toMatchObject({ hasNextPage: false, hasPrevPage: true });
    expect(page2.body.data[0].id).not.toBe(page1.body.data[0].id);
  });

  it('reports ignored filter values instead of failing', async () => {
    const res = await request(app).get('/api/jobs?jobType=wizardry').expect(200);
    expect(res.body.meta.warnings.join(' ')).toMatch(/wizardry/);
    expect(res.body.pagination.total).toBe(2);
  });

  it('returns an empty page rather than an error when nothing matches', async () => {
    const res = await request(app).get('/api/jobs?q=blacksmith').expect(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
  });

  it('sorts by deadline when asked', async () => {
    const res = await request(app).get('/api/jobs?sort=deadline&includeExpired=true').expect(200);
    expect(res.body.meta.sort).toBe('deadline');
    expect(res.body.data[0].title).toBe('Remote DevOps Engineer');
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns the full posting with every apply link', async () => {
    const { body: list } = await request(app).get('/api/jobs?q=react');
    const res = await request(app).get(`/api/jobs/${list.data[0].id}`).expect(200);

    expect(res.body.data).toMatchObject({
      title: 'React Frontend Developer',
      company: 'Leapfrog Technology',
      sourcePlatform: 'merojob',
      sourceUrl: 'https://merojob.com/react-frontend-developer/',
    });
    expect(res.body.data.description).toMatch(/Tailwind/);
    expect(res.body.data.allSources).toEqual([
      { platform: 'merojob', url: 'https://merojob.com/react-frontend-developer/' },
    ]);
  });

  it('400s on a malformed id and 404s on an unknown one', async () => {
    await request(app).get('/api/jobs/not-an-id').expect(400);
    await request(app).get('/api/jobs/64b7f1c2e4b0a1a2b3c4d5e6').expect(404);
  });
});

describe('GET /api/jobs/filters and /stats', () => {
  it('lists the values present in the data', async () => {
    const res = await request(app).get('/api/jobs/filters').expect(200);
    expect(res.body.sourcePlatforms).toEqual(['jobaxle', 'merojob']);
    expect(res.body.locations).toEqual(expect.arrayContaining(['Kathmandu', 'Lalitpur', 'Remote']));
    expect(res.body.jobTypes).toEqual(expect.arrayContaining(['internship', 'remote']));
  });

  it('counts jobs by type and source', async () => {
    const res = await request(app).get('/api/jobs/stats').expect(200);
    expect(res.body.bySourcePlatform).toEqual({ merojob: 2, jobaxle: 1 });
    expect(res.body.byJobType).toMatchObject({ internship: 1, remote: 1, 'full-time': 1 });
  });

  it('reports the freshness numbers the landing page reads', async () => {
    // One of the three seeded postings closed in 2020; the other two are open.
    // `freshToday` is relative to now, so post something now rather than pinning
    // an assertion to the fixture dates.
    await request(app)
      .post('/api/jobs/ingest')
      .send({
        jobs: [
          makeJob({
            title: 'Just Posted QA Engineer',
            company: 'Deerwalk',
            sourcePlatform: 'jobaxle',
            sourceUrl: 'https://jobaxle.com/jobs/just-posted-qa-engineer',
            postedDate: new Date().toISOString(),
          }),
        ],
      })
      .expect(200);

    const res = await request(app).get('/api/jobs/stats').expect(200);

    expect(res.body.total).toBe(4);
    expect(res.body.freshToday).toBeGreaterThanOrEqual(1);
    expect(res.body.openNow).toBe(3);
    // `platforms` is the label-ready form of the same counts (sorted by count,
    // so a tie between the two sources has no defined order).
    expect(res.body.platforms).toHaveLength(2);
    expect(res.body.platforms).toEqual(
      expect.arrayContaining([
        { platform: 'merojob', count: 2 },
        { platform: 'jobaxle', count: 2 },
      ]),
    );
    // The stream and this endpoint agree on when the last change landed.
    expect(Number.isNaN(Date.parse(res.body.lastIngestAt))).toBe(false);
    expect(Number.isNaN(Date.parse(res.body.serverTime))).toBe(false);
  });
});

describe('unknown routes', () => {
  it('404s with a helpful message', async () => {
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.message).toMatch('GET /api/nope');
  });
});
