import { useEffect, useState } from 'react';
import { RefreshIcon } from './Icons.jsx';
import { cn } from '../lib/cn.js';

/**
 * The feed's freshness line, and the one piece of UI that has to be honest about
 * a distributed system: the dot is green only while an `EventSource` is actually
 * open, because a green dot next to a stale list is worse than no dot at all.
 * When the stream is down the same line still reports the polling floor, so the
 * reader knows the feed is being checked either way.
 */

/** Coarse on purpose — "44s ago" ticking one second at a time is noise. */
function since(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 15) return 'just now';
  if (seconds < 60) return `${Math.round(seconds / 15) * 15}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

/** Re-render on a cadence rather than storing a formatted string that goes stale. */
function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function LiveStatus({ connected, lastCheckedAt, refreshing = false, pending = 0, onShowNew }) {
  const now = useNow();
  const checked = lastCheckedAt ? since(now - lastCheckedAt) : null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span
        className={cn(
          'inline-flex items-center gap-1.5 font-medium',
          connected ? 'text-emerald-700' : 'text-ink-500',
        )}
        title={
          connected
            ? 'Connected to the live stream. New postings appear as they are ingested.'
            : 'The live stream is not connected; the feed is being refreshed on a timer instead.'
        }
      >
        <span className="relative grid h-2 w-2 place-items-center">
          {connected ? (
            <span className="absolute inline-block h-2 w-2 animate-ping rounded-full bg-emerald-500/70 motion-reduce:animate-none" />
          ) : null}
          <span
            className={cn(
              'inline-block h-2 w-2 rounded-full',
              connected ? 'bg-emerald-500' : 'bg-ink-300 ring-1 ring-inset ring-ink-400',
            )}
          />
        </span>
        {connected ? 'Live' : 'Checking periodically'}
      </span>

      <span className="text-ink-400" aria-live="polite">
        {refreshing ? (
          <span className="inline-flex items-center gap-1.5 text-ink-500">
            <RefreshIcon className="h-3 w-3 animate-spin motion-reduce:animate-none" /> refreshing
          </span>
        ) : (
          checked && `checked ${checked}`
        )}
      </span>

      {pending > 0 ? (
        <button
          type="button"
          onClick={onShowNew}
          className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-1 font-semibold text-white shadow-xs transition-colors hover:bg-brand-700"
        >
          <RefreshIcon className="h-3 w-3" />
          {pending} new {pending === 1 ? 'posting' : 'postings'}: show
        </button>
      ) : null}
    </div>
  );
}
