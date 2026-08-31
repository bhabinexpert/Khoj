'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const config = require('./config');
const jobsRoutes = require('./routes/jobs.routes');
const cvRoutes = require('./routes/cv.routes');
const matchRoutes = require('./routes/match.routes');
const ml = require('./services/mlClient');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');
const { asyncHandler } = require('./utils/http');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  // No cookies, no sessions, no inline scripts served from here — it's a JSON API.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
      methods: ['GET', 'POST', 'OPTIONS'],
    }),
  );
  app.use(
    compression({
      /**
       * Everything here is compressible JSON except one endpoint. `compression`'s
       * default filter says yes to anything `text/*`, which includes
       * `text/event-stream` — and gzip buffers, so the live feed's events would
       * sit in the compressor until enough bytes accumulated to be worth a flush.
       * A stream whose whole point is arriving immediately must not be gzipped.
       */
      filter: (req, res) => {
        const type = String(res.getHeader('Content-Type') || '');
        if (type.includes('text/event-stream')) return false;
        return compression.filter(req, res);
      },
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  if (config.env !== 'test') {
    app.use(morgan(config.env === 'production' ? 'combined' : 'dev'));
  }

  app.use(
    '/api',
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      // Tests fire many requests from one address; limiting them proves nothing.
      skip: () => config.env === 'test',
      message: { error: 'Too many requests', message: 'Slow down a little and try again shortly.' },
    }),
  );

  app.get(
    '/health',
    asyncHandler(async (_req, res) => {
      const dbStates = ['disconnected', 'connected', 'connecting', 'disconnecting'];
      res.json({
        status: 'ok',
        service: 'khoj-backend',
        env: config.env,
        db: dbStates[mongoose.connection.readyState] ?? 'unknown',
        uptimeSeconds: Math.round(process.uptime()),
      });
    }),
  );

  app.get(
    '/health/deep',
    asyncHandler(async (_req, res) => {
      const mlHealth = await ml.health();
      const dbUp = mongoose.connection.readyState === 1;
      res.status(dbUp ? 200 : 503).json({
        status: dbUp && mlHealth.reachable ? 'ok' : 'degraded',
        db: dbUp ? 'connected' : 'disconnected',
        mlService: mlHealth,
      });
    }),
  );

  app.get('/api', (_req, res) => {
    res.json({
      name: 'Khoj API',
      description: 'Public job aggregator for Nepal. No authentication, no accounts.',
      endpoints: {
        'GET  /api/jobs': 'search & filter jobs (q, location, jobType, experienceLevel, source, page, limit, sort)',
        'GET  /api/jobs/filters': 'available filter values',
        'GET  /api/jobs/stats': 'counts by job type and source',
        'GET  /api/jobs/stream': 'server-sent events: announces every ingest that changed something',
        'GET  /api/jobs/:id': 'full job detail',
        'POST /api/jobs/ingest': 'scraper ingest (dedupes + upserts)',
        'POST /api/cv/parse': 'multipart PDF/DOCX -> parsed CV JSON (never stored)',
        'POST /api/match/score': 'score one job against a CV',
        'POST /api/match/batch': 'score up to 50 jobs against a CV',
      },
    });
  });

  app.use('/api/jobs', jobsRoutes);
  app.use('/api/cv', cvRoutes);
  app.use('/api/match', matchRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
