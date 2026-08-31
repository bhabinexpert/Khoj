/**
 * The one place the developer page reads from.
 *
 * Everything below is display copy — edit this file to change the /developer
 * page; no component needs touching. Values marked TODO are placeholders that
 * are safe to ship (the page hides any link whose `url` is falsy) but should be
 * replaced with the real ones.
 */
export const developer = {
  name: 'Bhabin Dulal',
  role: 'Full-stack developer',
  location: 'Nepal',
  tagline: 'I build practical web software, and Khoj is the one I wanted to exist.',

  /** Two or three paragraphs. Rendered in order. */
  bio: [
    'I built Khoj because looking for work in Nepal means opening half a dozen job boards, ' +
      'reading the same vacancy three times, and still not knowing whether you are a fit. ' +
      'Khoj collapses those boards into one feed, merges the duplicates, and scores every ' +
      'posting against your CV, without asking you to create an account first.',
    'The stack is deliberately unglamorous and easy to run: React and Vite on the front, ' +
      'Express and MongoDB in the middle, and two Python services: a polite scraper with one ' +
      'adapter per job board, and a FastAPI service that parses CVs and does the semantic ' +
      'matching with sentence-transformers.',
  ],

  /** Shown as a row of stat cards. Keep to four. */
  stats: [
    { label: 'Services', value: '4', hint: 'frontend, API, scraper, ML' },
    { label: 'Sources aggregated', value: '10', hint: '8 Nepali job boards + Himalayas & Arbeitnow remote-job APIs' },
    { label: 'Automated tests', value: '200+', hint: 'Jest + pytest' },
    { label: 'Accounts required', value: '0', hint: 'by design' },
  ],

  /** Grouped skill pills. */
  skills: {
    Frontend: ['React', 'Vite', 'Tailwind CSS', 'framer-motion', 'three.js'],
    Backend: ['Node.js', 'Express', 'MongoDB', 'Mongoose', 'REST API design'],
    'Python & ML': ['FastAPI', 'sentence-transformers', 'BeautifulSoup', 'pytest'],
    Tooling: ['Docker', 'Git', 'Jest', 'GitHub Actions'],
  },

  /** Any entry with an empty url is skipped, so unknown links can stay blank. */
  links: [
    { label: 'GitHub', url: 'https://github.com/bhabinexpert', icon: 'github' },
    { label: 'LinkedIn', url: 'https://linkedin.com/in/bhabindulal', icon: 'linkedin' },
    { label: 'Email', url: '', icon: 'mail' }, // TODO e.g. mailto:you@example.com
    { label: 'Portfolio', url: 'https://bhabindulal.com.np', icon: 'globe' },
  ],

  /** What I actually built here, in the order a reader cares about. */
  highlights: [
    {
      title: 'Cross-platform deduplication',
      body:
        'The same vacancy appears on several boards. A SHA-256 of title + company + the first ' +
        '100 characters of the description identifies duplicates; the copies merge into one ' +
        'listing that keeps every source link, and the hash is recomputed server-side on ingest ' +
        'so a unique index enforces it.',
    },
    {
      title: 'Explainable CV matching',
      body:
        'Scores are a weighted sum: 50% required skills, 20% preferred, 20% experience, 10% ' +
        'education, and every job shows which skills matched, which are missing, and how each ' +
        'component contributed. When the embedding model is not loaded the UI says so instead of ' +
        'passing keyword overlap off as semantic matching.',
    },
    {
      title: 'Polite scraping',
      body:
        'One adapter per source behind a shared session that reads robots.txt, honours ' +
        'Crawl-delay, enforces a per-host minimum delay with jitter, and retries with backoff. ' +
        'A source that changes its markup degrades to fewer fields rather than failing the run.',
    },
    {
      title: 'No accounts, no stored CVs',
      body:
        'Your CV is posted once for parsing, returned as editable JSON, and kept in this ' +
        "browser's localStorage. The API never writes it to disk or database, which is also why " +
        'there is nothing to log in to.',
    },
  ],
};
