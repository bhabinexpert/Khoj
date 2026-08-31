'use strict';

require('dotenv').config();

const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  port: toInt(process.env.PORT, 5000),

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/khoj',

  /** FastAPI ml-service base URL (CV parsing + match scoring live there). */
  mlServiceUrl: (process.env.ML_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, ''),
  mlTimeoutMs: toInt(process.env.ML_TIMEOUT_MS, 30000),

  /**
   * Allowed browser origins. `*` (the default) is deliberate: the whole API is
   * public and read-only apart from ingest, and the app must work for any
   * visitor with no login. Lock this down if you add privileged endpoints.
   */
  corsOrigins: (process.env.CORS_ORIGINS || '*').split(',').map((o) => o.trim()).filter(Boolean),

  /** CV upload ceiling. PDFs of a CV are small; this is generous. */
  maxUploadBytes: toInt(process.env.MAX_UPLOAD_BYTES, 5 * 1024 * 1024),

  pagination: {
    defaultLimit: toInt(process.env.DEFAULT_PAGE_SIZE, 20),
    maxLimit: toInt(process.env.MAX_PAGE_SIZE, 100),
  },

  rateLimit: {
    windowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
    max: toInt(process.env.RATE_LIMIT_MAX, 240),
    ingestMax: toInt(process.env.RATE_LIMIT_INGEST_MAX, 30),
  },

  /**
   * Optional shared secret for POST /api/jobs/ingest. There are no user
   * accounts anywhere in Khoj, but ingest is a *write* endpoint that only
   * our own scheduler should call — so it supports an opt-in header token.
   * Leave unset in local dev and the endpoint stays open.
   */
  ingestToken: process.env.INGEST_TOKEN || '',
};

module.exports = config;
