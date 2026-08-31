import { ArrowLeftIcon, ArrowRightIcon } from './Icons.jsx';

/** Page controls for `GET /api/jobs`'s `{page, totalPages, hasNextPage}`. */
export function Pagination({ pagination, onPageChange }) {
  if (!pagination) return null;
  const { page, totalPages, total, limit, hasNextPage, hasPrevPage } = pagination;
  if (!total || totalPages <= 1) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 border-t border-ink-200 pt-4 sm:flex-row"
      aria-label="Pagination"
    >
      <p className="text-xs text-ink-500">
        Showing <span className="tabular font-semibold text-ink-700">{first.toLocaleString()}</span>–
        <span className="tabular font-semibold text-ink-700">{last.toLocaleString()}</span> of{' '}
        <span className="tabular">{total.toLocaleString()}</span>
      </p>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!hasPrevPage}
          onClick={() => onPageChange(page - 1)}
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" /> Previous
        </button>
        <span className="tabular px-1 text-xs font-medium text-ink-500">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={!hasNextPage}
          onClick={() => onPageChange(page + 1)}
        >
          Next <ArrowRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </nav>
  );
}
