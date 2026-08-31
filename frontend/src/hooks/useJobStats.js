import { useCallback, useEffect, useState } from 'react';
import { getStats, isAbort } from '../api/client.js';

/**
 * `GET /api/jobs/stats`. Never fatal: the landing page and feed header both
 * degrade to em-dashes rather than an error state, because a count is decoration
 * around the thing people came for.
 */
export function useJobStats({ enabled = true } = {}) {
  const [stats, setStats] = useState(null);
  const [token, setToken] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    let cancelled = false;

    getStats({ signal: controller.signal })
      .then((response) => {
        if (!cancelled) setStats(response);
      })
      .catch((error) => {
        if (cancelled || isAbort(error)) return;
        setStats(null);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, token]);

  return { stats, reload: useCallback(() => setToken((value) => value + 1), []) };
}
