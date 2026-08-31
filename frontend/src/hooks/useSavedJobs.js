import { useCallback, useMemo } from 'react';
import { createLocalStore } from '../lib/localStore.js';
import { useStore } from './useStore.js';

const STORAGE_KEY = 'khoj.savedJobs.v1';

/** Just the ids, per spec — the listings themselves are re-fetched by id. */
const savedStore = createLocalStore(STORAGE_KEY, []);

export function useSavedJobs() {
  const [ids, setIds] = useStore(savedStore);
  const list = Array.isArray(ids) ? ids : [];

  const toggle = useCallback(
    (jobId) => {
      if (!jobId) return;
      setIds((current) => {
        const arr = Array.isArray(current) ? current : [];
        // Newest first, so the saved page reads like a reverse-chronological list.
        return arr.includes(jobId) ? arr.filter((id) => id !== jobId) : [jobId, ...arr];
      });
    },
    [setIds],
  );

  const remove = useCallback(
    (jobId) => setIds((current) => (Array.isArray(current) ? current : []).filter((id) => id !== jobId)),
    [setIds],
  );

  const clear = useCallback(() => setIds([]), [setIds]);

  const set = useMemo(() => new Set(list), [list]);

  return {
    savedIds: list,
    count: list.length,
    isSaved: useCallback((jobId) => set.has(jobId), [set]),
    toggle,
    remove,
    clear,
  };
}
