/**
 * The two derived fields on a parsed CV.
 *
 * ml-service computes `totalExperienceMonths` as the sum of the entries' months
 * and `highestEducation` as the top rung found, then scores against *those*
 * fields — so after the user edits the preview they have to be recomputed here,
 * or an edit would change what is displayed without changing any score.
 */

const LADDER = ['unspecified', 'slc', 'diploma', 'bachelor', 'master', 'phd'];

export function deriveCvTotals(cv) {
  const totalExperienceMonths = (cv.experience || []).reduce(
    (sum, entry) => sum + Math.max(0, Number(entry.months) || 0),
    0,
  );

  let highestEducation = 'unspecified';
  for (const entry of cv.education || []) {
    const level = entry.level || 'unspecified';
    if (LADDER.indexOf(level) > LADDER.indexOf(highestEducation)) highestEducation = level;
  }

  return { ...cv, totalExperienceMonths, highestEducation };
}

/** A short "12 skills · 3 yrs · Bachelor's" summary line. */
export function cvSummary(cv) {
  if (!cv) return '';
  const parts = [`${(cv.skills || []).length} skills`];
  if (cv.experience?.length) parts.push(`${cv.experience.length} role${cv.experience.length > 1 ? 's' : ''}`);
  if (cv.education?.length) parts.push(`${cv.education.length} qualification${cv.education.length > 1 ? 's' : ''}`);
  if (cv.certifications?.length) parts.push(`${cv.certifications.length} certifications`);
  return parts.join(' · ');
}
