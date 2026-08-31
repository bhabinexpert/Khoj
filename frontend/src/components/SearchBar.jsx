import { useEffect, useState } from 'react';
import { CloseIcon, FilterIcon, SearchIcon } from './Icons.jsx';
import { SORT_LABELS } from '../lib/format.js';

/**
 * Keyword box + sort. The value is lifted so the URL stays the single source of
 * truth for a search; this component only debounces the typing (see
 * `useDebounce` in the page) and never fetches anything itself.
 */
export function SearchBar({ value, onChange, sort, onSortChange, sortOptions = [], total = null, onOpenFilters }) {
  // A local mirror keeps typing responsive even while a request is in flight.
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);

  function submit(event) {
    event.preventDefault();
    onChange(text.trim());
  }

  return (
    <form onSubmit={submit} className="card flex flex-col gap-2.5 p-2.5 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          type="search"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            onChange(event.target.value);
          }}
          placeholder="Search by title, skill or company, e.g. React intern, accountant, Pokhara"
          aria-label="Search jobs"
          className="field border-transparent bg-ink-50 pl-9 pr-9 shadow-none focus:bg-white"
        />
        {text ? (
          <button
            type="button"
            onClick={() => {
              setText('');
              onChange('');
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {total !== null ? (
          <p className="tabular hidden whitespace-nowrap px-1 text-xs font-medium text-ink-500 sm:block" aria-live="polite">
            {total.toLocaleString()} {total === 1 ? 'job' : 'jobs'}
          </p>
        ) : null}

        <label className="sr-only" htmlFor="sort">
          Sort results
        </label>
        <select
          id="sort"
          value={sort}
          onChange={(event) => onSortChange(event.target.value)}
          className="field field-sm w-auto py-2.5 font-medium"
        >
          {(sortOptions.length ? sortOptions : Object.keys(SORT_LABELS)).map((option) => (
            <option key={option} value={option}>
              {SORT_LABELS[option] || option}
            </option>
          ))}
        </select>

        <button type="button" onClick={onOpenFilters} className="btn-secondary btn-sm lg:hidden">
          <FilterIcon className="h-3.5 w-3.5" /> Filters
        </button>
      </div>

      {total !== null ? (
        <p className="tabular text-xs font-medium text-ink-500 sm:hidden" aria-live="polite">
          {total.toLocaleString()} {total === 1 ? 'job' : 'jobs'}
        </p>
      ) : null}
    </form>
  );
}
