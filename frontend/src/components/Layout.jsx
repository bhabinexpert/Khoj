import { Link, NavLink, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  BookmarkIcon,
  CheckIcon,
  CompassIcon,
  DocumentIcon,
  SearchIcon,
  SparkleIcon,
  UserIcon,
} from './Icons.jsx';
import { MomoSupport } from './MomoSupport.jsx';
import { useCv } from '../hooks/useCv.js';
import { useSavedJobs } from '../hooks/useSavedJobs.js';
import { cn } from '../lib/cn.js';

function Tab({ to, icon, label, badge = null }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors sm:px-3',
          isActive ? 'text-brand-800' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* The pill slides between tabs rather than cutting, which is the one
              piece of chrome animation that reads as polish instead of noise. */}
          {isActive ? (
            <motion.span
              layoutId="nav-pill"
              className="absolute inset-0 rounded-lg bg-brand-50"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          ) : null}
          <span className="relative">{icon}</span>
          <span className="relative hidden sm:inline">{label}</span>
          {badge ? (
            <span className="relative rounded-full bg-brand-700 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
              {badge}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

export function Layout({ children }) {
  const { hasCv } = useCv();
  const { count } = useSavedJobs();
  const { pathname } = useLocation();
  // The landing and developer pages bring their own full-bleed sections; the app
  // pages want the centred column.
  const wide = pathname === '/' || pathname === '/developer';

  return (
    <div className="flex min-h-screen flex-col">
      {/* A keyboard user should not have to walk the whole nav to reach the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-900 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/80 backdrop-blur-md">
        <div className="container-page flex items-center gap-2 py-3">
          <Link to="/" className="mr-auto flex items-center gap-2.5" aria-label="Khoj home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-brand-600 to-brand-800 text-sm font-bold text-white shadow-xs">
              K
            </span>
            <span className="text-base font-bold tracking-tight text-ink-900">
              Khoj<span className="text-brand-700">.</span>
            </span>
            <span className="hidden items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-500 sm:inline-flex">
              <SparkleIcon className="h-3 w-3" /> Nepal
            </span>
          </Link>

          <nav className="flex items-center gap-0.5" aria-label="Primary">
            <Tab to="/" icon={<CompassIcon className="h-4 w-4" />} label="Home" />
            <Tab to="/jobs" icon={<SearchIcon className="h-4 w-4" />} label="Jobs" />
            <Tab to="/saved" icon={<BookmarkIcon className="h-4 w-4" />} label="Saved" badge={count || null} />
            <Tab
              to="/cv"
              icon={<DocumentIcon className="h-4 w-4" />}
              label="My CV"
              badge={hasCv ? <CheckIcon className="h-2.5 w-2.5" /> : null}
            />
            {/* <Tab to="/developer" icon={<UserIcon className="h-4 w-4" />} label="Developer" /> */}
          </nav>
        </div>
      </header>

      {/* Full-bleed for pages that supply their own sections and gutters;
          the centred column for everything else. */}
      <main id="main" className={cn('w-full flex-1', !wide && 'container-page py-6')}>
        {children}
      </main>

      <footer className="border-t border-ink-200 bg-ink-50/70">
        <div className="container-page grid gap-8 py-10 sm:grid-cols-[2fr_1fr]">
          <div className="space-y-2.5 text-xs leading-relaxed text-ink-500">
            <p className="eyebrow">Khoj: job search for Nepal</p>
            <p>
              <strong className="font-semibold text-ink-700">Khoj</strong> aggregates public job and internship
              postings from Nepali job boards. Every listing links back to the original posting, so you apply there,
              not here.
            </p>
            <p>
              No account, no tracking, no server-side profile. Your CV and saved jobs are stored only in this
              browser&apos;s local storage, and the CV is sent to the API solely to be parsed and scored, never
              stored.
            </p>
          </div>
          <nav className="flex flex-col gap-2 text-xs font-medium text-ink-600 sm:items-end" aria-label="Footer">
            <Link to="/jobs" className="transition-colors hover:text-brand-700">All jobs</Link>
            <Link to="/cv" className="transition-colors hover:text-brand-700">Match my CV</Link>
            <Link to="/saved" className="transition-colors hover:text-brand-700">Saved jobs</Link>
            {/* <Link to="/developer" className="transition-colors hover:text-brand-700">About the developer</Link> */}
            <a
              href="https://buymemomo.com/vabin"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-momo-700"
            >
              Buy me a momo
            </a>
          </nav>
        </div>
      </footer>

      <MomoSupport />
    </div>
  );
}
