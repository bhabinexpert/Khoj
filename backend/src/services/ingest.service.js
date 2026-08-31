'use strict';

const { Job, JOB_TYPES, EXPERIENCE_LEVELS, EDUCATION_LEVELS } = require('../models/Job');
const { dedupeHash, mergeSources, unionSkills, cleanText } = require('../utils/dedupe');
const { publishJobsChanged } = require('./jobEvents');

const MAX_DESCRIPTION_CHARS = 20000;
const MAX_SKILLS = 60;

/**
 * The application destination a posting names for itself. Accepts `http(s)` and
 * `mailto:` because a fair number of Nepali postings say "send your CV to hr@…"
 * and nothing else. Any other scheme is dropped rather than rendered as a link
 * a visitor might click.
 */
function sanitiseApplyUrl(value, { sourceUrl } = {}) {
  const candidate = cleanText(value);
  if (!candidate) return null;
  if (candidate.length > 600) return null;
  if (!/^(?:https?:\/\/\S|mailto:\S+@\S+)/i.test(candidate)) return null;
  // Pointing "apply here" back at the post we scraped adds nothing.
  if (sourceUrl && candidate === cleanText(sourceUrl)) return null;
  return candidate;
}

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const pickEnum = (value, allowed, fallback) => {
  const candidate = cleanText(value).toLowerCase();
  return allowed.includes(candidate) ? candidate : fallback;
};

/**
 * Coerce one raw ingest item into a shape the Job schema will accept.
 * @returns {{ok: true, job: object} | {ok: false, reason: string}}
 */
