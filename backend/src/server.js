'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { connectDb, disconnectDb } = require('./db/connect');

async function start() {
  try {
    await connectDb();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[fatal] could not reach MongoDB at ${config.mongoUri}\n`, err.message);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `[api] Khoj backend listening on :${config.port} (${config.env})\n` +
        `[api] ml-service: ${config.mlServiceUrl}\n` +
        `[api] ingest token: ${config.ingestToken ? 'required' : 'NOT SET — /api/jobs/ingest is open to anyone'}`,
    );
  });

  const shutdown = async (signal) => {
    // eslint-disable-next-line no-console
    console.log(`\n[api] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
    // Do not hang forever on a stuck connection.
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    // eslint-disable-next-line no-console
    console.error('[fatal] unhandled rejection', reason);
  });
}

start();
