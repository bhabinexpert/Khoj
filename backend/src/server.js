'use strict';

const config = require('./config');
const { createApp } = require('./app');
const { connectDb, disconnectDb } = require('./db/connect');

/**
 * Render's free tier spins a web service down after ~15 min with no inbound
 * traffic, and the first request back in eats a ~50s cold start. Pinging our own
 * public /health on an interval counts as inbound traffic, so the idle timer
 * never fires and the service stays warm.
 *
 * The public URL comes from RENDER_EXTERNAL_URL (Render injects it) or an
 * explicit KEEPALIVE_URL; if neither is set (e.g. local dev) we skip it. Default
 * cadence is 30s, overridable via KEEPALIVE_INTERVAL_MS.
 */
function startKeepAlive() {
  const base = (process.env.KEEPALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (!base) return;
  const intervalMs = Number(process.env.KEEPALIVE_INTERVAL_MS) || 30000;
  const url = `${base}/health`;
  const timer = setInterval(async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) console.warn(`[keepalive] ${url} -> ${res.status}`);
    } catch (err) {
      console.warn(`[keepalive] ping failed: ${err.message}`);
    }
  }, intervalMs);
  // Never let the heartbeat hold the process open during shutdown.
  timer.unref();
  console.log(`[keepalive] pinging ${url} every ${intervalMs}ms`);
}


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
    startKeepAlive();
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
