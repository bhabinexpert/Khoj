import { useEffect, useRef, useState } from 'react';

import { openJobStream } from '../api/client.js';

/**
 * "The feed is live" — two mechanisms, deliberately.
 *
 * 1. **SSE** (`/api/jobs/stream`): the backend announces an ingest the instant it
 *    lands, so in the normal case a new posting is visible within a second.
 * 2. **Polling** every {@link DEFAULT_POLL_MS} as a floor, because SSE can fail in
 *    ways `EventSource` does not report — a buffering proxy, a laptop waking from
 *    sleep, or an API running more than one process (the event bus is
 *    per-process, see services/jobEvents.js).
 *
 * Both are suspended while the tab is hidden and fire once on the way back in: a
 * tab left open overnight should refresh when you return to it, not 500 times
 * while you were asleep.
 *
 * `onTick` means "something may have changed, decide what to do". It is read
 * through a ref, so passing a fresh closure each render does not restart the
 * stream or the timer. It receives the server's own event when the tick came
 * from the stream — `{ inserted, updated, merged, at }` — and `null` when it
 * came from the timer or the tab regaining focus, where nothing has told us
 * whether anything actually changed.
 */
const DEFAULT_POLL_MS = 60000;

export function useLiveJobs(onTick, { enabled = true, pollMs = DEFAULT_POLL_MS } = {}) {
  const tick = useRef(onTick);
  tick.current = onTick;

  // `connected` drives the "Live" dot; it must never claim a stream we do not
  // have, so it starts false and only the server's own hello turns it on.
  const [connected, setConnected] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled) {
      setConnected(false);
      return undefined;
    }

    const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const run = (event = null) => {
      if (hidden()) return;
      setLastCheckedAt(Date.now());
      tick.current?.(event);
    };

    const source = openJobStream();
    if (source) {
      source.addEventListener('hello', () => setConnected(true));
      source.addEventListener('jobs:changed', (message) => {
        // The payload is counts only, never job documents — the client refetches
        // through its own filtered query. Malformed JSON must not kill the tick.
        let event = null;
        try {
          event = JSON.parse(message.data);
        } catch {
          event = null;
        }
        run(event);
      });
      source.onopen = () => setConnected(true);
      // EventSource reconnects on its own; this only stops the UI saying "live"
      // while the connection is actually down.
      source.onerror = () => setConnected(false);
    }

    const timer = setInterval(run, pollMs);
    const onVisible = () => run();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      source?.close();
    };
  }, [enabled, pollMs]);

  return { connected, lastCheckedAt };
}
