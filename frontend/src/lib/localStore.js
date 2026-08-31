/**
 * A `useState`-shaped hook backed by localStorage, shared across every
 * component that uses it (and across browser tabs).
 *
 * Khoj has no accounts, so localStorage *is* the database for anything
 * personal: the parsed CV and the saved-jobs list. A module-level subscriber
 * set keeps the header badge, the job cards and the CV page in sync without
 * wrapping the tree in a provider per concern.
 */

function readRaw(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch {
    // Corrupt JSON, or storage blocked entirely (Safari private mode).
    return fallback;
  }
}

export function createLocalStore(key, fallback) {
  const listeners = new Set();
  let cache = readRaw(key, fallback);
  let available = true;

  function emit() {
    for (const listener of listeners) listener(cache);
  }

  function get() {
    return cache;
  }

  function set(next) {
    const value = typeof next === 'function' ? next(cache) : next;
    cache = value;
    try {
      if (value === null || value === undefined) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Out of quota or storage disabled: keep working in memory for this
      // session and let the UI say so instead of throwing mid-render.
      available = false;
    }
    emit();
  }

  // Another tab changed the same key — adopt its value.
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (event) => {
      if (event.key !== key) return;
      cache = readRaw(key, fallback);
      emit();
    });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { get, set, subscribe, isAvailable: () => available, key };
}
