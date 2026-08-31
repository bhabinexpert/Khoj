'use strict';

const { EventEmitter } = require('node:events');

/**
 * In-process pub/sub for "the job collection changed".
 *
 * The scraper POSTs to /api/jobs/ingest; connected browsers hold an SSE stream
 * open on /api/jobs/stream and are told the moment new postings land, so the
 * feed can refresh itself without polling every few seconds.
 *
 * Scope, stated plainly: this is a *single-process* bus. Run more than one API
 * instance and a client only hears about ingests that hit its own process — the
 * client-side poll (see useLiveJobs.js) is what makes that degrade to "up to a
 * minute late" instead of "silently stale". A multi-instance deployment wants
 * Redis pub/sub or a Mongo change stream here instead; the emitter is isolated
 * in this module so that swap touches one file.
 */
const bus = new EventEmitter();

// Every SSE connection subscribes; the default cap of 10 would warn at 11 tabs.
bus.setMaxListeners(0);

/** ISO timestamp of the last ingest that actually changed something. */
let lastChangeAt = null;

const JOBS_CHANGED = 'jobs:changed';

/**
 * Announce an ingest. `summary` is the ingest result, trimmed to the counts a
 * client can act on — never job documents, because an SSE stream is a broadcast
 * and there is no per-client filtering to apply.
 */
function publishJobsChanged(summary = {}) {
  const inserted = Number(summary.inserted) || 0;
  const updated = Number(summary.updated) || 0;
  const merged = Number(summary.merged) || 0;

  // An ingest that only re-stamped `lastSeenAt` is not news.
  if (inserted === 0 && updated === 0 && merged === 0) return null;

  const event = { type: 'jobs:changed', inserted, updated, merged, at: new Date().toISOString() };
  lastChangeAt = event.at;
  bus.emit(JOBS_CHANGED, event);
  return event;
}

function onJobsChanged(listener) {
  bus.on(JOBS_CHANGED, listener);
  return () => bus.off(JOBS_CHANGED, listener);
}

const lastIngestAt = () => lastChangeAt;

/** Tests only — the bus outlives individual suites otherwise. */
function _reset() {
  bus.removeAllListeners(JOBS_CHANGED);
  lastChangeAt = null;
}

module.exports = { publishJobsChanged, onJobsChanged, lastIngestAt, subscriberCount: () => bus.listenerCount(JOBS_CHANGED), _reset };
