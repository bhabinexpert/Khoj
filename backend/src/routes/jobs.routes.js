'use strict';

const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const config = require('../config');
const jobs = require('../controllers/jobs.controller');
const { HttpError } = require('../utils/http');

const router = Router();

/**
 * Optional shared-secret gate for the write endpoint.
 *
 * Khoj has no user accounts by design and every read endpoint is public.
 * Ingest, however, *writes* to the database and is only ever called by our own
 * scheduler — so it accepts an opt-in bearer token. If INGEST_TOKEN is unset
 * (the local-dev default) the endpoint stays open, and we log that clearly so
 * an unauthenticated write path is never a silent surprise in production.
 */
function requireIngestToken(req, _res, next) {
  if (!config.ingestToken) return next();

  const header = req.get('authorization') || '';
  const supplied = header.startsWith('Bearer ') ? header.slice(7) : req.get('x-ingest-token');

  if (supplied !== config.ingestToken) {
    return next(new HttpError(401, 'Invalid or missing ingest token'));
  }
  return next();
}

const ingestLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.ingestMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests', message: 'Ingest rate limit exceeded' },
});

// Static/aggregate routes come first so "/filters" is not swallowed by "/:id".
router.get('/', jobs.listJobs);
router.get('/filters', jobs.getFilterOptions);
router.get('/stats', jobs.getStats);
router.get('/stream', jobs.streamJobEvents);
router.post('/ingest', ingestLimiter, requireIngestToken, jobs.ingest);
router.get('/:id', jobs.getJobById);

module.exports = router;
