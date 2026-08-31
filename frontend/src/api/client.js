/**
 * The single place that knows how to talk to the backend.
 *
 * Everything here is public — Khoj has no accounts, so there are no
 * tokens, no cookies and no `credentials: 'include'`. The CV never leaves the
 * browser except as the body of a scoring request, and the backend explicitly
 * does not persist it (see `meta.persisted` on the parse response).
 */

const BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

/** Max jobs the backend's `POST /api/match/batch` accepts in one call. */
export const MATCH_BATCH_LIMIT = 50;

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'request_failed', details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True for the cases where retrying the same call could plausibly work. */
  get isTransient() {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}

/** An aborted fetch is a normal part of typing in a search box, not an error. */
export function isAbort(error) {
  return error?.name === 'AbortError';
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === false) continue;
    if (Array.isArray(value)) {
      const joined = value.filter(Boolean).join(',');
      if (joined) search.set(key, joined);
    } else {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query ? `?${query}` : '';
}

async function request(path, { method = 'GET', body, signal, formData } = {}) {
  const init = { method, signal, headers: {} };

  if (formData) {
    // Let the browser set the multipart boundary itself.
    init.body = formData;
  } else if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${BASE}${path}`, init);
  } catch (error) {
    if (isAbort(error)) throw error;
    throw new ApiError(
      'Could not reach the Khoj API. Check that the backend is running.',
      { code: 'network_error' },
    );
  }

  const payload = await readBody(response);

  if (!response.ok) {
    const error = payload?.error || {};
    throw new ApiError(error.message || `Request failed with status ${response.status}`, {
      status: response.status,
      code: error.code || 'http_error',
      details: error.details ?? payload ?? null,
    });
  }

  return payload ?? {};
}

async function readBody(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A proxy or nginx error page — surface something readable rather than a
    // JSON parse exception from deep inside the client.
    return { error: { code: 'bad_response', message: text.slice(0, 300) } };
  }
}

// jobs

/**
 * `GET /api/jobs` → `{ data, pagination, meta }`.
 *
 * Accepts `q, location, company, jobType, experienceLevel, educationRequirement,
 * source, skills, includeExpired, sort, page, limit`. Array values (`jobType`,
 * `skills`, …) are comma-joined, which is what the backend parses.
 */
export function listJobs(params = {}, options = {}) {
  return request(`/jobs${buildQuery(params)}`, options);
}

/** `GET /api/jobs/filters` → the option lists that populate the sidebar. */
export function getFilterOptions(options = {}) {
  return request('/jobs/filters', options);
}

/**
 * `GET /api/jobs/stats` → `{ total, freshToday, openNow, byJobType,
 * bySourcePlatform, platforms, lastIngestAt, serverTime }` (no envelope).
 */
export function getStats(options = {}) {
  return request('/jobs/stats', options);
}

/**
 * `GET /api/jobs/stream` — an `EventSource` over the ingest notification stream.
 *
 * Returned rather than subscribed to here so the caller owns the lifetime; call
 * `.close()` on unmount. EventSource reconnects by itself, so a backend restart
 * heals without any retry logic on this side.
 */
export function openJobStream() {
  if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return null;
  try {
    return new EventSource(`${BASE}/jobs/stream`);
  } catch {
    return null;
  }
}

/** `GET /api/jobs/:id` → `{ data }`. */
export function getJob(id, options = {}) {
  return request(`/jobs/${encodeURIComponent(id)}`, options);
}

// cv

/**
 * `POST /api/cv/parse` (multipart, field name `file`) → `{ data: { cv, meta } }`.
 * The parsed CV is returned to the caller and stored only in localStorage.
 */
export function parseCv(file, options = {}) {
  const formData = new FormData();
  formData.append('file', file, file.name);
  return request('/cv/parse', { ...options, method: 'POST', formData });
}

// match

/** `POST /api/match/score` with `{ cv, jobId }` or `{ cv, job }` → `{ data }`. */
export function scoreMatch({ cv, jobId, job }, options = {}) {
  const body = jobId ? { cv, jobId } : { cv, job };
  return request('/match/score', { ...options, method: 'POST', body });
}

/**
 * `POST /api/match/batch` → `{ data: { [jobId]: result }, meta }`.
 *
 * The backend caps a batch at {@link MATCH_BATCH_LIMIT} jobs, so a page of 100
 * listings is split into chunks here and the maps are merged back together.
 */
export async function scoreMatchBatch({ cv, jobIds }, options = {}) {
  const ids = [...new Set((jobIds || []).filter(Boolean))];
  if (!ids.length) return { data: {}, meta: { requested: 0, scored: 0, engine: null } };

  const chunks = [];
  for (let i = 0; i < ids.length; i += MATCH_BATCH_LIMIT) {
    chunks.push(ids.slice(i, i + MATCH_BATCH_LIMIT));
  }

  const responses = await Promise.all(
    chunks.map((chunk) =>
      request('/match/batch', { ...options, method: 'POST', body: { cv, jobIds: chunk } }),
    ),
  );

  const data = {};
  let scored = 0;
  for (const response of responses) {
    Object.assign(data, response.data || {});
    scored += response.meta?.scored || 0;
  }
  return {
    data,
    meta: { requested: ids.length, scored, engine: responses[0]?.meta?.engine ?? null },
  };
}
