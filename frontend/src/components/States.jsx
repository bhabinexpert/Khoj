import { RefreshIcon, Spinner } from './Icons.jsx';
import { cn } from '../lib/cn.js';

/** A grey block that stands in for content while a request is in flight. */
export function Skeleton({ className = '' }) {
  return <div className={cn('skeleton', className)} />;
}

/** Card-shaped placeholders, sized to roughly match a real job card. */
export function JobCardSkeleton() {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
          <div className="space-y-2 pt-1">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-11/12" />
          </div>
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        </div>
        <Skeleton className="h-14 w-16 shrink-0 rounded-xl" />
      </div>
    </div>
  );
}

export function JobListSkeleton({ count = 5 }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading jobs…</span>
      {Array.from({ length: count }, (_, i) => (
        <JobCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function InlineSpinner({ label = 'Loading…' }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500">
      <Spinner className="h-4 w-4" />
      {label}
    </span>
  );
}

export function EmptyState({ title, hint, icon = null, action = null }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
      {icon ? (
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-ink-50 text-ink-300 ring-1 ring-inset ring-ink-200">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {hint ? <p className="max-w-md text-sm leading-relaxed text-ink-500">{hint}</p> : null}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

/**
 * Errors are shown, never swallowed. `ApiError.isTransient` decides whether a
 * retry button is worth offering.
 */
export function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  const message = error?.message || 'Unexpected error.';
  const retryable = error?.isTransient ?? true;

  return (
    <div className="rounded-xl border border-red-200 bg-red-50/70 px-5 py-8 text-center">
      <h3 className="text-base font-semibold text-red-900">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-lg text-sm leading-relaxed text-red-800">{message}</p>
      {error?.status ? <p className="mt-1 text-xs font-medium text-red-700/70">HTTP {error.status}</p> : null}
      {onRetry && retryable ? (
        <button type="button" className="btn-secondary btn-sm mt-5" onClick={onRetry}>
          <RefreshIcon className="h-3.5 w-3.5" /> Try again
        </button>
      ) : null}
    </div>
  );
}

/** A dismissible one-line notice — used for partial failures and warnings. */
export function Notice({ tone = 'info', children, onDismiss }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warn: 'border-amber-200 bg-amber-50 text-amber-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-4 py-3 text-sm', tones[tone] || tones.info)}>
      <div className="flex-1">{children}</div>
      {onDismiss ? (
        <button type="button" onClick={onDismiss} className="shrink-0 text-xs font-semibold underline">
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
