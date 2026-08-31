import { useState } from 'react';
import { CloseIcon, PlusIcon } from './Icons.jsx';
import { EDUCATION_LABELS, monthsToSpan } from '../lib/format.js';

const EDUCATION_LEVELS = ['unspecified', 'slc', 'diploma', 'bachelor', 'master', 'phd'];

/** Add/remove chips — used for both skills and certifications. */
function TagInput({ label, hint, values = [], onChange, placeholder }) {
  const [draft, setDraft] = useState('');

  function add() {
    const value = draft.trim();
    if (!value) return;
    const exists = values.some((v) => v.toLowerCase() === value.toLowerCase());
    if (!exists) onChange([...values, value]);
    setDraft('');
  }

  return (
    <div>
      <h3 className="label">
        {label} <span className="font-normal normal-case tracking-normal text-ink-400">({values.length})</span>
      </h3>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {values.length ? (
          values.map((value) => (
            <span key={value} className="chip bg-brand-50 py-1 pl-2.5 pr-1 text-brand-800 ring-1 ring-inset ring-brand-200">
              {value}
              <button
                type="button"
                onClick={() => onChange(values.filter((v) => v !== value))}
                aria-label={`Remove ${value}`}
                className="rounded-full p-0.5 hover:bg-brand-200/60"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          ))
        ) : (
          <p className="text-xs text-ink-400">Nothing detected. Add anything the parser missed.</p>
        )}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ',') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="field"
        />
        <button type="button" className="btn-secondary shrink-0" onClick={add} disabled={!draft.trim()}>
          Add
        </button>
      </div>
      {hint ? <p className="mt-1 text-xs text-ink-400">{hint}</p> : null}
    </div>
  );
}

function Row({ children, onRemove, label }) {
  return (
    <div className="relative rounded-lg border border-ink-200 bg-ink-50/60 p-3">
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="absolute right-2 top-2 rounded p-1 text-ink-400 hover:bg-ink-200 hover:text-ink-700"
      >
        <CloseIcon className="h-3.5 w-3.5" />
      </button>
      <div className="grid grid-cols-1 gap-2 pr-8 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      <input
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange(type === 'number' ? Number(event.target.value) || 0 : event.target.value)}
        placeholder={placeholder}
        className="field"
      />
    </label>
  );
}

/**
 * Editable preview of the parsed CV.
 *
 * Keyword parsing is conservative and will miss things, so every field is
 * editable and the edits are what scoring uses — the user is the last word on
 * their own CV. Changes are written straight to localStorage by the caller.
 */
export function CvEditor({ cv, onChange }) {
  const patchList = (key, index, patch) =>
    onChange({
      [key]: (cv[key] || []).map((entry, i) => (i === index ? { ...entry, ...patch } : entry)),
    });

  const removeFrom = (key, index) => onChange({ [key]: (cv[key] || []).filter((_, i) => i !== index) });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Name" value={cv.name} onChange={(name) => onChange({ name })} placeholder="Your name" />
        <Field label="Email" value={cv.email} onChange={(email) => onChange({ email })} placeholder="you@example.com" />
        <Field label="Phone" value={cv.phone} onChange={(phone) => onChange({ phone })} placeholder="98…" />
      </div>

      <TagInput
        label="Skills"
        values={cv.skills}
        onChange={(skills) => onChange({ skills })}
        placeholder="Add a skill and press Enter"
        hint="These drive the match score, so it is worth getting them right."
      />

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="label mb-0">Experience</h3>
          <span className="text-xs text-ink-400">total {monthsToSpan(cv.totalExperienceMonths)}</span>
        </div>
        <div className="space-y-2">
          {(cv.experience || []).map((entry, index) => (
            <Row key={index} label={entry.role || 'experience entry'} onRemove={() => removeFrom('experience', index)}>
              <Field label="Role" value={entry.role} onChange={(role) => patchList('experience', index, { role })} />
              <Field
                label="Company"
                value={entry.company}
                onChange={(company) => patchList('experience', index, { company })}
              />
              <Field
                label="Duration (as written)"
                value={entry.duration}
                onChange={(duration) => patchList('experience', index, { duration })}
                placeholder="Jan 2021 – Present"
              />
              <Field
                label="Months"
                type="number"
                value={entry.months}
                onChange={(months) => patchList('experience', index, { months })}
              />
            </Row>
          ))}
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => onChange({ experience: [...(cv.experience || []), { role: '', company: '', duration: '', months: 0 }] })}
          >
            <PlusIcon className="h-4 w-4" /> Add a role
          </button>
        </div>
      </div>

      <div>
        <h3 className="label">Education</h3>
        <div className="space-y-2">
          {(cv.education || []).map((entry, index) => (
            <Row key={index} label={entry.degree || 'education entry'} onRemove={() => removeFrom('education', index)}>
              <Field label="Degree" value={entry.degree} onChange={(degree) => patchList('education', index, { degree })} />
              <Field label="Field" value={entry.field} onChange={(field) => patchList('education', index, { field })} />
              <Field
                label="Institution"
                value={entry.institution}
                onChange={(institution) => patchList('education', index, { institution })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field label="Year" value={entry.year} onChange={(year) => patchList('education', index, { year })} />
                <label className="block">
                  <span className="label">Level</span>
                  <select
                    value={entry.level || 'unspecified'}
                    onChange={(event) => patchList('education', index, { level: event.target.value })}
                    className="field"
                  >
                    {EDUCATION_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {EDUCATION_LABELS[level]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </Row>
          ))}
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() =>
              onChange({
                education: [...(cv.education || []), { degree: '', field: '', institution: '', year: '', level: 'unspecified' }],
              })
            }
          >
            <PlusIcon className="h-4 w-4" /> Add a qualification
          </button>
        </div>
      </div>

      <TagInput
        label="Certifications"
        values={cv.certifications}
        onChange={(certifications) => onChange({ certifications })}
        placeholder="e.g. AWS Cloud Practitioner"
      />
    </div>
  );
}
