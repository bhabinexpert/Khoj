import { useState } from 'react';
import { ChevronDownIcon, SparkleIcon } from './Icons.jsx';
import { roundScore, scoreTone } from '../lib/format.js';

const COMPONENTS = [
  { key: 'requiredSkills', label: 'Required skills', percentKey: 'requiredSkillsMatchPercent' },
  { key: 'preferredSkills', label: 'Preferred skills', percentKey: 'preferredSkillsMatchPercent' },
  { key: 'experience', label: 'Experience fit', percentKey: 'experienceFitPercent' },
  { key: 'education', label: 'Education fit', percentKey: 'educationFitPercent' },
];

const VIA_LABELS = {
  exact: 'exact',
  alias: 'known alias',
  semantic: 'similar meaning',
  fuzzy: 'similar spelling',
};

function SkillPill({ match }) {
  return (
    <span
      className="chip bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      title={`Your CV lists "${match.matchedWith}": ${VIA_LABELS[match.via] || match.via} (similarity ${match.similarity.toFixed(2)})`}
    >
      {match.required}
      {match.via !== 'exact' ? (
        <span className="font-normal text-emerald-700/70">via {match.matchedWith}</span>
      ) : null}
    </span>
  );
}

function ComponentBar({ label, percent, weight, contribution }) {
  const assessed = weight > 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-ink-700">{label}</span>
        <span className="tabular-nums text-ink-500">
          {assessed ? (
            <>
              {Math.round(percent)}% × {Math.round(weight * 100)}% ={' '}
              <span className="font-semibold text-ink-700">{contribution.toFixed(1)} pts</span>
            </>
          ) : (
            'not stated in this posting'
          )}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200">
        <div
          className={assessed ? 'h-full rounded-full bg-brand-500' : 'h-full rounded-full bg-ink-300'}
          style={{ width: `${assessed ? Math.min(100, Math.max(0, percent)) : 0}%` }}
        />
      </div>
    </div>
  );
}

/**
 * The explainable half of the score: what matched, what did not, and how the
 * four weighted components added up. Collapsed on cards, open on the detail page.
 */
export function MatchBreakdown({ score, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!score) return null;

  const value = roundScore(score.overallScore);
  const tone = scoreTone(value);
  const { breakdown } = score;

  return (
    <div className="rounded-lg border border-ink-200 bg-ink-50/70">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <SparkleIcon className="h-4 w-4 shrink-0 text-brand-600" />
        <span className="flex-1 text-sm font-semibold text-ink-800">
          {tone.word}: {value}%
        </span>
        <span className="hidden text-xs text-ink-500 sm:inline">
          {open ? 'Hide' : 'Why?'}
        </span>
        <ChevronDownIcon className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="animate-fade-in space-y-4 border-t border-ink-200 px-3 py-3">
          <div className="space-y-2.5">
            {COMPONENTS.map(({ key, label, percentKey }) => (
              <ComponentBar
                key={key}
                label={label}
                percent={breakdown?.[percentKey] ?? 0}
                weight={breakdown?.weights?.[key] ?? 0}
                contribution={breakdown?.contributions?.[key] ?? 0}
              />
            ))}
          </div>

          {score.matchedSkills?.length ? (
            <div>
              <h4 className="label">Skills you have</h4>
              <div className="flex flex-wrap gap-1.5">
                {score.matchedSkills.map((match) => (
                  <SkillPill key={`${match.required}-${match.matchedWith}`} match={match} />
                ))}
              </div>
            </div>
          ) : null}

          {score.missingSkills?.length ? (
            <div>
              <h4 className="label">Missing required skills</h4>
              <div className="flex flex-wrap gap-1.5">
                {score.missingSkills.map((skill) => (
                  <span key={skill} className="chip bg-red-50 text-red-800 ring-1 ring-inset ring-red-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {score.matchedPreferredSkills?.length || score.missingPreferredSkills?.length ? (
            <div>
              <h4 className="label">Nice-to-haves</h4>
              <div className="flex flex-wrap gap-1.5">
                {score.matchedPreferredSkills?.map((match) => (
                  <SkillPill key={`p-${match.required}-${match.matchedWith}`} match={match} />
                ))}
                {score.missingPreferredSkills?.map((skill) => (
                  <span key={`pm-${skill}`} className="chip bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <dl className="space-y-1.5 text-xs text-ink-600">
            {score.experienceFitNote ? (
              <div className="flex gap-2">
                <dt className="font-semibold text-ink-700">Experience:</dt>
                <dd>{score.experienceFitNote}</dd>
              </div>
            ) : null}
            {score.educationFitNote ? (
              <div className="flex gap-2">
                <dt className="font-semibold text-ink-700">Education:</dt>
                <dd>{score.educationFitNote}</dd>
              </div>
            ) : null}
          </dl>

          <p className="border-t border-ink-200 pt-2 text-[11px] leading-relaxed text-ink-400">
            {score.engine === 'semantic'
              ? 'Skills compared with a sentence-transformer model, so "ReactJS" matches "React".'
              : 'Scored with the lexical fallback (exact, alias and fuzzy matching). The embedding model is not loaded on this server.'}{' '}
            Scores are a guide, not a decision: read the posting before you rule yourself out.
          </p>
        </div>
      ) : null}
    </div>
  );
}
