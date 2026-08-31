'use strict';

const axios = require('axios');
const FormData = require('form-data');
const config = require('../config');

const http = axios.create({
  baseURL: config.mlServiceUrl,
  timeout: config.mlTimeoutMs,
  // Match-score payloads with long skill lists can exceed axios' 10MB default.
  maxContentLength: 20 * 1024 * 1024,
  maxBodyLength: 20 * 1024 * 1024,
});

/** Error carrying an HTTP status, so the error middleware can pass it through. */
class MlServiceError extends Error {
  constructor(message, status = 502, details = undefined) {
    super(message);
    this.name = 'MlServiceError';
    this.status = status;
    this.details = details;
  }
}

/** Turn any axios failure into a client-friendly MlServiceError. */
function wrap(err, action) {
  if (err.response) {
    const { status, data } = err.response;
    // 4xx from the ml-service is the caller's fault (bad file, bad body):
    // surface it verbatim instead of masking it as a gateway error.
    const passthrough = status >= 400 && status < 500;
    return new MlServiceError(
      data?.detail || data?.message || `ml-service rejected ${action}`,
      passthrough ? status : 502,
      data,
    );
  }
  if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
    return new MlServiceError(
      `The AI service took too long to ${action}. Please try again.`,
      504,
    );
  }
  return new MlServiceError(
    `The AI service is unavailable right now (${err.code || err.message}). Job browsing still works.`,
    503,
  );
}

/**
 * Forward an uploaded CV to the ml-service for parsing.
 *
 * The parsed JSON is returned straight to the caller and **never persisted** —
 * Khoj has no accounts, so the browser's localStorage is the only store.
 *
 * @param {{buffer: Buffer, originalname: string, mimetype: string}} file
 */
async function parseCv(file) {
  const form = new FormData();
  form.append('file', file.buffer, {
    filename: file.originalname || 'cv',
    contentType: file.mimetype || 'application/octet-stream',
  });

  try {
    const { data } = await http.post('/parse-cv', form, { headers: form.getHeaders() });
    return data;
  } catch (err) {
    throw wrap(err, 'parse your CV');
  }
}

/**
 * Score one CV against one job's requirements.
 * @param {object} payload `{ cv, job }`
 */
async function matchScore(payload) {
  try {
    const { data } = await http.post('/match-score', payload);
    return data;
  } catch (err) {
    throw wrap(err, 'score this job');
  }
}

/**
 * Score one CV against many jobs in a single round-trip.
 * The feed needs a badge per card; N separate calls would re-embed the same CV
 * N times, so the ml-service exposes a batch route that embeds it once.
 * @param {object} payload `{ cv, jobs }`
 */
async function matchScoreBatch(payload) {
  try {
    const { data } = await http.post('/match-score/batch', payload);
    return data;
  } catch (err) {
    throw wrap(err, 'score these jobs');
  }
}

async function health() {
  try {
    const { data } = await http.get('/health', { timeout: 5000 });
    return { reachable: true, ...data };
  } catch (err) {
    return { reachable: false, error: err.code || err.message };
  }
}

module.exports = { parseCv, matchScore, matchScoreBatch, health, MlServiceError };
