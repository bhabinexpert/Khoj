/** Display helpers shared by the cards, the detail page and the filters. */

export const JOB_TYPE_LABELS = {
  internship: 'Internship',
  'full-time': 'Full time',
  'part-time': 'Part time',
  contract: 'Contract',
  remote: 'Remote',
};

export const EXPERIENCE_LABELS = {
  entry: 'Entry level',
  mid: 'Mid level',
  senior: 'Senior',
  unspecified: 'Any experience',
};

export const EDUCATION_LABELS = {
  slc: 'SLC / SEE',
  diploma: '+2 / Diploma',
  bachelor: "Bachelor's",
  master: "Master's",
  phd: 'PhD',
  unspecified: 'Not specified',
};

export const SORT_LABELS = {
  relevance: 'Best match for your search',
  newest: 'Newest first',
  oldest: 'Oldest first',
  deadline: 'Closing soonest',
};

const PLATFORM_LABELS = {
  merojob: 'Merojob',
  jobaxle: 'JobAxle',
  kumarijob: 'Kumari Job',
  froxjob: 'Froxjob',
  merorojgari: 'Merorojgari',
  jobsnepal: 'JobsNepal',
  rojgari: 'Rojgari',
  nepalijob: 'NepaliJob',
  himalayas: 'Himalayas',
  arbeitnow: 'Arbeitnow',
};

export function labelFor(map, value, fallback = '') {
  if (!value) return fallback;
  return map[value] || titleCase(value);
}

export function platformLabel(platform) {
  if (!platform) return 'Unknown source';
  return PLATFORM_LABELS[platform.toLowerCase()] || titleCase(platform);
}

export function titleCase(value = '') {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function toDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value) {
  const date = toDate(value);
  if (!date) return '';
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "today", "3 days ago", "2 months ago" — the freshness signal on a card. */
export function relativeDate(value) {
  const date = toDate(value);
  if (!date) return '';

  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 0) return formatDate(value);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? 'a month ago' : `${months} months ago`;
}

/**
 * Deadline copy plus a tone, because "closes in 2 days" should look different
 * from "closed 3 weeks ago".
 */
export function deadlineInfo(value) {
  const date = toDate(value);
  if (!date) return { text: 'No deadline listed', tone: 'neutral', expired: false };

  const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { text: `Closed on ${formatDate(value)}`, tone: 'expired', expired: true };
  if (days === 0) return { text: 'Closes today', tone: 'urgent', expired: false };
  if (days === 1) return { text: 'Closes tomorrow', tone: 'urgent', expired: false };
  if (days <= 5) return { text: `Closes in ${days} days`, tone: 'urgent', expired: false };
  return { text: `Apply by ${formatDate(value)}`, tone: 'neutral', expired: false };
}

/** Score → badge colours. The bands match the wording in the breakdown. */
export function scoreTone(score) {
  if (score >= 75) return { chip: 'bg-emerald-100 text-emerald-800', bar: 'bg-emerald-500', word: 'Strong match' };
  if (score >= 50) return { chip: 'bg-amber-100 text-amber-800', bar: 'bg-amber-500', word: 'Partial match' };
  if (score >= 25) return { chip: 'bg-orange-100 text-orange-800', bar: 'bg-orange-500', word: 'Weak match' };
  return { chip: 'bg-ink-200 text-ink-700', bar: 'bg-ink-400', word: 'Low match' };
}

export function roundScore(score) {
  return Math.round(Number(score) || 0);
}

/** Months → "2 yrs 6 mos", for the CV summary and experience notes. */
export function monthsToSpan(months) {
  const total = Math.max(0, Math.round(Number(months) || 0));
  if (!total) return 'none listed';
  const years = Math.floor(total / 12);
  const rest = total % 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years > 1 ? 's' : ''}`);
  if (rest) parts.push(`${rest} mo${rest > 1 ? 's' : ''}`);
  return parts.join(' ');
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Descriptions arrive as plain text with newlines (the scrapers strip HTML), so
 * split on blank lines and render paragraphs rather than trusting any markup.
 */
export function toParagraphs(text = '') {
  return String(text)
    .split(/\n\s*\n|\r\n\s*\r\n/)
    .map((block) => block.trim())
    .filter(Boolean);
}

/** "forms.gle", "careers.leapfrogtech.com" — what a bare link actually points at. */
export function linkHost(url = '') {
  const value = String(url);
  if (/^mailto:/i.test(value)) return value.replace(/^mailto:/i, '').trim();
  try {
    return new URL(value).host.replace(/^www\./, '');
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0] || 'the source site';
  }
}

/**
 * Work out where "Apply" should send someone, and label it honestly.
 *
 * Precedence: the employer's own `applyUrl` when the posting named one — a form,
 * a careers page, an email — then the job board we found it on. Every route is
 * labelled by where it actually goes ("Apply on forms.gle", "Email your
 * application to hr@…"), so nothing pretends to be an application form that
 * isn't one. `apply` is `null` only for a posting with no usable link at all.
 *
 * @returns {{apply: {url: string, label: string, kind: 'direct'|'board', platform: string|null}|null,
 *            extras: Array<{url: string, label: string, platform: string}>}}
 */
export function applyRoutes(job) {
  const sources = (job?.allSources || []).filter((source) => source?.url);

  const applyUrl = job?.applyUrl || null;
  const isEmail = /^mailto:/i.test(applyUrl || '');
  const direct = applyUrl
    ? {
        url: applyUrl,
        platform: null,
        kind: 'direct',
        label: isEmail ? `Email your application to ${linkHost(applyUrl)}` : `Apply on ${linkHost(applyUrl)}`,
      }
    : null;

  const boardRoutes = sources.map((s) => ({
    url: s.url,
    platform: s.platform,
    kind: 'board',
    label: `Apply on ${platformLabel(s.platform)}`,
  }));

  const apply = direct || boardRoutes[0] || null;
  const extras = direct ? boardRoutes : boardRoutes.slice(1);

  return { apply, extras };
}
