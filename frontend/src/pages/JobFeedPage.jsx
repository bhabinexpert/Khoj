import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilterSidebar } from '../components/FilterSidebar.jsx';
import { JobCard } from '../components/JobCard.jsx';
import { LiveStatus } from '../components/LiveStatus.jsx';
import { Pagination } from '../components/Pagination.jsx';
import { SearchBar } from '../components/SearchBar.jsx';
import { EmptyState, ErrorState, JobListSkeleton, Notice } from '../components/States.jsx';
import { ArrowRightIcon, SearchIcon, SparkleIcon } from '../components/Icons.jsx';
import { useDebounce } from '../hooks/useDebounce.js';
import { useCv } from '../hooks/useCv.js';
import { useFilterOptions, useJobList } from '../hooks/useJobs.js';
import { useLiveJobs } from '../hooks/useLiveJobs.js';
import { useMatchScores } from '../hooks/useMatchScores.js';
import { useSavedJobs } from '../hooks/useSavedJobs.js';

/** Params that hold several comma-separated values. */
const LIST_KEYS = ['jobType', 'experienceLevel', 'educationRequirement', 'source'];

function readFilters(params) {
  const filters = { location: params.get('location') || '', company: params.get('company') || '' };
  for (const key of LIST_KEYS) {
    const raw = params.get(key);
    filters[key] = raw ? raw.split(',').filter(Boolean) : [];
  }
  filters.includeExpired = params.get('includeExpired') === 'true';
  return filters;
}

function countActive(filters) {
  return (
    LIST_KEYS.reduce((total, key) => total + (filters[key]?.length || 0), 0) +
    (filters.location ? 1 : 0) +
    (filters.company ? 1 : 0) +
    (filters.includeExpired ? 1 : 0)
  );
}

