import { Link } from 'react-router-dom';
import { roundScore, scoreTone } from '../lib/format.js';
import { cn } from '../lib/cn.js';
import { Spinner } from './Icons.jsx';

/**
 * The "72% Match" pill. Three states, because a card must render sensibly
 * whether or not a CV exists and whether or not scoring has come back yet.
 */
export function MatchBadge({ score, loading = false, enabled = true, size = 'md' }) {
  const padding = size === 'lg' ? 'px-3 py-1.5 text-sm' : 'px-2.5 py-1 text-xs';

  if (!enabled) {
    return (
      <Link
        to="/cv"
        className={cn(
          'chip border border-dashed border-ink-300 text-ink-500 transition-colors hover:border-brand-400 hover:text-brand-700',
          padding,
        )}
        title="Upload a CV to see how well you match this job"
      >
        Match?
      </Link>
    );
  }

  if (!score) {
    return (
      <span className={cn('chip bg-ink-100 text-ink-500', padding)}>
        {loading ? <Spinner className="h-3.5 w-3.5" /> : null}
        {loading ? 'Scoring' : 'No score'}
      </span>
    );
  }

  const value = roundScore(score.overallScore);
  const tone = scoreTone(value);

  return (
    <span className={cn('chip tabular font-semibold', tone.chip, padding)} title={tone.word}>
      {value}% match
    </span>
  );
}

/** The same number as a compact vertical block for the right edge of a card. */
export function MatchScoreBlock({ score, loading = false, enabled = true }) {
  if (!enabled) {
    return (
      <Link
        to="/cv"
        className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed
                   border-ink-300 px-2 py-3 text-center text-[11px] font-medium leading-tight text-ink-500
                   transition-colors hover:border-brand-400 hover:bg-brand-50/50 hover:text-brand-700"
        title="Upload a CV to see how well you match this job"
      >
        Upload CV for match
      </Link>
    );
  }

  if (!score) {
    return (
      <div className="flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl bg-ink-100 px-2 py-4 text-center">
        {loading ? (
          <Spinner className="h-4 w-4 text-ink-400" />
        ) : (
          <span className="text-[11px] leading-tight text-ink-400">no score</span>
        )}
      </div>
    );
  }

  const value = roundScore(score.overallScore);
  const tone = scoreTone(value);

  return (
    <div className={cn('flex w-[4.5rem] shrink-0 flex-col items-center justify-center rounded-xl px-2 py-2.5', tone.chip)}>
      <span className="tabular text-xl font-bold leading-none tracking-tight">{value}%</span>
      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide opacity-80">match</span>
    </div>
  );
}
