import { useCallback, useMemo } from 'react';
import { createLocalStore } from '../lib/localStore.js';
import { useStore } from './useStore.js';

const STORAGE_KEY = 'khoj.cv.v1';

/**
 * The parsed CV lives here and nowhere else — the backend forwards the upload
 * to ml-service, returns the JSON and forgets it. Clearing this key is the
 * complete and only "delete my data" operation the product needs.
 */
const cvStore = createLocalStore(STORAGE_KEY, null);

/** A cheap identity for the CV, used to invalidate cached match scores. */
function fingerprint(cv) {
  if (!cv) return '';
  return [
    (cv.skills || []).join('|').toLowerCase(),
    cv.totalExperienceMonths ?? 0,
    cv.highestEducation || 'unspecified',
  ].join('::');
}

export function useCv() {
  const [record, setRecord] = useStore(cvStore);

  const cv = record?.cv ?? null;
  const meta = record?.meta ?? null;

  const save = useCallback(
    (nextCv, nextMeta) => {
      setRecord({ cv: nextCv, meta: nextMeta ?? null, savedAt: new Date().toISOString() });
    },
    [setRecord],
  );

  /** Editing the preview keeps the original parse metadata for context. */
  const update = useCallback(
    (patch) => {
      setRecord((current) => {
        if (!current?.cv) return current;
        const nextCv = typeof patch === 'function' ? patch(current.cv) : { ...current.cv, ...patch };
        return { ...current, cv: nextCv, editedAt: new Date().toISOString() };
      });
    },
    [setRecord],
  );

  const clear = useCallback(() => setRecord(null), [setRecord]);

  return useMemo(
    () => ({
      cv,
      meta,
      savedAt: record?.savedAt ?? null,
      editedAt: record?.editedAt ?? null,
      hasCv: Boolean(cv && (cv.skills?.length || cv.experience?.length || cv.education?.length)),
      cvKey: fingerprint(cv),
      storageAvailable: cvStore.isAvailable(),
      save,
      update,
      clear,
    }),
    [cv, meta, record, save, update, clear],
  );
}
