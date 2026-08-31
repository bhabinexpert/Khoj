import { Link } from 'react-router-dom';
import { MergedSourcesNote, SourceBadge } from './SourceBadge.jsx';
import { MatchScoreBlock } from './MatchBadge.jsx';
import { MatchBreakdown } from './MatchBreakdown.jsx';
import { BookmarkIcon, ClockIcon, ExternalLinkIcon, MapPinIcon, WalletIcon } from './Icons.jsx';
import { cn } from '../lib/cn.js';
import {
  EXPERIENCE_LABELS,
  JOB_TYPE_LABELS,
  applyRoutes,
  deadlineInfo,
  labelFor,
  relativeDate,
} from '../lib/format.js';

const DEADLINE_TONES = {
  urgent: 'text-amber-700',
  expired: 'text-red-700',
  neutral: 'text-ink-500',
};

function Meta({ icon, children, className = 'text-ink-500' }) {
  if (!children) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', className)}>
      {icon}
      {children}
    </span>
  );
}

/**
 * One listing in the feed. Renders identically with or without a CV — the score
 * block degrades to an "upload a CV" prompt rather than disappearing, so the
 * layout does not jump once scores arrive.
 */
export function JobCard({ job, score = null, scoreLoading = false, scoringEnabled = false, saved = false, onToggleSave }) {
  const deadline = deadlineInfo(job.deadline);
  const firstDescriptionLine = (job.description || '').replace(/\s+/g, ' ').trim();
  // The employer's own link wins over the board we found the job on.
  const { apply } = applyRoutes(job);

  return (
    <article className={cn('card-interactive p-4 sm:p-5', job.isExpired && 'opacity-75')}>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge platform={job.sourcePlatform} />
            <MergedSourcesNote sources={job.allSources} />
            {job.isExpired ? (
              <span className="chip bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">Deadline passed</span>
            ) : null}
          </div>

          <h2 className="mt-2 text-base font-semibold leading-snug tracking-tight text-ink-900 sm:text-lg">
            <Link to={`/jobs/${job.id}`} className="transition-colors hover:text-brand-700">
              {job.title}
            </Link>
          </h2>
          <p className="mt-0.5 truncate text-sm font-medium text-ink-600">{job.company}</p>

          {firstDescriptionLine ? (
            <p className="clamp-2 mt-2 text-sm leading-relaxed text-ink-500">{firstDescriptionLine}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="chip bg-brand-50 text-brand-800">{labelFor(JOB_TYPE_LABELS, job.jobType)}</span>
            {job.experienceLevel && job.experienceLevel !== 'unspecified' ? (
              <span className="chip bg-ink-100 text-ink-700">
                {labelFor(EXPERIENCE_LABELS, job.experienceLevel)}
              </span>
            ) : null}
            <Meta icon={<MapPinIcon className="h-3.5 w-3.5 shrink-0 text-ink-400" />}>{job.location}</Meta>
            <Meta icon={<WalletIcon className="h-3.5 w-3.5 shrink-0 text-ink-400" />}>{job.salary}</Meta>
            <Meta icon={<ClockIcon className="h-3.5 w-3.5 shrink-0" />} className={DEADLINE_TONES[deadline.tone]}>
              {deadline.text}
            </Meta>
          </div>

          {job.requiredSkills?.length ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {job.requiredSkills.slice(0, 6).map((skill) => (
                <span key={skill} className="chip-outline">
                  {skill}
                </span>
              ))}
              {job.requiredSkills.length > 6 ? (
                <span className="chip text-ink-400">+{job.requiredSkills.length - 6} more</span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-center gap-2">
          <MatchScoreBlock score={score} loading={scoreLoading} enabled={scoringEnabled} />
          <button
            type="button"
            onClick={() => onToggleSave?.(job.id)}
            aria-pressed={saved}
            aria-label={saved ? `Remove ${job.title} from saved jobs` : `Save ${job.title}`}
            title={saved ? 'Saved (click to remove)' : 'Save this job'}
            className={cn(
              'btn-icon',
              saved ? 'text-brand-700 hover:bg-brand-50 hover:text-brand-800' : 'text-ink-400',
            )}
          >
            <BookmarkIcon filled={saved} />
          </button>
        </div>
      </div>

      {score ? (
        <div className="mt-3">
          <MatchBreakdown score={score} />
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
        <span className="text-xs text-ink-400">Posted {relativeDate(job.postedDate)}</span>
        <div className="flex items-center gap-1.5">
          <Link to={`/jobs/${job.id}`} className="btn-ghost btn-sm">
            Details
          </Link>
          {apply ? (
            <a
              href={apply.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={apply.label}
              className="btn-secondary btn-sm"
            >
              Apply <ExternalLinkIcon className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>
      </div>
    </article>
  );
}
