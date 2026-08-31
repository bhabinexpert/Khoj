'use strict';

const multer = require('multer');
const config = require('../config');

/** 404 handler — mounted after every route. */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: 'Not found',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
}

/**
 * Terminal error handler. Every response the API can emit for a failure has the
 * same `{ error, message }` shape so the frontend needs exactly one code path.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let details = err.details;

  if (err instanceof multer.MulterError) {
    status = 400;
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `File is too large. Maximum size is ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.`
        : `Upload rejected: ${err.message}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    details = Object.fromEntries(Object.entries(err.errors || {}).map(([k, v]) => [k, v.message]));
    message = 'Validation failed';
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'That record already exists';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Request body is not valid JSON';
  }

  if (status >= 500 && config.env !== 'test') {
    // eslint-disable-next-line no-console
    console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  }

  const body = { error: status >= 500 ? 'Internal server error' : 'Request failed', message };
  if (details) body.details = details;
  if (config.env === 'development' && status >= 500) body.stack = err.stack;

  res.status(status).json(body);
}

module.exports = { notFoundHandler, errorHandler };
