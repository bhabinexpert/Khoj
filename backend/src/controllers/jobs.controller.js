'use strict';

const mongoose = require('mongoose');
const { Job } = require('../models/Job');
const { searchJobs, serialiseLean } = require('../services/jobs.service');
const { ingestJobs } = require('../services/ingest.service');
const { lastIngestAt, onJobsChanged } = require('../services/jobEvents');
const { asyncHandler, badRequest, notFound } = require('../utils/http');
const { JOB_TYPES, EXPERIENCE_LEVELS, EDUCATION_LEVELS } = require('../models/Job');

/** GET /api/jobs — keyword search + filters + pagination. */
const listJobs = asyncHandler(async (req, res) => {
  const result = await searchJobs(req.query);
  res.json(result);
});

/** GET /api/jobs/filters — distinct values so the sidebar isn't hard-coded. */
const getFilterOptions = asyncHandler(async (req, res) => {
  const [platforms, locations] = await Promise.all([
    Job.distinct('sourcePlatform'),
    Job.distinct('location'),
  ]);

  res.json({
    jobTypes: JOB_TYPES,
    experienceLevels: EXPERIENCE_LEVELS,
    educationLevels: EDUCATION_LEVELS,
    sourcePlatforms: platforms.filter(Boolean).sort(),
    // Long tail of hyper-specific addresses isn't useful in a dropdown.
    locations: locations.filter(Boolean).sort().slice(0, 200),
    sortOptions: ['relevance', 'newest', 'oldest', 'deadline'],
  });
});

/** GET /api/jobs/:id — full detail, including every apply link. */
const getJobById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) throw badRequest(`"${id}" is not a valid job id`);

  const job = await Job.findById(id).lean();
  if (!job) throw notFound('That job posting no longer exists');

  res.json({ data: serialiseLean(job) });
});

/**
 * POST /api/jobs/ingest — scraper entrypoint.
 * Accepts `{ jobs: [...] }` or a bare array.
 */
const ingest = asyncHandler(async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.jobs;

  if (!Array.isArray(payload)) {
    throw badRequest('Expected a JSON body of { "jobs": [...] } or a bare array of jobs');
  }
  if (payload.length === 0) {
    return res.status(200).json({ received: 0, inserted: 0, updated: 0, merged: 0, skipped: 0, errors: [] });
  }
  if (payload.length > 500) {
    throw badRequest('Too many jobs in one request — send at most 500 per batch');
  }

  const result = await ingestJobs(payload);
  // 207 signals "some items were rejected" without failing the whole batch.
  const status = result.skipped > 0 && result.inserted === 0 && result.updated === 0 ? 207 : 200;
  return res.status(status).json(result);
});

/**
 * GET /api/jobs/stream — server-sent events, so the feed can update itself.
 *
 * Plain SSE rather than WebSockets: the traffic is one-directional and tiny, it
 * survives ordinary HTTP proxies, and EventSource reconnects on its own. Each
 * message carries only counts — clients refetch through the normal, filtered
 * /api/jobs query rather than being pushed documents they may not want.
 */
function streamJobEvents(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // nginx buffers text/event-stream by default, which delays every message.
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event, payload) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  // Retry hint for EventSource, then an immediate hello so the client can show
  // "live" without waiting for the first ingest (which may be 30 minutes away).
  res.write('retry: 10000\n\n');
  send('hello', { at: new Date().toISOString(), lastIngestAt: lastIngestAt() });

  const unsubscribe = onJobsChanged((event) => send('jobs:changed', event));

  // Comment frames keep intermediaries from reaping an idle connection.
  const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 25000);

  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
    res.end();
  };
  req.on('close', close);
  req.on('error', close);
}

/**
 * GET /api/jobs/stats — counts for the feed header and the landing page.
 *
 * Deliberately envelope-free (like /filters) and cheap: `total` uses the
 * collection's metadata count rather than a full scan, and the two groupings are
 * over indexed fields.
 */
const getStats = asyncHandler(async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [total, byType, bySource, freshToday, openNow] = await Promise.all([
    Job.estimatedDocumentCount(),
    Job.aggregate([{ $group: { _id: '$jobType', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Job.aggregate([{ $group: { _id: '$sourcePlatform', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
    Job.countDocuments({ postedDate: { $gte: since } }),
    Job.countDocuments({ $or: [{ deadline: null }, { deadline: { $gte: new Date() } }] }),
  ]);

  res.json({
    total,
    freshToday,
    openNow,
    byJobType: Object.fromEntries(byType.map((row) => [row._id, row.count])),
    bySourcePlatform: Object.fromEntries(bySource.map((row) => [row._id, row.count])),
    // Same data as bySourcePlatform, ordered — the UI wants a stable list, and
    // object key order is not a contract worth relying on.
    platforms: bySource.filter((row) => row._id).map((row) => ({ platform: row._id, count: row.count })),
    lastIngestAt: lastIngestAt(),
    serverTime: new Date().toISOString(),
  });
});

module.exports = { listJobs, getJobById, getFilterOptions, ingest, getStats, streamJobEvents };
