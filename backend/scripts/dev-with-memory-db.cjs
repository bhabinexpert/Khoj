'use strict';

/**
 * Run the API against a throwaway in-memory MongoDB, seeded with a handful of
 * realistic listings.
 *
 * This is for local UI work and demos — `npm run dev:memory`. Nothing is
 * persisted: the database dies with the process. Use `npm run dev` (plus a real
 * `MONGO_URI`) for anything you want to keep, and the scraper to load real data.
 */

const { MongoMemoryServer } = require('mongodb-memory-server');

const { createApp } = require('../src/app');
const { connectDb, disconnectDb } = require('../src/db/connect');
const config = require('../src/config');
const { seedJobs } = require('./seed-jobs');

async function main() {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri('khoj-dev');

  await connectDb(uri);
  const inserted = await seedJobs();
  console.log(`[seed] ${inserted} demo job(s) inserted into the in-memory database`);

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(
      `[api] Khoj backend (in-memory DB) listening on :${config.port}\n` +
        `[api] ml-service: ${config.mlServiceUrl} — CV parsing and scoring need it running\n` +
        '[api] data is discarded on exit',
    );
  });

  const shutdown = async () => {
    server.close();
    await disconnectDb();
    await mongo.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[fatal]', err);
  process.exit(1);
});
