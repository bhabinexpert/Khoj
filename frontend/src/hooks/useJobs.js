import { useCallback, useEffect, useRef, useState } from 'react';
import { getFilterOptions, getJob, isAbort, listJobs } from '../api/client.js';

/**
 * `GET /api/jobs` with abort-on-change, so a fast typist never sees the results
 * of an older request land after a newer one.
 *
 * `reload({ background: true })` refetches without tearing the list down: the
 * current results stay on screen and only `refreshing` flips. That is what the
 * live feed uses — replacing the page with a skeleton every time an ingest lands
 * would be a worse experience than being a minute stale. A plain `reload()`, or
 * any change to the query, still shows the skeleton, because then the list on
 * screen genuinely no longer answers the question being asked.
 */
export function useJobList(params) {
  const key = JSON.stringify(params);
  const [state, setState] = useState({
    jobs: [],
    pagination: null,
    meta: null,
    loading: true,
    refreshing: false,
    error: null,
  });
  const [reloadToken, setReloadToken] = useState(0);

  // Set by `reload`, read by the effect. A ref rather than state so requesting a
  // background refresh does not itself cause a render, and so StrictMode's
  // double-invoked effect sees the same value both times.
  const backgroundRef = useRef(false);
  const lastKeyRef = useRef(key);

  useEffect(() => {
    // Only a reload can be "background". If the query changed, the results on
    // screen are for a different question and have to go.
    const background = backgroundRef.current && lastKeyRef.current === key;
    lastKeyRef.current = key;

    const controller = new AbortController();
    // Per-effect flag rather than a mount ref: StrictMode's mount/unmount/remount
    // would leave a shared ref stuck at "unmounted" and swallow every update.
    let cancelled = false;
    setState((prev) => ({
      ...prev,
      loading: !background,
      refreshing: background,
      error: background ? prev.error : null,
    }));

    listJobs(params, { signal: controller.signal })
      .then((response) => {
        if (cancelled) return;
        setState({
          jobs: response.data || [],
          pagination: response.pagination || null,
          meta: response.meta || null,
          loading: false,
          refreshing: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled || isAbort(error)) return;
        // A failed background poll must not wipe a list that is merely stale —
        // the network dropping out is not a reason to empty the screen.
        if (background) {
          setState((prev) => ({ ...prev, loading: false, refreshing: false }));
          return;
        }
        setState({ jobs: [], pagination: null, meta: null, loading: false, refreshing: false, error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // `key` is the serialised params: a new object with the same values must not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadToken]);

  const reload = useCallback((options) => {
    backgroundRef.current = options?.background === true;
    setReloadToken((t) => t + 1);
  }, []);

  return { ...state, reload };
}

/** `GET /api/jobs/:id`. A 404 surfaces as `error.status === 404`. */
export function useJob(id) {
  const [state, setState] = useState({ job: null, loading: true, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    if (!id) {
      setState({ job: null, loading: false, error: null });
      return undefined;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState({ job: null, loading: true, error: null });

    getJob(id, { signal: controller.signal })
      .then((response) => {
        if (!cancelled) setState({ job: response.data || null, loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled || isAbort(error)) return;
        setState({ job: null, loading: false, error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [id, reloadToken]);

  return { ...state, reload: useCallback(() => setReloadToken((t) => t + 1), []) };
}

/**
 * `GET /api/jobs/filters` — fetched once per mount. Filter options failing is
 * not fatal: the feed still works, it just offers no checkboxes.
 */
export function useFilterOptions() {
  const [options, setOptions] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    getFilterOptions({ signal: controller.signal })
      .then((response) => {
        // This endpoint returns the option lists at the top level, no envelope.
        if (!cancelled) setOptions(response);
      })
      .catch(() => {
        if (!cancelled) setOptions(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  return options;
}
