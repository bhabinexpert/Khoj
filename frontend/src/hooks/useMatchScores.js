import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAbort, scoreMatchBatch } from '../api/client.js';
import { useCv } from './useCv.js';

/**
 * Score a list of jobs against the CV in localStorage.
 *
 * One batched request per page of results, keyed by job id so a card can look
 * its badge up in O(1). Results are cached for the lifetime of the page and
 * invalidated whenever the CV itself changes, so paging back and forth or
 * opening a job you already saw costs nothing.
 */
export function useMatchScores(jobIds) {
  const { cv, hasCv, cvKey } = useCv();
  const cache = useRef({ key: '', scores: {} });

  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [engine, setEngine] = useState(null);

  const idsKey = useMemo(
    () => [...new Set((jobIds || []).filter(Boolean))].sort().join(','),
    [jobIds],
  );

  useEffect(() => {
    if (!hasCv) {
      cache.current = { key: '', scores: {} };
      setScores({});
      setError(null);
      return undefined;
    }

    if (cache.current.key !== cvKey) cache.current = { key: cvKey, scores: {} };

    const ids = idsKey ? idsKey.split(',') : [];
    const missing = ids.filter((id) => !(id in cache.current.scores));
    if (!missing.length) {
      setScores({ ...cache.current.scores });
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError(null);

    scoreMatchBatch({ cv, jobIds: missing }, { signal: controller.signal })
      .then((response) => {
        if (cancelled) return;
        Object.assign(cache.current.scores, response.data);
        setScores({ ...cache.current.scores });
        if (response.meta?.engine) setEngine(response.meta.engine);
      })
      .catch((err) => {
        if (cancelled || isAbort(err)) return;
        // A scoring outage must not take the job feed down with it: the cards
        // simply render without badges and this message goes in the sidebar.
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cv, cvKey, hasCv, idsKey]);

  const scoreFor = useCallback((jobId) => scores[jobId] ?? null, [scores]);

  return { scores, scoreFor, loading, error, engine, enabled: hasCv };
}
