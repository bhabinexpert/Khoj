import { CloseIcon } from './Icons.jsx';
import { EDUCATION_LABELS, EXPERIENCE_LABELS, JOB_TYPE_LABELS, labelFor, platformLabel } from '../lib/format.js';

function CheckboxGroup({ title, options, selected, labels, formatLabel, onToggle }) {
  if (!options?.length) return null;
  const chosen = new Set(selected);

  return (
    <fieldset className="border-t border-ink-200 px-4 py-3 first:border-t-0">
      <legend className="label mb-2">{title}</legend>
      <div className="space-y-1.5">
        {options.map((option) => (
          <label
            key={option}
            className="-mx-1.5 flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink-700 transition-colors hover:bg-ink-50 hover:text-ink-900"
          >
            <input
              type="checkbox"
              checked={chosen.has(option)}
              onChange={() => onToggle(option)}
              className="checkbox"
            />
            <span>{formatLabel ? formatLabel(option) : labelFor(labels || {}, option, option)}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const EMPTY = [];

/**
 * Filter panel. Every option list comes from `GET /api/jobs/filters`, so the UI
 * can only offer values the database actually holds — no dead filters that
 * always return nothing.
 */
export function FilterSidebar({ options, filters, onChange, onReset, activeCount = 0, open = false, onClose }) {
  const toggle = (key) => (value) => {
    const current = filters[key] || EMPTY;
    onChange({
      [key]: current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  const panel = (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-ink-200 bg-ink-50/80 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-900">
          Filters
          {activeCount ? (
            <span className="chip-pill bg-brand-600 text-white">{activeCount}</span>
          ) : null}
        </h2>
        <div className="flex items-center gap-1">
          {activeCount ? (
            <button type="button" onClick={onReset} className="text-xs font-semibold text-brand-700 transition-colors hover:text-brand-800">
              Clear all
            </button>
          ) : null}
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close filters" className="btn-ghost p-1.5 lg:hidden">
              <CloseIcon className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="px-4 py-3">
        <label className="label" htmlFor="filter-location">
          Location
        </label>
        <input
          id="filter-location"
          list="filter-location-options"
          value={filters.location || ''}
          onChange={(event) => onChange({ location: event.target.value })}
          placeholder="Anywhere in Nepal"
          className="field field-sm"
        />
        <datalist id="filter-location-options">
          {(options?.locations || EMPTY).map((location) => (
            <option key={location} value={location} />
          ))}
        </datalist>
      </div>

      <div className="border-t border-ink-200 px-4 py-3">
        <label className="label" htmlFor="filter-company">
          Company
        </label>
        <input
          id="filter-company"
          value={filters.company || ''}
          onChange={(event) => onChange({ company: event.target.value })}
          placeholder="Any employer"
          className="field field-sm"
        />
      </div>

      <CheckboxGroup
        title="Job type"
        options={options?.jobTypes}
        selected={filters.jobType}
        labels={JOB_TYPE_LABELS}
        onToggle={toggle('jobType')}
      />
      <CheckboxGroup
        title="Experience level"
        options={options?.experienceLevels}
        selected={filters.experienceLevel}
        labels={EXPERIENCE_LABELS}
        onToggle={toggle('experienceLevel')}
      />
      <CheckboxGroup
        title="Minimum education"
        options={options?.educationLevels}
        selected={filters.educationRequirement}
        labels={EDUCATION_LABELS}
        onToggle={toggle('educationRequirement')}
      />
      <CheckboxGroup
        title="Source"
        options={options?.sourcePlatforms}
        selected={filters.source}
        formatLabel={platformLabel}
        onToggle={toggle('source')}
      />

      <fieldset className="border-t border-ink-200 px-4 py-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={Boolean(filters.includeExpired)}
            onChange={(event) => onChange({ includeExpired: event.target.checked })}
            className="checkbox mt-0.5"
          />
          <span>
            Include closed postings
            <span className="hint block">Deadlines more than a week past are hidden by default.</span>
          </span>
        </label>
      </fieldset>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:w-72 lg:shrink-0">
        <div className="lg:sticky lg:top-20">{panel}</div>
      </aside>

      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close filters"
            className="animate-in fade-in absolute inset-0 bg-ink-950/50 backdrop-blur-sm duration-200"
            onClick={onClose}
          />
          <div className="animate-in slide-in-from-left absolute inset-y-0 left-0 w-[min(20rem,90vw)] overflow-y-auto bg-ink-100 p-3 shadow-pop duration-200">
            {panel}
          </div>
        </div>
      ) : null}
    </>
  );
}
