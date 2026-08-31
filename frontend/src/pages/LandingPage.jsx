import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  BotIcon,
  DocumentIcon,
  LayersIcon,
  RefreshIcon,
  SearchIcon,
  ShieldIcon,
  SparkleIcon,
  TargetIcon,
  VerifiedIcon,
} from '../components/Icons.jsx';
import { AuroraBackground, GradientBorder, Reveal, SpotlightCard, TextReveal } from '../components/ui/Aceternity.jsx';
import { HeroScene } from '../components/ui/HeroScene.jsx';
import { useJobStats } from '../hooks/useJobStats.js';
import { platformLabel } from '../lib/format.js';

/** Numbers count up from zero once, so the hero has motion without a spinner. */
function Counter({ value, className = '' }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!value) {
      setShown(0);
      return undefined;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return undefined;
    }
    const started = performance.now();
    let frame = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 900);
      // ease-out-cubic
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <span className={className}>{shown.toLocaleString('en-US')}</span>;
}

const STEPS = [
  {
    icon: SearchIcon,
    title: 'Search one feed',
    body:
      'Every posting we can reach, in one list. Filter by type, level, education, location and ' +
      'deadline. Duplicates across boards are merged into a single listing.',
  },
  {
    icon: DocumentIcon,
    title: 'Drop in your CV',
    body:
      'PDF or DOCX. It is parsed into skills, education and experience that you can edit, and it ' +
      'stays in your browser, with no account and no upload history.',
  },
  {
    icon: TargetIcon,
    title: 'See your real match',
    body:
      'Every card gets a match score with the reasoning shown: what you have, what is missing, ' +
      'and how much each part counted.',
  },
  {
    icon: ArrowRightIcon,
    title: 'Apply at the source',
    body:
      "The apply button goes to the employer's own form when the posting named one, otherwise to " +
      'the board that carries it. Khoj never handles your application.',
  },
];

const FEATURES = [
  {
    icon: LayersIcon,
    title: 'Deduplicated across sources',
    body: 'One vacancy, one card, every source link kept, enforced by a unique hash at ingest.',
  },
  {
    icon: RefreshIcon,
    title: 'Refreshed continuously',
    body: 'The scraper runs every 30 minutes and the feed updates itself while you read it.',
  },
  {
    icon: BotIcon,
    title: 'Explainable scoring',
    body: 'Semantic skill matching with a visible breakdown, not an opaque percentage.',
  },
  {
    icon: ShieldIcon,
    title: 'Nothing to sign up for',
    body: 'No account, no tracking, no stored CV. Saved jobs live in this browser only.',
  },
  {
    icon: VerifiedIcon,
    title: 'Honest about limits',
    body: 'Where a source was thin or the model was unavailable, the UI says so.',
  },
  {
    icon: SparkleIcon,
    title: 'Internships included',
    body: 'Internships and trainee roles are first-class, not an afterthought filter.',
  },
];

/** The published weighting, shown rather than described. */
const WEIGHTS = [
  { label: 'Required skills', weight: 50, note: 'Semantic match, not string equality' },
  { label: 'Preferred skills', weight: 20, note: 'Nice-to-haves you already have' },
  { label: 'Experience', weight: 20, note: 'Years against the level asked for' },
  { label: 'Education', weight: 10, note: 'Minimum qualification named in the posting' },
];

