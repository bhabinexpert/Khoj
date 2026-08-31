'use strict';

const { sanitiseJob, mergeJob } = require('../../src/services/ingest.service');
const { makeJob } = require('../helpers/db');

describe('sanitiseJob', () => {
  it('accepts a well-formed posting and computes a hash', () => {
    const outcome = sanitiseJob(makeJob({ title: 'Backend Engineer' }));
    expect(outcome.ok).toBe(true);
    expect(outcome.job.title).toBe('Backend Engineer');
    expect(outcome.job.dedupeHash).toMatch(/^[0-9a-f]{64}$/);
    expect(outcome.job.sources).toEqual([
      { platform: 'merojob', url: expect.stringContaining('https://merojob.com/') },
    ]);
  });

  it.each([
    ['missing title', { title: '   ' }, /title/],
    ['missing sourceUrl', { sourceUrl: '' }, /sourceUrl/],
    ['non-http sourceUrl', { sourceUrl: 'javascript:alert(1)' }, /http/],
    ['missing sourcePlatform', { sourcePlatform: '' }, /sourcePlatform/],
  ])('rejects a posting with %s', (_label, overrides, expected) => {
    const outcome = sanitiseJob(makeJob(overrides));
    expect(outcome.ok).toBe(false);
    expect(outcome.reason).toMatch(expected);
  });

  it('rejects non-objects', () => {
    expect(sanitiseJob(null).ok).toBe(false);
    expect(sanitiseJob('a job').ok).toBe(false);
  });

  it('coerces unknown enum values to safe defaults', () => {
    const { job } = sanitiseJob(
      makeJob({ jobType: 'wizardry', experienceLevel: 'godlike', educationRequirement: 'hogwarts' }),
    );
    expect(job.jobType).toBe('full-time');
    expect(job.experienceLevel).toBe('unspecified');
    expect(job.educationRequirement).toBe('unspecified');
  });

  it('falls back to sensible defaults for company, location and description', () => {
    const { job } = sanitiseJob(makeJob({ company: '', location: '', description: '' }));
    expect(job.company).toBe('Not disclosed');
    expect(job.location).toBe('Nepal');
    expect(job.description).toBe(job.title);
  });

  it('never lets a skill appear as both required and preferred', () => {
    const { job } = sanitiseJob(
      makeJob({ requiredSkills: ['React', 'SQL'], preferredSkills: ['react', 'Docker'] }),
    );
    expect(job.requiredSkills).toEqual(['React', 'SQL']);
    expect(job.preferredSkills).toEqual(['Docker']);
  });

  it('drops unparseable dates rather than storing Invalid Date', () => {
    const { job } = sanitiseJob(makeJob({ deadline: 'whenever', postedDate: 'not a date' }));
    expect(job.deadline).toBeNull();
    expect(job.postedDate).toBeInstanceOf(Date);
  });

  it('normalises the platform to lower case', () => {
    expect(sanitiseJob(makeJob({ sourcePlatform: 'MeroJob' })).job.sourcePlatform).toBe('merojob');
  });

  it('truncates absurdly long descriptions', () => {
    const { job } = sanitiseJob(makeJob({ description: 'x'.repeat(50000) }));
    expect(job.description.length).toBe(20000);
  });
});

describe('applyUrl', () => {
  it('keeps an http application link the source named', () => {
    const { job } = sanitiseJob(makeJob({ applyUrl: 'https://forms.gle/abc123' }));
    expect(job.applyUrl).toBe('https://forms.gle/abc123');
  });

  it('keeps a mailto: link, because plenty of postings only give an email', () => {
    const { job } = sanitiseJob(makeJob({ applyUrl: 'mailto:hr@example.com' }));
    expect(job.applyUrl).toBe('mailto:hr@example.com');
  });

  it('accepts the applicationUrl spelling too', () => {
    const { job } = sanitiseJob(makeJob({ applicationUrl: 'https://careers.example.com/1' }));
    expect(job.applyUrl).toBe('https://careers.example.com/1');
  });

  it.each([
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a tel: URL', 'tel:+9779800000000'],
    ['a bare phone number', '9801234567'],
    ['an empty string', '   '],
  ])('drops %s rather than rendering it as a link', (_label, value) => {
    expect(sanitiseJob(makeJob({ applyUrl: value })).job.applyUrl).toBeNull();
  });

  it('drops an applyUrl that just points back at the post we scraped', () => {
    const sourceUrl = 'https://merojob.com/graphic-design-intern-9330/';
    const { job } = sanitiseJob(makeJob({ sourcePlatform: 'merojob', sourceUrl, applyUrl: sourceUrl }));
    expect(job.applyUrl).toBeNull();
  });

  it('defaults to null when the posting named no application route', () => {
    expect(sanitiseJob(makeJob({})).job.applyUrl).toBeNull();
  });

  it('lets a second copy fill in an application link the first lacked', () => {
    const withoutLink = sanitiseJob(makeJob({ sourcePlatform: 'jobaxle', sourceUrl: 'https://jobaxle.com/job/9' })).job;
    const withLink = sanitiseJob(makeJob({ applyUrl: 'https://forms.gle/xyz' })).job;
    expect(mergeJob(withoutLink, withLink).applyUrl).toBe('https://forms.gle/xyz');
    // ...but never overwrites one we already have.
    expect(mergeJob(withLink, withoutLink).applyUrl).toBe('https://forms.gle/xyz');
  });
});

describe('mergeJob', () => {
  const base = sanitiseJob(
    makeJob({
      title: 'React Developer',
      company: 'Leapfrog',
      description: 'Short posting.',
      requiredSkills: ['React'],
      preferredSkills: ['Redux'],
      experienceLevel: 'unspecified',
      salary: '',
      deadline: null,
      sourcePlatform: 'merojob',
      sourceUrl: 'https://merojob.com/react-developer/',
    }),
  ).job;

  const other = sanitiseJob(
    makeJob({
      title: 'React Developer',
      company: 'Leapfrog',
      description: 'A much longer and more detailed posting with plenty of context about the role.',
      requiredSkills: ['react', 'TypeScript'],
      preferredSkills: ['Next.js'],
      experienceLevel: 'mid',
      salary: 'NRs 90,000',
      deadline: '2026-12-01',
      sourcePlatform: 'jobaxle',
      sourceUrl: 'https://jobaxle.com/jobs/react-developer',
    }),
  ).job;

  it('keeps every apply link from both platforms', () => {
    const merged = mergeJob(base, other);
    expect(merged.sources.map((s) => s.platform).sort()).toEqual(['jobaxle', 'merojob']);
  });

  it('prefers the richer description', () => {
    expect(mergeJob(base, other).description).toBe(other.description);
    expect(mergeJob(other, base).description).toBe(other.description);
  });

  it('unions skills without duplicating across casing', () => {
    const merged = mergeJob(base, other);
    expect(merged.requiredSkills).toEqual(['React', 'TypeScript']);
    expect(merged.preferredSkills).toEqual(['Redux', 'Next.js']);
  });

  it('fills in fields the base copy was missing', () => {
    const merged = mergeJob(base, other);
    expect(merged.experienceLevel).toBe('mid');
    expect(merged.salary).toBe('NRs 90,000');
    expect(merged.deadline).not.toBeNull();
  });

  it('keeps the earliest posted date', () => {
    const older = { ...other, postedDate: new Date('2026-01-01') };
    const newer = { ...base, postedDate: new Date('2026-06-01') };
    expect(mergeJob(newer, older).postedDate.toISOString()).toBe(new Date('2026-01-01').toISOString());
  });
});
