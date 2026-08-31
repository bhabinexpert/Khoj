import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { JobCard } from '../components/JobCard.jsx';
import { EmptyState, JobListSkeleton, Notice } from '../components/States.jsx';
import { ArrowRightIcon, BookmarkIcon } from '../components/Icons.jsx';
import { getJob, isAbort } from '../api/client.js';
import { useMatchScores } from '../hooks/useMatchScores.js';
import { useSavedJobs } from '../hooks/useSavedJobs.js';

/**
 * Saved jobs are just ids in localStorage, so the listings are re-fetched here.
 * A posting that has since been removed 404s — that id is reported and can be
 * cleared, rather than silently vanishing or breaking the page.
 */
function useSavedJobDocuments(ids) {
  const key = ids.join(',');
  const [state, setState] = useState({ jobs: [], missing: [], loading: ids.length > 0, error: null });

  useEffect(() => {
    if (!ids.length) {
      setState({ jobs: [], missing: [], loading: false, error: null });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    Promise.allSettled(ids.map((id) => getJob(id, { signal: controller.signal })))
      .then((results) => {
        if (cancelled) return;
        const jobs = [];
        const missing = [];
        let error = null;

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            if (result.value?.data) jobs.push(result.value.data);
            return;
          }
          const reason = result.reason;
          if (isAbort(reason)) return;
          if (reason?.status === 404 || reason?.status === 400) missing.push(ids[index]);
          else error = reason;
        });

        setState({ jobs, missing, loading: false, error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}

export default function SavedJobsPage() {
  const { savedIds, isSaved, toggle, remove, clear } = useSavedJobs();
  const { jobs, missing, loading, error } = useSavedJobDocuments(savedIds);

  // Keep the display order the same as the save order (newest first).
  const ordered = useMemo(() => {
    const byId = new Map(jobs.map((job) => [job.id, job]));
    return savedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [jobs, savedIds]);

  const jobIds = useMemo(() => ordered.map((job) => job.id), [ordered]);
  const matches = useMatchScores(jobIds);

  if (!savedIds.length) {
    return (
      <EmptyState
        icon={<BookmarkIcon className="h-10 w-10" />}
        title="No saved jobs yet"
        hint="Tap the bookmark on any listing to keep it here. Saved jobs live in this browser only, with no account and no sync."
        action={
          <Link to="/jobs" className="btn-primary">
            Browse jobs
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-ink-200 pb-4">
        <div>
          <p className="eyebrow">This browser only</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink-900">Saved jobs</h1>
          <p className="mt-1 text-sm text-ink-600">
            <span className="tabular font-semibold text-ink-800">{savedIds.length}</span> saved in this browser.{' '}
            {matches.enabled ? 'Scored against your CV.' : (
              <Link to="/cv" className="link inline-flex items-center gap-1">
                Upload a CV to score them <ArrowRightIcon className="h-3.5 w-3.5" />
              </Link>
            )}
          </p>
        </div>
        <button
          type="button"
          className="btn-secondary btn-sm text-red-700 hover:border-red-300 hover:bg-red-50"
          onClick={() => {
            if (window.confirm('Remove all saved jobs?')) clear();
          }}
        >
          Clear all
        </button>
      </header>

      {error ? (
        <Notice tone="warn">Some saved jobs could not be loaded ({error.message}).</Notice>
      ) : null}

      {missing.length ? (
        <Notice tone="warn">
          {missing.length} saved {missing.length === 1 ? 'posting is' : 'postings are'} no longer listed. Sources remove
          jobs once they close.{' '}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => missing.forEach(remove)}
          >
            Remove {missing.length === 1 ? 'it' : 'them'}
          </button>
        </Notice>
      ) : null}

      {loading ? <JobListSkeleton count={Math.min(savedIds.length, 4)} /> : null}

      {!loading && ordered.length ? (
        <div className="space-y-3">
          {ordered.map((job) => (
            <JobCard
              key={job.id}
              job={job}
              score={matches.scoreFor(job.id)}
              scoreLoading={matches.loading}
              scoringEnabled={matches.enabled}
              saved={isSaved(job.id)}
              onToggleSave={toggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
