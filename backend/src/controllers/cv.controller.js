'use strict';

const ml = require('../services/mlClient');
const { asyncHandler, badRequest } = require('../utils/http');

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/octet-stream', // some browsers send this for .docx
]);
const ALLOWED_EXT = /\.(pdf|docx|doc)$/i;

/**
 * POST /api/cv/parse
 *
 * Forwards the upload to the ml-service and returns the parsed JSON directly.
 * Nothing is written to MongoDB: there are no accounts, and the browser keeps
 * the only copy (localStorage). The file buffer lives in memory for the
 * duration of the request and is then garbage-collected.
 */
const parseCv = asyncHandler(async (req, res) => {
  const { file } = req;
  if (!file) throw badRequest('No file uploaded. Send a PDF or DOCX in the "file" field.');
  if (!ALLOWED_EXT.test(file.originalname || '') && !ALLOWED_MIME.has(file.mimetype)) {
    throw badRequest('Unsupported file type. Please upload a PDF or DOCX.');
  }
  if (!file.size) throw badRequest('That file is empty.');

  const parsed = await ml.parseCv(file);

  res.json({
    data: parsed,
    meta: {
      filename: file.originalname,
      sizeBytes: file.size,
      // Make the privacy contract explicit in the response itself.
      persisted: false,
      storage: 'client-side (localStorage) — this API stores nothing',
    },
  });
});

module.exports = { parseCv };