function sanitiseJob(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not an object' };

  const title = cleanText(raw.title).slice(0, 300);
  const sourceUrl = cleanText(raw.sourceUrl || raw.url);
  const sourcePlatform = cleanText(raw.sourcePlatform || raw.source).toLowerCase();

  if (!title) return { ok: false, reason: 'missing title' };
  if (!sourceUrl) return { ok: false, reason: 'missing sourceUrl' };
  if (!/^https?:\/\//i.test(sourceUrl)) return { ok: false, reason: 'sourceUrl must be http(s)' };
  if (!sourcePlatform) return { ok: false, reason: 'missing sourcePlatform' };

  const company = cleanText(raw.company).slice(0, 300) || 'Not disclosed';
  // Keep newlines in descriptions — the UI renders paragraph breaks.
  const description = String(raw.description ?? '').replace(/\r\n?/g, '\n').trim().slice(0, MAX_DESCRIPTION_CHARS) || title;

  const requiredSkills = unionSkills(raw.requiredSkills).slice(0, MAX_SKILLS);
  const requiredLower = new Set(requiredSkills.map((s) => s.toLowerCase()));
  const preferredSkills = unionSkills(raw.preferredSkills)
    .filter((s) => !requiredLower.has(s.toLowerCase()))
    .slice(0, MAX_SKILLS);

  const incomingSources = Array.isArray(raw.sources) ? raw.sources : [];

  return {
    ok: true,
    job: {
      title,
      company,
      description,
      requiredSkills,
      preferredSkills,
      experienceLevel: pickEnum(raw.experienceLevel, EXPERIENCE_LEVELS, 'unspecified'),
      educationRequirement: pickEnum(raw.educationRequirement, EDUCATION_LEVELS, 'unspecified'),
      jobType: pickEnum(raw.jobType, JOB_TYPES, 'full-time'),
      location: cleanText(raw.location).slice(0, 200) || 'Nepal',
      salary: cleanText(raw.salary) || null,
      deadline: toDate(raw.deadline),
      postedDate: toDate(raw.postedDate) || new Date(),
      sourcePlatform,
      sourceUrl,
      applyUrl: sanitiseApplyUrl(raw.applyUrl || raw.applicationUrl, { sourceUrl }),
      // Server recomputes the hash — never trust the client's copy.
      dedupeHash: dedupeHash(title, company, description),
      sources: mergeSources([{ platform: sourcePlatform, url: sourceUrl }], incomingSources),
    },
  };
}

/** Fold two copies of the same posting into one. */
function mergeJob(base, incoming) {
  const richer = (incoming.description || '').length > (base.description || '').length ? incoming : base;
  const requiredSkills = unionSkills(base.requiredSkills, incoming.requiredSkills).slice(0, MAX_SKILLS);
  const requiredLower = new Set(requiredSkills.map((s) => s.toLowerCase()));

  return {
    ...base,
    title: richer.title,
    description: richer.description,
    requiredSkills,
    preferredSkills: unionSkills(base.preferredSkills, incoming.preferredSkills)
      .filter((s) => !requiredLower.has(s.toLowerCase()))
      .slice(0, MAX_SKILLS),
    experienceLevel:
      base.experienceLevel !== 'unspecified' ? base.experienceLevel : incoming.experienceLevel,
    educationRequirement:
      base.educationRequirement !== 'unspecified' ? base.educationRequirement : incoming.educationRequirement,
    location: base.location && base.location !== 'Nepal' ? base.location : incoming.location,
    salary: base.salary || incoming.salary,
    // First real application link wins; a later copy only fills a gap.
    applyUrl: base.applyUrl || incoming.applyUrl || null,
    deadline: base.deadline || incoming.deadline,
    // Keep the earliest known posting date — it is when the job really opened.
    postedDate:
      base.postedDate && incoming.postedDate
        ? new Date(Math.min(new Date(base.postedDate).getTime(), new Date(incoming.postedDate).getTime()))
        : base.postedDate || incoming.postedDate,
    sources: mergeSources(base.sources, incoming.sources),
  };
}

/**
 * Dedupe + upsert a batch of scraped postings.
 *
 * Three passes, in order:
 *   1. sanitise every item, dropping unusable ones;
 *   2. fold duplicates *within* the payload (same job on two boards);
 *   3. fold each survivor against what MongoDB already has, then write.
 *
 * @param {unknown[]} rawJobs
 * @returns {Promise<{received:number, inserted:number, updated:number, merged:number, skipped:number, errors:string[]}>}
 */
async function ingestJobs(rawJobs) {
  const received = Array.isArray(rawJobs) ? rawJobs.length : 0;
  const result = { received, inserted: 0, updated: 0, merged: 0, skipped: 0, errors: [] };
  if (!received) return result;

  // Pass 1 + 2: sanitise and collapse in-payload duplicates.
  const byHash = new Map();
  for (const raw of rawJobs) {
    const outcome = sanitiseJob(raw);
    if (!outcome.ok) {
      result.skipped += 1;
      if (result.errors.length < 20) result.errors.push(outcome.reason);
      continue;
    }
    const { job } = outcome;
    const existing = byHash.get(job.dedupeHash);
    if (existing) {
      byHash.set(job.dedupeHash, mergeJob(existing, job));
      result.merged += 1;
    } else {
      byHash.set(job.dedupeHash, job);
    }
  }

  if (byHash.size === 0) return result;

  // Pass 3: fold against stored jobs, then write everything in one round-trip.
  const hashes = [...byHash.keys()];
  const stored = await Job.find({ dedupeHash: { $in: hashes } }).lean();
  const storedByHash = new Map(stored.map((doc) => [doc.dedupeHash, doc]));

  const operations = [];
  for (const [hash, incoming] of byHash) {
    const current = storedByHash.get(hash);

    if (!current) {
      operations.push({
        insertOne: { document: { ...incoming, lastSeenAt: new Date() } },
      });
      result.inserted += 1;
      continue;
    }

    const combined = mergeJob(current, incoming);
    const isNewPlatform = combined.sources.length > (current.sources || []).length;
    if (isNewPlatform) result.merged += 1;

    operations.push({
      updateOne: {
        filter: { dedupeHash: hash },
        update: {
          $set: {
            title: combined.title,
            description: combined.description,
            requiredSkills: combined.requiredSkills,
            preferredSkills: combined.preferredSkills,
            experienceLevel: combined.experienceLevel,
            educationRequirement: combined.educationRequirement,
            location: combined.location,
            salary: combined.salary,
            applyUrl: combined.applyUrl,
            deadline: combined.deadline,
            postedDate: combined.postedDate,
            sources: combined.sources,
            lastSeenAt: new Date(),
          },
        },
      },
    });
    result.updated += 1;
  }

  try {
    // Unordered: one duplicate-key race must not abort the remaining writes.
    await Job.bulkWrite(operations, { ordered: false });
  } catch (err) {
    // A concurrent scraper run can insert the same hash between our read and
    // write. E11000 means "already there", which is a success for our purposes.
    const writeErrors = err?.writeErrors || [];
    const nonDuplicate = writeErrors.filter((e) => e?.err?.code !== 11000 && e?.code !== 11000);
    const duplicates = writeErrors.length - nonDuplicate.length;

    result.inserted = Math.max(0, result.inserted - duplicates);
    result.skipped += duplicates;

    if (nonDuplicate.length || (!writeErrors.length && err)) {
      result.errors.push(...nonDuplicate.slice(0, 10).map((e) => e?.errmsg || 'write error'));
      if (!writeErrors.length) throw err;
    }
  }

  // Tell any browser holding the SSE stream open. Fired after the write, so a
  // client that refetches on this event cannot read the collection pre-update.
  publishJobsChanged(result);

  return result;
}

module.exports = { sanitiseJob, sanitiseApplyUrl, mergeJob, ingestJobs, MAX_DESCRIPTION_CHARS, MAX_SKILLS };
