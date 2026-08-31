'use strict';

const mongoose = require('mongoose');
const { Job } = require('../models/Job');
const ml = require('../services/mlClient');
const { asyncHandler, badRequest, notFound } = require('../utils/http');

const MAX_BATCH_JOBS = 50;

/** Reduce a Job document to just the fields the scorer needs. */
function toRequirements(job) {
  return {
    id: String(job._id || job.id || ''),
    title: job.title,
    requiredSkills: job.requiredSkills || [],
    preferredSkills: job.preferredSkills || [],
    experienceLevel: job.experienceLevel || 'unspecified',
    educationRequirement: job.educationRequirement || 'unspecified',
  };
}

/** Accept either a client-supplied job object or an id to look up. */
function normaliseInlineJob(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    id: String(raw.id || raw.jobId || 'inline'),
    title: typeof raw.title === 'string' ? raw.title : '',
    requiredSkills: Array.isArray(raw.requiredSkills) ? raw.requiredSkills : [],
    preferredSkills: Array.isArray(raw.preferredSkills) ? raw.preferredSkills : [],
    experienceLevel: raw.experienceLevel || 'unspecified',
    educationRequirement: raw.educationRequirement || raw.educationLevel || 'unspecified',
  };
}

function requireCv(body) {
  const cv = body?.cv;
  if (!cv || typeof cv !== 'object') {
    throw badRequest('Missing "cv". Send the parsed CV JSON your browser stored from /api/cv/parse.');
  }
  const hasContent =
    (Array.isArray(cv.skills) && cv.skills.length) ||
    (Array.isArray(cv.experience) && cv.experience.length) ||
    (Array.isArray(cv.education) && cv.education.length);
  if (!hasContent) {
    throw badRequest('That CV has no skills, education or experience to match against.');
  }
  return cv;
}

/**
 * POST /api/match/score — one CV against one job.
 * Body: `{ cv, jobId }` or `{ cv, job: {...} }`.
 */
const scoreOne = asyncHandler(async (req, res) => {
  const cv = requireCv(req.body);
  let job = normaliseInlineJob(req.body.job);

  if (!job) {
    const { jobId } = req.body;
    if (!mongoose.isValidObjectId(jobId)) {
      throw badRequest('Provide a valid "jobId", or an inline "job" object with its requirements.');
    }
    const doc = await Job.findById(jobId).lean();
    if (!doc) throw notFound('That job posting no longer exists');
    job = toRequirements(doc);
  }

  const result = await ml.matchScore({ cv, job });
  res.json({ data: result });
});

/**
 * POST /api/match/batch — one CV against many jobs, for the feed's badges.
 * Body: `{ cv, jobIds: [...] }`.
 */
const scoreBatch = asyncHandler(async (req, res) => {
  const cv = requireCv(req.body);
  const { jobIds } = req.body;

  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    throw badRequest('Provide a non-empty "jobIds" array.');
  }
  if (jobIds.length > MAX_BATCH_JOBS) {
    throw badRequest(`Too many jobs at once — send at most ${MAX_BATCH_JOBS} ids per request.`);
  }

  const validIds = jobIds.filter((id) => mongoose.isValidObjectId(id));
  if (validIds.length === 0) throw badRequest('None of the supplied jobIds are valid ids.');

  const docs = await Job.find({ _id: { $in: validIds } })
    .select('title requiredSkills preferredSkills experienceLevel educationRequirement')
    .lean();

  if (docs.length === 0) {
    return res.json({ data: {}, meta: { requested: jobIds.length, scored: 0 } });
  }

  const result = await ml.matchScoreBatch({ cv, jobs: docs.map(toRequirements) });

  // Key by job id so the frontend can look up a badge in O(1) per card.
  const byId = {};
  for (const entry of result?.results || []) {
    if (entry?.jobId) byId[entry.jobId] = entry;
  }

  return res.json({
    data: byId,
    meta: { requested: jobIds.length, scored: Object.keys(byId).length, engine: result?.engine },
  });
});

module.exports = { scoreOne, scoreBatch, toRequirements, MAX_BATCH_JOBS };
