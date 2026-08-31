'use strict';

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

let mongod;

/** Boot an in-memory MongoDB and connect mongoose to it. */
async function setupTestDb() {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri('khoj_test'));
  // Text/unique indexes are part of what we're testing, so build them.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
}

async function teardownTestDb() {
  await mongoose.connection.dropDatabase().catch(() => {});
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
}

async function clearCollections() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

/** Minimal-but-valid ingest payload; override any field per test. */
function makeJob(overrides = {}) {
  const seed = Math.random().toString(36).slice(2, 8);
  return {
    title: `Frontend Developer ${seed}`,
    company: 'Leapfrog Technology',
    description:
      'We are looking for a frontend developer with strong React and JavaScript skills to build user interfaces.',
    requiredSkills: ['React', 'JavaScript'],
    preferredSkills: ['TypeScript'],
    experienceLevel: 'mid',
    educationRequirement: 'bachelor',
    jobType: 'full-time',
    location: 'Kathmandu',
    salary: 'NRs 80,000 / Monthly',
    deadline: new Date(Date.now() + 20 * 86400000).toISOString(),
    postedDate: new Date().toISOString(),
    sourcePlatform: 'merojob',
    sourceUrl: `https://merojob.com/frontend-developer-${seed}/`,
    ...overrides,
  };
}

module.exports = { setupTestDb, teardownTestDb, clearCollections, makeJob };