export default function LandingPage() {
  const { stats } = useJobStats();
  const platforms = stats?.platforms || [];

  return (
    <div>
      {/* hero */}
      <section className="relative overflow-hidden border-b border-ink-200 bg-ink-50">
        <AuroraBackground />
        <div className="container-page relative grid items-center gap-10 py-16 sm:py-24 lg:grid-cols-[1.15fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-brand-800 shadow-xs backdrop-blur">
              <SparkleIcon className="h-3.5 w-3.5" />
              Free, and no account needed
            </span>

            <h1 className="mt-5 text-display-sm text-ink-900 sm:text-display-lg">
              <TextReveal text="Every job in Nepal," />
              <br />
              <span className="bg-gradient-to-r from-brand-700 via-brand-500 to-sky-600 bg-clip-text text-transparent">
                <TextReveal text="scored against your CV." delay={0.35} />
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-ink-600 sm:text-lg">
              Khoj gathers job and internship postings from Nepali job boards into one searchable
              feed, merges the duplicates, and tells you how well each one actually fits the
              moment you drop in your CV.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link to="/jobs" className="btn-primary btn-lg">
                Browse the feed <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link to="/cv" className="btn-secondary btn-lg">
                <DocumentIcon className="h-4 w-4" /> Match my CV
              </Link>
            </div>

            <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-5 border-t border-ink-200 pt-6">
              <div>
                <dd className="tabular text-2xl font-bold tracking-tight text-ink-900">
                  {/* "Live" has to mean still open, not merely still in the
                      database — `openNow` excludes postings past their deadline. */}
                  <Counter value={stats?.openNow ?? stats?.total ?? 0} />
                  {stats ? '' : '…'}
                </dd>
                <dt className="eyebrow mt-1">Live postings</dt>
              </div>
              <div>
                <dd className="tabular text-2xl font-bold tracking-tight text-ink-900">
                  <Counter value={stats?.freshToday || 0} />
                </dd>
                <dt className="eyebrow mt-1">Added today</dt>
              </div>
              <div>
                <dd className="flex flex-wrap items-center gap-1.5">
                  {platforms.length ? (
                    platforms.map((p) => (
                      <span key={p.platform} className="chip-outline shadow-xs">
                        {platformLabel(p.platform)}
                      </span>
                    ))
                  ) : (
                    <span className="text-2xl font-bold text-ink-900">…</span>
                  )}
                </dd>
                <dt className="eyebrow mt-1.5">Sources</dt>
              </div>
            </dl>
          </div>

          <HeroScene className="mx-auto h-64 w-full max-w-md sm:h-80 lg:h-[26rem]" />
        </div>
      </section>

      {/* steps */}
      <section className="container-page py-16 sm:py-20">
        <Reveal className="text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="mt-2 text-display-sm text-ink-900">Four steps, no sign-up</h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-ink-600">
            Khoj is a search tool, not a recruiter. It never sits between you and the employer.
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <Reveal key={step.title} delay={index * 0.08} as="li">
              <SpotlightCard className="h-full">
                <span className="inline-grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                  <step.icon className="h-5 w-5" />
                </span>
                <p className="eyebrow mt-4">Step {index + 1}</p>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-ink-900">{step.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{step.body}</p>
              </SpotlightCard>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* the scoring */}
      <section className="border-y border-ink-200 bg-ink-50/60">
        <div className="container-page grid items-center gap-10 py-16 sm:py-20 lg:grid-cols-[1fr_1.1fr]">
          <Reveal>
            <p className="eyebrow">The score</p>
            <h2 className="mt-2 text-display-sm text-ink-900">No black box</h2>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-ink-600">
              A percentage on its own is a horoscope. Khoj publishes the weights, names the skills it
              matched, and lists the ones it could not find, so a low score tells you what to fix
              rather than just that you lost.
            </p>
            <Link to="/cv" className="btn-secondary btn-sm mt-6">
              Score my CV <ArrowRightIcon className="h-3.5 w-3.5" />
            </Link>
          </Reveal>

          <Reveal delay={0.1}>
            <div className="card divide-y divide-ink-100 overflow-hidden">
              {WEIGHTS.map((row) => (
                <div key={row.label} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink-900">{row.label}</p>
                    <p className="mt-0.5 text-xs text-ink-500">{row.note}</p>
                  </div>
                  <div className="w-28 shrink-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${row.weight}%` }} />
                    </div>
                  </div>
                  <span className="tabular w-10 shrink-0 text-right text-sm font-bold text-ink-800">
                    {row.weight}%
                  </span>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* features */}
      <section className="bg-white">
        <div className="container-page py-16 sm:py-20">
          <Reveal>
            <p className="eyebrow">Why this and not a tab per board</p>
            <h2 className="mt-2 text-display-sm text-ink-900">What makes the feed worth reading</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <Reveal key={feature.title} delay={index * 0.05}>
                <div className="h-full rounded-2xl border border-ink-200 bg-ink-50/60 p-5 transition-colors hover:border-ink-300 hover:bg-white">
                  <span className="inline-grid h-9 w-9 place-items-center rounded-lg bg-white text-brand-700 ring-1 ring-inset ring-ink-200">
                    <feature.icon className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="mt-3.5 text-sm font-semibold tracking-tight text-ink-900">{feature.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-600">{feature.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* cta */}
      <section className="container-page py-16 sm:py-20">
        <Reveal>
          <GradientBorder innerClassName="px-6 py-12 sm:px-10 sm:py-14 text-center">
            <h2 className="text-display-sm text-ink-900">Find out where you actually stand</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-600">
              Upload a CV once and every posting in the feed gets a score you can interrogate. It
              never leaves your browser, and there is nothing to create an account for.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link to="/cv" className="btn-primary btn-lg">
                Upload my CV <ArrowRightIcon className="h-4 w-4" />
              </Link>
              <Link to="/developer" className="btn-ghost btn-lg">
                Who built this?
              </Link>
            </div>
          </GradientBorder>
        </Reveal>
      </section>
    </div>
  );
}
