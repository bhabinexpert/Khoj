'use strict';

const { dedupeHash, normaliseForHash, mergeSources, unionSkills } = require('../../src/utils/dedupe');

describe('dedupeHash', () => {
  it('is stable for identical input', () => {
    const a = dedupeHash('Frontend Developer', 'Leapfrog', 'Build UIs with React');
    const b = dedupeHash('Frontend Developer', 'Leapfrog', 'Build UIs with React');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('ignores casing, punctuation and whitespace noise', () => {
    const canonical = dedupeHash('Senior Developer', 'Leapfrog Technology', 'Build great things');
    expect(dedupeHash('  SENIOR   Developer ', 'Leapfrog  Technology', 'Build great things')).toBe(canonical);
    expect(dedupeHash('Senior-Developer', 'Leapfrog, Technology', 'Build   great things!')).toBe(canonical);
  });

  it('only considers the first 100 normalised chars of the description', () => {
    const prefix = 'a'.repeat(100);
    expect(dedupeHash('T', 'C', `${prefix} tail one`)).toBe(dedupeHash('T', 'C', `${prefix} tail two`));
  });

  it('distinguishes different titles, companies and openings', () => {
    const base = dedupeHash('Developer', 'Acme', 'Write code every day');
    expect(dedupeHash('Designer', 'Acme', 'Write code every day')).not.toBe(base);
    expect(dedupeHash('Developer', 'Other Co', 'Write code every day')).not.toBe(base);
    expect(dedupeHash('Developer', 'Acme', 'Completely different opening line')).not.toBe(base);
  });

  it('tolerates null and undefined parts', () => {
    expect(() => dedupeHash(null, undefined, '')).not.toThrow();
  });

  /**
   * Cross-language contract. These digests were generated from *both*
   * implementations and confirmed identical; if either side drifts this test
   * fails instead of the app silently splitting one job into two rows.
   * The Python side asserts the same vectors in
   * scraper-service/tests/test_normalize.py.
   */
  it('matches the Python scraper implementation (golden vectors)', () => {
    expect(dedupeHash('Frontend Developer', 'Leapfrog Technology', 'Build modern web UIs with React.')).toBe(
      '383681e33501c8e91dfeadd6d1b1bc69768710a3bf616bc10792b072b45ff4eb',
    );
    expect(
      dedupeHash(
        'Sr. Data Analyst',
        'F1Soft International',
        'Analyse transaction data using SQL and Power BI dashboards for the payments team.',
      ),
    ).toBe('8b59f026084d9a341ad5b35dfa1fe94bc0eae6d02e5cf7385b505a3d18e53abc');
    expect(dedupeHash('इन्टर्न — Marketing', 'Daraz Nepal', 'Support the growth team with campaigns.')).toBe(
      '2926c7baa41297bea50932449365517ce63714cf45ab9e087df306b98fecdc7b',
    );
  });
});

describe('normaliseForHash', () => {
  it('collapses every non-alphanumeric run to a single space', () => {
    expect(normaliseForHash('Sr.  Developer — (Remote)!')).toBe('sr developer remote');
  });
});

describe('mergeSources', () => {
  it('unions by url and keeps first-seen order', () => {
    const merged = mergeSources(
      [{ platform: 'merojob', url: 'https://merojob.com/a' }],
      [
        { platform: 'jobaxle', url: 'https://jobaxle.com/b' },
        { platform: 'merojob', url: 'https://merojob.com/a' },
      ],
    );
    expect(merged).toEqual([
      { platform: 'merojob', url: 'https://merojob.com/a' },
      { platform: 'jobaxle', url: 'https://jobaxle.com/b' },
    ]);
  });

  it('drops entries with no url', () => {
    expect(mergeSources([{ platform: 'x' }], [{ url: '   ' }])).toEqual([]);
  });
});

describe('unionSkills', () => {
  it('dedupes case-insensitively, keeping the first spelling', () => {
    expect(unionSkills(['React', 'SQL'], ['react', 'Docker'])).toEqual(['React', 'SQL', 'Docker']);
  });

  it('ignores empty values and non-arrays', () => {
    expect(unionSkills(['  ', 'Go'], null, undefined)).toEqual(['Go']);
  });
});
