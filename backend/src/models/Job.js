'use strict';

const { Schema, model } = require('mongoose');

const JOB_TYPES = ['internship', 'full-time', 'part-time', 'contract', 'remote'];
const EXPERIENCE_LEVELS = ['entry', 'mid', 'senior', 'unspecified'];
const EDUCATION_LEVELS = ['slc', 'diploma', 'bachelor', 'master', 'phd', 'unspecified'];

/** One link back to a copy of this posting. A merged job has several. */
const sourceSchema = new Schema(
  {
    platform: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const jobSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 300 },
    company: { type: String, required: true, trim: true, maxlength: 300, default: 'Not disclosed' },
    description: { type: String, required: true },

    requiredSkills: { type: [String], default: [] },
    preferredSkills: { type: [String], default: [] },

    experienceLevel: { type: String, enum: EXPERIENCE_LEVELS, default: 'unspecified', index: true },
    educationRequirement: { type: String, enum: EDUCATION_LEVELS, default: 'unspecified' },
    jobType: { type: String, enum: JOB_TYPES, default: 'full-time', index: true },

    location: { type: String, trim: true, default: 'Nepal', index: true },
    salary: { type: String, trim: true, default: null },
    deadline: { type: Date, default: null },
    postedDate: { type: Date, default: Date.now, index: true },

    /**
     * Platform of the *primary* copy — the one whose text we display. Kept
     * alongside `sources[]` so the common "filter by source" query stays a
     * simple indexed equality match.
     */
    sourcePlatform: { type: String, required: true, trim: true, index: true },
    sourceUrl: { type: String, required: true, trim: true },
    sources: { type: [sourceSchema], default: [] },

    /**
     * The employer's own application destination when the posting names one —
     * a careers page, an application form, or a `mailto:`. Scrapers extract it
     * from the post body, so it is often a better destination than `sourceUrl`,
     * which only points at the board we found the job on. `null` when the
     * source never said.
     */
    applyUrl: { type: String, trim: true, default: null },

    /** SHA-256 of title+company+description[0:100]; see utils/dedupe.js. */
    dedupeHash: { type: String, required: true, unique: true, index: true },

    lastSeenAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        ret.id = ret._id?.toString();
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

// Keyword search across the fields a jobseeker actually types into.
// Weighted so a title hit outranks a passing mention in the body.
jobSchema.index(
  { title: 'text', company: 'text', description: 'text', requiredSkills: 'text' },
  {
    name: 'job_text_search',
    weights: { title: 10, company: 5, requiredSkills: 4, description: 1 },
    default_language: 'english',
  },
);

// Feed default: newest first, narrowed by the common filter combinations.
jobSchema.index({ postedDate: -1, jobType: 1, experienceLevel: 1 });
jobSchema.index({ deadline: 1 });

/** True once the deadline has passed. */
jobSchema.virtual('isExpired').get(function isExpired() {
  return Boolean(this.deadline && this.deadline.getTime() < Date.now());
});

/** Every distinct link to this posting, guaranteed to include the primary one. */
jobSchema.virtual('allSources').get(function allSources() {
  const seen = new Set();
  const out = [];
  for (const source of [{ platform: this.sourcePlatform, url: this.sourceUrl }, ...(this.sources || [])]) {
    if (source?.url && !seen.has(source.url)) {
      seen.add(source.url);
      out.push({ platform: source.platform, url: source.url });
    }
  }
  return out;
});

const Job = model('Job', jobSchema);

module.exports = {
  Job,
  JOB_TYPES,
  EXPERIENCE_LEVELS,
  EDUCATION_LEVELS,
};
