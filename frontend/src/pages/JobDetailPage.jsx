import { Link, useParams } from 'react-router-dom';
import { MatchBreakdown } from '../components/MatchBreakdown.jsx';
import { MatchBadge } from '../components/MatchBadge.jsx';
import { SourceBadge } from '../components/SourceBadge.jsx';
import { EmptyState, ErrorState, Skeleton } from '../components/States.jsx';
import { ArrowLeftIcon, BookmarkIcon, ExternalLinkIcon } from '../components/Icons.jsx';
import { cn } from '../lib/cn.js';
import { useJob } from '../hooks/useJobs.js';
import { useMatchScores } from '../hooks/useMatchScores.js';
import { useSavedJobs } from '../hooks/useSavedJobs.js';
import {
  EDUCATION_LABELS,
  EXPERIENCE_LABELS,
  JOB_TYPE_LABELS,
  applyRoutes,
  deadlineInfo,
  formatDate,
  labelFor,
  linkHost,
  platformLabel,
  relativeDate,
  toParagraphs,
} from '../lib/format.js';

function Facts({ job }) {
  const deadline = deadlineInfo(job.deadline);
  const rows = [
    ['Job type', labelFor(JOB_TYPE_LABELS, job.jobType)],
    ['Experience', labelFor(EXPERIENCE_LABELS, job.experienceLevel, 'Not specified')],
    ['Education', labelFor(EDUCATION_LABELS, job.educationRequirement, 'Not specified')],
    ['Location', job.location],
    ['Salary', job.salary || 'Not disclosed'],
    ['Deadline', job.deadline ? `${formatDate(job.deadline)} (${deadline.text})` : 'Not listed'],
    ['Posted', `${formatDate(job.postedDate)} (${relativeDate(job.postedDate)})`],
  ];

  return (
    <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-xl bg-ink-200 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="bg-white px-4 py-3">
          <dt className="label mb-0.5">{label}</dt>
          <dd className="text-sm font-medium text-ink-800">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SkillList({ title, skills, tone }) {
  if (!skills?.length) return null;
  return (
    <div>
      <h3 className="label">{title}</h3>
      <div className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <span key={skill} className={cn('chip ring-1 ring-inset', tone)}>
            {skill}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function JobDetailPage() {
  const { id } = useParams();
  const { job, loading, error, reload } = useJob(id);
  const { isSaved, toggle } = useSavedJobs();
  const matches = useMatchScores(job ? [job.id] : []);
  const score = job ? matches.scoreFor(job.id) : null;

  if (loading) {
    return (
      <div className="card space-y-4 p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <EmptyState
        title="That posting is no longer listed"
        hint="Jobs disappear when the source removes them. Try searching the feed for a similar role."
        action={
          <Link to="/jobs" className="btn-primary">
            Back to all jobs
          </Link>
        }
      />
    );
  }

  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load this job" />;
  if (!job) return null;

  const saved = isSaved(job.id);
  const paragraphs = toParagraphs(job.description);
  const { apply, extras } = applyRoutes(job);

  return (
    <div className="space-y-4">
      <Link to="/jobs" className="btn-ghost -ml-2 px-2 py-1 text-sm">
        <ArrowLeftIcon className="h-4 w-4" /> All jobs
      </Link>

      <article className="card overflow-hidden">
        <header className="border-b border-ink-200 bg-gradient-to-b from-ink-50/70 to-white p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge platform={job.sourcePlatform} />
            <MatchBadge score={score} loading={matches.loading} enabled={matches.enabled} size="lg" />
            {job.isExpired ? (
              <span className="chip bg-red-50 text-red-700 ring-1 ring-inset ring-red-200">Deadline passed</span>
            ) : null}
          </div>

          <h1 className="mt-3 text-xl font-bold leading-tight tracking-tight text-ink-900 sm:text-display-sm">
            {job.title}
          </h1>
          <p className="mt-1.5 text-base font-medium text-ink-600">{job.company}</p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {apply ? (
              <a
                href={apply.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-primary"
              >
                Apply now <ExternalLinkIcon className="h-4 w-4" />
              </a>
            ) : null}

            {extras.map((route) => (
              <a
                key={route.url}
                href={route.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="btn-secondary"
              >
                Also on {platformLabel(route.platform)} <ExternalLinkIcon className="h-4 w-4" />
              </a>
            ))}

            <button
              type="button"
              onClick={() => toggle(job.id)}
              aria-pressed={saved}
              className={cn('btn-secondary', saved && 'border-brand-200 bg-brand-50 text-brand-700')}
            >
              <BookmarkIcon filled={saved} className="h-4 w-4" />
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>

          {apply ? (
            <p className="mt-2 text-xs text-ink-400">
              Apply now opens the original posting on {linkHost(apply.url)}. Applications are handled
              there — Khoj never receives them.
            </p>
          ) : (
            <p className="mt-2 text-xs text-amber-700">
              This posting did not include a working application link. Search for{' '}
              {job.company} on {platformLabel(job.sourcePlatform)} for the employer&rsquo;s instructions.
            </p>
          )}
        </header>

        {score ? (
          <div className="border-b border-ink-200 bg-ink-50/60 p-4 sm:p-5">
            <MatchBreakdown score={score} defaultOpen />
          </div>
        ) : null}

        <div className="space-y-5 p-5 sm:p-6">
          <Facts job={job} />

          <div className="space-y-3">
            <SkillList
              title="Required skills"
              skills={job.requiredSkills}
              tone="bg-brand-50 text-brand-800 ring-brand-200"
            />
            <SkillList
              title="Preferred skills"
              skills={job.preferredSkills}
              tone="bg-ink-50 text-ink-700 ring-ink-200"
            />
          </div>

          <div>
            <h2 className="eyebrow mb-2.5">Job description</h2>
            {paragraphs.length ? (
              <div className="space-y-3 text-sm leading-relaxed text-ink-700">
                {paragraphs.map((paragraph, index) => (
                  <p key={index} className="whitespace-pre-line">
                    {paragraph}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-500">
                The source listing had no description text. Open it on {platformLabel(job.sourcePlatform)} for details.
              </p>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
