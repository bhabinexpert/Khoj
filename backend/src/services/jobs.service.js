'use strict';

const { Job, JOB_TYPES, EXPERIENCE_LEVELS, EDUCATION_LEVELS } = require('../models/Job');
const { dedupeHash, mergeSources, unionSkills, cleanText } = require('../utils/dedupe');
const config = require('../config');

/** Escape a user string so it is safe to embed in a RegExp. */
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const asArray = (value) =>
  (Array.isArray(value) ? value : String(value ?? '').split(','))
    .map((v) => cleanText(v).toLowerCase())
    .filter(Boolean);

/**
 * Translate validated query params into a Mongo filter + sort + paging plan.
 * Pure and synchronous, which is what makes it cheap to unit test.
 * @param {Record<string, unknown>} query
 */
function buildJobQuery(query = {}) {
  const filter = {};
  const warnings = [];

  const keyword = cleanText(query.q || query.keyword);
  if (keyword) filter.$text = { $search: keyword };

  const location = cleanText(query.location);
  if (location) filter.location = { $regex: escapeRegex(location), $options: 'i' };

  const company = cleanText(query.company);
  if (company) filter.company = { $regex: escapeRegex(company), $options: 'i' };

  const applyEnum = (rawValue, field, allowed) => {
    const values = asArray(rawValue).filter((v) => {
      if (allowed.includes(v)) return true;
      warnings.push(`ignored unknown ${field}: ${v}`);
      return false;
    });
    if (values.length === 1) filter[field] = values[0];
    else if (values.length > 1) filter[field] = { $in: values };
  };

  applyEnum(query.jobType, 'jobType', JOB_TYPES);
  applyEnum(query.experienceLevel, 'experienceLevel', EXPERIENCE_LEVELS);
  applyEnum(query.educationRequirement, 'educationRequirement', EDUCATION_LEVELS);

  const platforms = asArray(query.source || query.sourcePlatform);
  if (platforms.length === 1) filter.sourcePlatform = platforms[0];
  else if (platforms.length > 1) filter.sourcePlatform = { $in: platforms };

  const skills = asArray(query.skills);
  if (skills.length) {
    // Case-insensitive any-of match over both skill lists.
    const patterns = skills.map((s) => new RegExp(`^${escapeRegex(s)}$`, 'i'));
    filter.$or = [{ requiredSkills: { $in: patterns } }, { preferredSkills: { $in: patterns } }];
  }

  // Past-deadline postings are dropped by default: a job you can no longer
  // apply to is noise. This matches the landing page's "live postings" count
  // (controllers/jobs.controller.js `openNow`). `?includeExpired=true` brings
  // them back for anyone who explicitly wants the archive.
  if (String(query.includeExpired) !== 'true') {
    filter.$and = [
      ...(filter.$and || []),
      { $or: [{ deadline: null }, { deadline: { $gte: new Date() } }] },
    ];
  }

  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || config.pagination.defaultLimit, 1),
    config.pagination.maxLimit,
  );
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);

  const sortKeys = {
    newest: { postedDate: -1, _id: -1 },
    oldest: { postedDate: 1, _id: 1 },
    deadline: { deadline: 1, _id: 1 },
    relevance: keyword ? { score: { $meta: 'textScore' }, postedDate: -1 } : { postedDate: -1, _id: -1 },
  };
  const sortKey = sortKeys[query.sort] ? query.sort : keyword ? 'relevance' : 'newest';

  return {
    filter,
    sort: sortKeys[sortKey],
    projection: sortKey === 'relevance' && keyword ? { score: { $meta: 'textScore' } } : undefined,
    limit,
    page,
    skip: (page - 1) * limit,
    warnings,
    appliedSort: sortKey,
  };
}

/**
 * Paginated job search.
 * @param {Record<string, unknown>} query
 */
async function searchJobs(query) {
  const plan = buildJobQuery(query);

  let cursor = Job.find(plan.filter, plan.projection).sort(plan.sort).skip(plan.skip).limit(plan.limit);
  cursor = cursor.lean({ virtuals: false });

  const [docs, total] = await Promise.all([cursor.exec(), Job.countDocuments(plan.filter)]);

  return {
    data: docs.map(serialiseLean),
    pagination: {
      page: plan.page,
      limit: plan.limit,
      total,
      totalPages: Math.max(Math.ceil(total / plan.limit), 1),
      hasNextPage: plan.skip + docs.length < total,
      hasPrevPage: plan.page > 1,
    },
    meta: { sort: plan.appliedSort, warnings: plan.warnings },
  };
}

/** `.lean()` skips virtuals, so rebuild the few the client depends on. */
function serialiseLean(doc) {
  if (!doc) return doc;
  const { _id, __v, ...rest } = doc;
  const seen = new Set();
  const allSources = [];
  for (const source of [{ platform: doc.sourcePlatform, url: doc.sourceUrl }, ...(doc.sources || [])]) {
    if (source?.url && !seen.has(source.url)) {
      seen.add(source.url);
      allSources.push({ platform: source.platform, url: source.url });
    }
  }
  return {
    id: String(_id),
    ...rest,
    allSources,
    isExpired: Boolean(doc.deadline && new Date(doc.deadline).getTime() < Date.now()),
  };
}

module.exports = { buildJobQuery, searchJobs, serialiseLean, escapeRegex };
