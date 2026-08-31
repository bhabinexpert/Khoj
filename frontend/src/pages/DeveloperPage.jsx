import { Link } from 'react-router-dom';
import {
  ArrowRightIcon,
  GithubIcon,
  GlobeIcon,
  LinkedinIcon,
  MailIcon,
  MapPinIcon,
  SparkleIcon,
} from '../components/Icons.jsx';
import { AuroraBackground, GradientBorder, Reveal, SpotlightCard } from '../components/ui/Aceternity.jsx';
import { developer } from '../data/developer.js';

const ICONS = { github: GithubIcon, linkedin: LinkedinIcon, mail: MailIcon, globe: GlobeIcon };

/** The stack, grouped the way the repository is laid out. */
const ARCHITECTURE = [
  {
    name: 'frontend',
    tech: 'React · Vite · Tailwind · framer-motion · three.js',
    body: 'Search state lives in the URL, so any view of the feed is a shareable link. CV and saved jobs live in localStorage behind a tiny cross-tab store.',
  },
  {
    name: 'backend',
    tech: 'Node · Express · MongoDB · Mongoose',
    body: 'Text-indexed job search with filters and pagination, a deduplicating ingest endpoint, and an SSE stream so open browsers hear about new postings immediately.',
  },
  {
    name: 'scraper-service',
    tech: 'Python · requests · BeautifulSoup',
    body: 'One adapter per source behind a session that reads robots.txt, honours Crawl-delay and retries with backoff. Runs every 30 minutes.',
  },
  {
    name: 'ml-service',
    tech: 'Python · FastAPI · sentence-transformers',
    body: 'Parses PDF/DOCX CVs into structured fields and scores them against a posting with cosine similarity over MiniLM embeddings, falling back to lexical overlap.',
  },
];

function Links({ links }) {
  const usable = links.filter((link) => link.url);
  if (!usable.length) {
    return (
      <p className="mt-5 text-xs text-ink-400">
        Contact links are configured in <code className="rounded bg-ink-100 px-1 py-0.5">src/data/developer.js</code>.
      </p>
    );
  }
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      {usable.map((link) => {
        const Icon = ICONS[link.icon] || GlobeIcon;
        const external = !link.url.startsWith('mailto:');
        return (
          <a
            key={link.label}
            href={link.url}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="btn-secondary px-4 py-2 text-sm"
          >
            <Icon className="h-4 w-4" /> {link.label}
          </a>
        );
      })}
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <div>
      <section className="relative overflow-hidden border-b border-ink-200 bg-ink-50">
        <AuroraBackground />
        <div className="container-page relative py-14 sm:py-20">
          <Reveal>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/80 px-3 py-1 text-xs font-semibold text-ink-700 backdrop-blur">
              <SparkleIcon className="h-3.5 w-3.5 text-brand-700" />
              The developer behind Khoj
            </span>

            <h1 className="mt-4 text-display-sm text-ink-900 sm:text-display-lg">
              {developer.name}
            </h1>
            <p className="mt-2 text-lg font-medium text-ink-700">{developer.role}</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-ink-500">
              <MapPinIcon className="h-4 w-4" /> {developer.location}
            </p>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-600">{developer.tagline}</p>

            <Links links={developer.links} />
          </Reveal>

          <dl className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {developer.stats.map((stat, index) => (
              <Reveal key={stat.label} delay={index * 0.06}>
                <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 backdrop-blur">
                  <dd className="text-2xl font-bold text-ink-900">{stat.value}</dd>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{stat.label}</dt>
                  {stat.hint ? <p className="mt-0.5 text-xs text-ink-400">{stat.hint}</p> : null}
                </div>
              </Reveal>
            ))}
          </dl>
        </div>
      </section>

      {/* bio */}
      <section className="container-page py-14">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr]">
          <Reveal>
            <h2 className="text-display-sm text-ink-900">Why I built this</h2>
            <div className="mt-4 space-y-4 text-sm leading-relaxed text-ink-600 sm:text-base">
              {developer.bio.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <h2 className="text-display-sm text-ink-900">Skills</h2>
            <div className="mt-4 space-y-4">
              {Object.entries(developer.skills).map(([group, items]) => (
                <div key={group}>
                  <h3 className="label">{group}</h3>
                  <div className="flex flex-wrap gap-1.5">
                    {items.map((item) => (
                      <span
                        key={item}
                        className="chip bg-ink-50 text-ink-700 ring-1 ring-inset ring-ink-200"
                      >
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* highlights */}
      <section className="border-y border-ink-200 bg-white">
        <div className="container-page py-14">
          <Reveal>
            <h2 className="text-display-sm text-ink-900">
              The engineering worth pointing at
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-ink-600">
              Four decisions that shaped the codebase, and what each one buys.
            </p>
          </Reveal>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {developer.highlights.map((item, index) => (
              <Reveal key={item.title} delay={index * 0.06}>
                <SpotlightCard className="h-full">
                  <h3 className="text-base font-semibold text-ink-900">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{item.body}</p>
                </SpotlightCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* architecture */}
      <section className="container-page py-14">
        <Reveal>
          <h2 className="text-display-sm text-ink-900">How Khoj is put together</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-600">
            Four independently deployable services. Each one can be run, tested and replaced on its own.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {ARCHITECTURE.map((service, index) => (
            <Reveal key={service.name} delay={index * 0.06}>
              <div className="h-full rounded-2xl border border-ink-200 bg-ink-50/60 p-5">
                <code className="text-sm font-semibold text-brand-800">/{service.name}</code>
                <p className="mt-1 text-xs font-medium text-ink-500">{service.tech}</p>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{service.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="container-page pb-16">
        <Reveal>
          <GradientBorder innerClassName="px-6 py-9 sm:px-10 text-center">
            <h2 className="text-display-sm text-ink-900">
              Have a look at the thing itself
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-600">
              The feed is the product. Everything above only matters if it finds you a job.
            </p>
            <Link to="/jobs" className="btn-primary btn-lg mt-5">
              Browse the feed <ArrowRightIcon className="h-4 w-4" />
            </Link>
          </GradientBorder>
        </Reveal>
      </section>
    </div>
  );
}
