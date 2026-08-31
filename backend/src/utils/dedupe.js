'use strict';

/**
 * Canonical duplicate detection for job postings.
 *
 * The hash is SHA-256 over `title | company | first 100 chars of description`,
 * each part lower-cased with every non-alphanumeric run collapsed to a single
 * space. That makes it stable across the cosmetic differences between boards
 * ("Sr. Developer" vs "Sr Developer", smart quotes, stray &nbsp;).
 *
 * IMPORTANT: this must stay byte-for-byte identical to
 * `scraper-service/core/normalize.py:dedupe_hash`. The two are covered by
 * matching fixtures on both sides (see `tests/unit/dedupe.test.js` and
 * `scraper-service/tests/test_normalize.py`) so a drift breaks a test rather
 * than silently splitting one job into two rows.
 */

const crypto = require('node:crypto');

/** Collapse whitespace and trim, tolerating null/undefined/numbers. */
function cleanText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

/** Lower-case and reduce every non-alphanumeric run to one space. */
function normaliseForHash(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * @param {string} title
 * @param {string} company
 * @param {string} description
 * @returns {string} 64-char hex digest
 */
function dedupeHash(title, company, description) {
  const payload = [
    normaliseForHash(title),
    normaliseForHash(company),
    normaliseForHash(description).slice(0, 100),
  ].join('|');

  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

/**
 * Union of source links, de-duplicated by URL, preserving first-seen order.
 * @param {Array<{platform?: string, url?: string}>} existing
 * @param {Array<{platform?: string, url?: string}>} incoming
 */
function mergeSources(existing = [], incoming = []) {
  const seen = new Set();
  const out = [];
  for (const source of [...existing, ...incoming]) {
    const url = cleanText(source?.url);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ platform: cleanText(source?.platform) || 'unknown', url });
  }
  return out;
}

/** Case-insensitive union of skill lists, keeping the first spelling seen. */
function unionSkills(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const raw of list || []) {
      const value = cleanText(raw);
      const key = value.toLowerCase();
      if (!value || seen.has(key)) continue;
      seen.add(key);
      out.push(value);
    }
  }
  return out;
}

module.exports = { cleanText, normaliseForHash, dedupeHash, mergeSources, unionSkills };
