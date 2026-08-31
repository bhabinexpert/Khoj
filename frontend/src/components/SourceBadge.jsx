import { LayersIcon } from './Icons.jsx';
import { cn } from '../lib/cn.js';
import { platformLabel } from '../lib/format.js';

/** Where a listing came from — always visible, so nothing looks like ours. */
const TONES = {
  merojob: 'bg-sky-50 text-sky-800 ring-sky-200',
  jobaxle: 'bg-violet-50 text-violet-800 ring-violet-200',
  kumarijob: 'bg-rose-50 text-rose-800 ring-rose-200',
  froxjob: 'bg-amber-50 text-amber-800 ring-amber-200',
  merorojgari: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  jobsnepal: 'bg-teal-50 text-teal-800 ring-teal-200',
  rojgari: 'bg-indigo-50 text-indigo-800 ring-indigo-200',
  nepalijob: 'bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200',
  himalayas: 'bg-cyan-50 text-cyan-800 ring-cyan-200',
  arbeitnow: 'bg-lime-50 text-lime-800 ring-lime-200',
};

export function SourceBadge({ platform, className }) {
  const tone = TONES[String(platform).toLowerCase()] || 'bg-ink-100 text-ink-700 ring-ink-200';
  return <span className={cn('chip ring-1 ring-inset', tone, className)}>{platformLabel(platform)}</span>;
}

/**
 * "Also on JobAxle" — the payoff of cross-platform deduplication, and the one
 * place the reader can see that the merge happened rather than take it on trust.
 */
export function MergedSourcesNote({ sources = [] }) {
  if (sources.length < 2) return null;
  const others = sources.slice(1).map((s) => platformLabel(s.platform));
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium text-ink-500"
      title="This vacancy was posted on more than one board and merged into one card"
    >
      <LayersIcon className="h-3.5 w-3.5 text-ink-400" />
      also on {others.join(', ')}
    </span>
  );
}