export default function JobFeedPage() {
  const [params, setParams] = useSearchParams();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filters = useMemo(() => readFilters(params), [params]);
  const activeCount = countActive(filters);
  const sort = params.get('sort') || '';
  const page = Math.max(Number.parseInt(params.get('page'), 10) || 1, 1);

  /** Merge a patch into the query string; `null` removes a key. */
  const patch = useCallback(
    (next, { replace = false, resetPage = true } = {}) => {
      setParams(
        (current) => {
          const merged = new URLSearchParams(current);
          for (const [key, value] of Object.entries(next)) {
            const serialised = Array.isArray(value) ? value.join(',') : value;
            if (serialised === null || serialised === undefined || serialised === '' || serialised === false) {
              merged.delete(key);
            } else {
              merged.set(key, String(serialised));
            }
          }
          if (resetPage && !('page' in next)) merged.delete('page');
          return merged;
        },
        { replace },
      );
    },
    [setParams],
  );

  // Typing is mirrored locally and pushed to the URL once it settles, so the
  // address bar stays shareable without a history entry per keystroke.
  const [keyword, setKeyword] = useState(params.get('q') || '');
  const debouncedKeyword = useDebounce(keyword, 400);
  useEffect(() => {
    if (debouncedKeyword === (params.get('q') || '')) return;
    patch({ q: debouncedKeyword || null }, { replace: true });
  }, [debouncedKeyword, params, patch]);

  const query = useMemo(
    () => ({
      q: params.get('q') || undefined,
      location: filters.location || undefined,
      company: filters.company || undefined,
      jobType: filters.jobType,
      experienceLevel: filters.experienceLevel,
      educationRequirement: filters.educationRequirement,
      source: filters.source,
      includeExpired: filters.includeExpired || undefined,
      sort: sort || undefined,
      page: page > 1 ? page : undefined,
    }),
    [params, filters, sort, page],
  );

  const { jobs, pagination, meta, loading, refreshing, error, reload } = useJobList(query);
  const options = useFilterOptions();
  const { hasCv } = useCv();
  const { isSaved, toggle } = useSavedJobs();

  // Postings the server says have landed since the last time we swapped the list
  // in. Only ever set from a stream event, which carries real counts — the poll
  // tick has no idea whether anything changed, so it never claims one.
  const [pending, setPending] = useState(0);

  // A new query refetches from scratch, so whatever was queued for the old one is
  // already in the results and the count would be a lie.
  useEffect(() => {
    setPending(0);
  }, [query]);

  const onLiveTick = useCallback(
    (event) => {
      // Refreshing under someone's cursor moves the card they were reading. At the
      // top of the first page nothing is lost by swapping silently: what they are
      // looking at *is* the newest page. Anywhere else, offer it instead.
      const inPlace = page === 1 && (typeof window === 'undefined' || window.scrollY < 240);
      if (inPlace) {
        setPending(0);
        reload({ background: true });
        return;
      }
      const inserted = Number(event?.inserted) || 0;
      if (inserted > 0) setPending((count) => count + inserted);
    },
    [page, reload],
  );

  const { connected, lastCheckedAt } = useLiveJobs(onLiveTick);

  /** The "N new postings" button: newest first means page one, top of the list. */
  const showNew = useCallback(() => {
    setPending(0);
    if (page === 1) reload({ background: true });
    else patch({ page: null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [page, patch, reload]);

  const jobIds = useMemo(() => jobs.map((job) => job.id), [jobs]);
  const matches = useMatchScores(jobIds);

  function changePage(nextPage) {
    patch({ page: nextPage > 1 ? nextPage : null }, { resetPage: false });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2 border-b border-ink-200 pb-4">
        <p className="eyebrow">The feed</p>
        <h1 className="text-2xl font-bold tracking-tight text-ink-900">
          Jobs &amp; internships in Nepal, in one feed
        </h1>
        <p className="text-sm leading-relaxed text-ink-600">
          Aggregated from multiple job boards and deduplicated.{' '}
          {hasCv ? (
            <span className="text-ink-500">Scored against your CV. Expand any card to see why.</span>
          ) : (
            <Link to="/cv" className="link inline-flex items-center gap-1">
              Upload a CV to see match scores <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          )}
        </p>
        <LiveStatus
          connected={connected}
          lastCheckedAt={lastCheckedAt}
          refreshing={refreshing}
          pending={pending}
          onShowNew={showNew}
        />
      </section>

      <SearchBar
        value={keyword}
        onChange={setKeyword}
        sort={sort || (params.get('q') ? 'relevance' : 'newest')}
        onSortChange={(value) => patch({ sort: value })}
        sortOptions={options?.sortOptions}
        total={pagination?.total ?? null}
        onOpenFilters={() => setDrawerOpen(true)}
      />

      <div className="flex gap-6">
        <FilterSidebar
          options={options}
          filters={filters}
          activeCount={activeCount}
          onChange={(next) => patch(next)}
          onReset={() => setParams(params.get('q') ? { q: params.get('q') } : {})}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        <div className="min-w-0 flex-1 space-y-3">
          {meta?.warnings?.length ? (
            <Notice tone="warn">Some filters were ignored: {meta.warnings.join('; ')}</Notice>
          ) : null}

          {matches.error ? (
            <Notice tone="warn">
              Match scores are unavailable right now ({matches.error.message}). The feed below is unaffected.
            </Notice>
          ) : null}

          {hasCv && matches.engine === 'lexical' ? (
            <Notice tone="info">
              <SparkleIcon className="mr-1 inline h-4 w-4 align-text-bottom" />
              Scoring is running in lexical fallback mode. The embedding model is not loaded, so near-synonyms may be
              missed.
            </Notice>
          ) : null}

          {loading ? <JobListSkeleton /> : null}

          {!loading && error ? <ErrorState error={error} onRetry={reload} title="Could not load jobs" /> : null}

          {!loading && !error && !jobs.length ? (
            <EmptyState
              icon={<SearchIcon className="h-10 w-10" />}
              title="No jobs match your filters"
              hint={
                activeCount || params.get('q')
                  ? 'Try a broader keyword, clear a filter, or include closed postings.'
                  : 'The database is empty. Run the scraper (see the README) to populate the feed.'
              }
              action={
                activeCount || params.get('q') ? (
                  <button type="button" className="btn-secondary" onClick={() => setParams({})}>
                    Clear search and filters
                  </button>
                ) : null
              }
            />
          ) : null}

          {!loading && !error && jobs.length ? (
            <>
              <div className="space-y-3">
                {jobs.map((job) => (
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
              <Pagination pagination={pagination} onPageChange={changePage} />
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
