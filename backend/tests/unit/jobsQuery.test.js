'use strict';

const { buildJobQuery } = require('../../src/services/jobs.service');

describe('buildJobQuery', () => {
  it('defaults to newest-first with the configured page size', () => {
    const plan = buildJobQuery({});
    expect(plan.sort).toEqual({ postedDate: -1, _id: -1 });
    expect(plan.page).toBe(1);
    expect(plan.limit).toBe(20);
    expect(plan.skip).toBe(0);
    expect(plan.appliedSort).toBe('newest');
  });

  it('uses a text search and relevance sort when a keyword is given', () => {
    const plan = buildJobQuery({ q: 'react developer' });
    expect(plan.filter.$text).toEqual({ $search: 'react developer' });
    expect(plan.appliedSort).toBe('relevance');
    expect(plan.projection).toEqual({ score: { $meta: 'textScore' } });
  });

  it('matches location and company case-insensitively', () => {
    const plan = buildJobQuery({ location: 'kathmandu', company: 'leapfrog' });
    expect(plan.filter.location).toEqual({ $regex: 'kathmandu', $options: 'i' });
    expect(plan.filter.company).toEqual({ $regex: 'leapfrog', $options: 'i' });
  });

  it('escapes regex metacharacters in user input', () => {
    const plan = buildJobQuery({ location: 'Kathmandu (Valley).*' });
    expect(plan.filter.location.$regex).toBe('Kathmandu \\(Valley\\)\\.\\*');
  });

  it('accepts a single enum value and a comma-separated list', () => {
    expect(buildJobQuery({ jobType: 'internship' }).filter.jobType).toBe('internship');
    expect(buildJobQuery({ jobType: 'internship,remote' }).filter.jobType).toEqual({
      $in: ['internship', 'remote'],
    });
  });

  it('ignores unknown enum values and reports them as warnings', () => {
    const plan = buildJobQuery({ jobType: 'internship,wizardry' });
    expect(plan.filter.jobType).toBe('internship');
    expect(plan.warnings).toEqual(expect.arrayContaining([expect.stringContaining('wizardry')]));
  });

  it('drops the enum filter entirely when nothing valid remains', () => {
    const plan = buildJobQuery({ experienceLevel: 'wizard' });
    expect(plan.filter.experienceLevel).toBeUndefined();
  });

  it('filters by source platform under either param name', () => {
    expect(buildJobQuery({ source: 'merojob' }).filter.sourcePlatform).toBe('merojob');
    expect(buildJobQuery({ sourcePlatform: 'merojob,jobaxle' }).filter.sourcePlatform).toEqual({
      $in: ['merojob', 'jobaxle'],
    });
  });

  it('matches skills across both required and preferred lists', () => {
    const plan = buildJobQuery({ skills: 'react,docker' });
    expect(plan.filter.$or).toHaveLength(2);
    expect(plan.filter.$or[0].requiredSkills.$in[0]).toBeInstanceOf(RegExp);
  });

  it('hides past-deadline postings by default and includes them on request', () => {
    const plan = buildJobQuery({});
    expect(plan.filter.$and).toBeDefined();
    // The cutoff is "now", not a grace window: a job you can no longer apply to
    // is dropped the moment its deadline passes.
    const gate = plan.filter.$and.find((clause) => clause.$or?.some((c) => c.deadline?.$gte));
    const cutoff = gate.$or.find((c) => c.deadline?.$gte).deadline.$gte;
    expect(Math.abs(cutoff.getTime() - Date.now())).toBeLessThan(5000);
    expect(buildJobQuery({ includeExpired: 'true' }).filter.$and).toBeUndefined();
  });

  it('clamps pagination to sane bounds', () => {
    expect(buildJobQuery({ limit: '5000' }).limit).toBe(100);
    expect(buildJobQuery({ limit: '0' }).limit).toBe(20);
    expect(buildJobQuery({ limit: 'abc' }).limit).toBe(20);
    expect(buildJobQuery({ page: '-3' }).page).toBe(1);
    expect(buildJobQuery({ page: '3', limit: '10' }).skip).toBe(20);
  });

  it('honours an explicit sort and falls back for unknown ones', () => {
    expect(buildJobQuery({ sort: 'deadline' }).appliedSort).toBe('deadline');
    expect(buildJobQuery({ sort: 'nonsense' }).appliedSort).toBe('newest');
  });
});
