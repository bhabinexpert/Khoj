'use strict';

/**
 * Demo listings for local development.
 *
 * These are hand-written stand-ins for scraper output — same shape, same
 * `dedupeHash` contract — so the UI can be built and reviewed without running
 * the scrapers or hitting any live job board. Run standalone with
 * `node scripts/seed-jobs.js` against a real MONGO_URI, or let
 * `npm run dev:memory` call `seedJobs()` for you.
 */

const { Job } = require('../src/models/Job');
const { dedupeHash } = require('../src/utils/dedupe');

const daysFromNow = (days) => new Date(Date.now() + days * 86400000);

const RAW = [
  {
    title: 'Frontend Developer (React)',
    company: 'Leapfrog Technology',
    description:
      'We are looking for a frontend developer to build and ship customer-facing web applications with React.\n\n' +
      'You will work with designers and backend engineers to turn Figma files into accessible, responsive interfaces, ' +
      'own the component library, and keep our bundle honest.\n\n' +
      'Preferred: experience with TypeScript, testing libraries, and CI pipelines.',
    requiredSkills: ['React', 'JavaScript', 'HTML', 'CSS', 'Git'],
    preferredSkills: ['TypeScript', 'Jest', 'Tailwind CSS'],
    experienceLevel: 'mid',
    educationRequirement: 'bachelor',
    jobType: 'full-time',
    location: 'Lalitpur',
    salary: 'NRs 80,000 - 120,000 / Month',
    deadline: daysFromNow(18),
    postedDate: daysFromNow(-3),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/frontend-developer-react-124/',
    sources: [{ platform: 'jobaxle', url: 'https://jobaxle.com/job/frontend-developer-react-9912' }],
  },
  {
    title: 'Backend Engineer — Node.js',
    company: 'F1Soft International',
    description:
      'Own the services behind Nepal\'s largest digital payments platform. You will design REST APIs, tune MongoDB ' +
      'queries, and take part in on-call rotation for the services you build.\n\n' +
      'Preferred: Docker, Kubernetes, message queues.',
    requiredSkills: ['Node.js', 'Express', 'MongoDB', 'REST API'],
    preferredSkills: ['Docker', 'Kubernetes', 'Redis'],
    experienceLevel: 'senior',
    educationRequirement: 'bachelor',
    jobType: 'full-time',
    location: 'Kathmandu',
    salary: 'Negotiable',
    deadline: daysFromNow(9),
    postedDate: daysFromNow(-1),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/backend-engineer-nodejs-441/',
  },
  {
    title: 'Data Analyst Intern',
    company: 'Daraz Nepal',
    description:
      'A three-month paid internship with our commercial analytics team. You will clean marketplace data, build ' +
      'dashboards, and present weekly findings to category managers.\n\n' +
      'No prior work experience required — final-year students welcome. Preferred: Power BI or Tableau exposure.',
    requiredSkills: ['SQL', 'Excel', 'Python'],
    preferredSkills: ['Power BI', 'Tableau', 'Pandas'],
    experienceLevel: 'entry',
    educationRequirement: 'bachelor',
    jobType: 'internship',
    location: 'Kathmandu',
    salary: 'NRs 15,000 / Month',
    deadline: daysFromNow(4),
    postedDate: daysFromNow(-5),
    sourcePlatform: 'jobaxle',
    sourceUrl: 'https://jobaxle.com/job/data-analyst-intern-8821',
  },
  {
    title: 'Flutter Developer (Remote)',
    company: 'Sastodeal',
    description:
      'Build and maintain our shopping app for Android and iOS from anywhere in Nepal. You will work with a small ' +
      'mobile team, ship fortnightly releases, and own crash-free-rate targets.',
    requiredSkills: ['Flutter', 'Dart', 'REST API'],
    preferredSkills: ['Firebase', 'CI/CD'],
    experienceLevel: 'mid',
    educationRequirement: 'unspecified',
    jobType: 'remote',
    location: 'Remote (Nepal)',
    salary: 'NRs 90,000 - 140,000 / Month',
    deadline: daysFromNow(25),
    postedDate: daysFromNow(-2),
    sourcePlatform: 'jobaxle',
    sourceUrl: 'https://jobaxle.com/job/flutter-developer-remote-9014',
    sources: [{ platform: 'merojob', url: 'https://merojob.com/flutter-developer-sastodeal/' }],
  },
  {
    title: 'Accounts Officer',
    company: 'Himalayan Java Coffee',
    description:
      'Maintain day-to-day books for twelve outlets, reconcile daily sales, file VAT returns, and support the ' +
      'monthly closing. Familiarity with Nepali accounting practice is essential.',
    requiredSkills: ['Accounting', 'Tally', 'VAT', 'Excel'],
    preferredSkills: ['Payroll'],
    experienceLevel: 'mid',
    educationRequirement: 'bachelor',
    jobType: 'full-time',
    location: 'Kathmandu',
    salary: 'NRs 45,000 / Month',
    deadline: daysFromNow(12),
    postedDate: daysFromNow(-7),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/accounts-officer-8871/',
  },
];

RAW.push(
  {
    title: 'Digital Marketing Associate (Part Time)',
    company: 'Confidential',
    description:
      'Run paid social campaigns for a growing education brand, four hours a day. You will own the content calendar, ' +
      'write ad copy in Nepali and English, and report on cost per lead.',
    requiredSkills: ['Facebook Ads', 'Content Writing', 'SEO'],
    preferredSkills: ['Google Analytics', 'Canva'],
    experienceLevel: 'entry',
    educationRequirement: 'diploma',
    jobType: 'part-time',
    location: 'Pokhara',
    salary: null,
    deadline: daysFromNow(6),
    postedDate: daysFromNow(-4),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/digital-marketing-associate-9921/',
  },
  {
    title: 'Civil Engineer — Site Supervision',
    company: 'Sharma Construction',
    description:
      'Supervise a residential build in Bhaktapur: daily site reports, quantity checks, subcontractor coordination ' +
      'and quality control. Six-month contract with possible extension.',
    requiredSkills: ['AutoCAD', 'Site Supervision', 'Estimation'],
    preferredSkills: ['Primavera', 'Revit'],
    experienceLevel: 'mid',
    educationRequirement: 'bachelor',
    jobType: 'contract',
    location: 'Bhaktapur',
    salary: 'NRs 60,000 / Month',
    deadline: daysFromNow(-9), // closed recently: visible only with "include closed"
    postedDate: daysFromNow(-30),
    sourcePlatform: 'jobaxle',
    sourceUrl: 'https://jobaxle.com/job/civil-engineer-site-supervision-7702',
  },
  {
    title: 'Machine Learning Engineer',
    company: 'Fusemachines',
    description:
      'Take research prototypes to production: feature pipelines, model serving, and evaluation harnesses. You will ' +
      'work with a distributed team across Kathmandu and New York.\n\n' +
      'Preferred: MLOps tooling, vector databases, LLM evaluation experience.',
    requiredSkills: ['Python', 'PyTorch', 'Machine Learning', 'Docker'],
    preferredSkills: ['MLflow', 'FastAPI', 'AWS'],
    experienceLevel: 'senior',
    educationRequirement: 'master',
    jobType: 'full-time',
    location: 'Kathmandu',
    salary: 'NRs 200,000+ / Month',
    deadline: daysFromNow(21),
    postedDate: daysFromNow(-6),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/machine-learning-engineer-5510/',
  },
  {
    title: 'Customer Support Representative (Night Shift)',
    company: 'CloudFactory',
    description:
      'Answer customer queries over chat and email for international clients on a rotating night shift. Training is ' +
      'provided; strong written English is essential.',
    requiredSkills: ['Communication', 'English', 'Customer Service'],
    preferredSkills: ['Zendesk'],
    experienceLevel: 'entry',
    educationRequirement: 'diploma',
    jobType: 'full-time',
    location: 'Bhaktapur',
    salary: 'NRs 32,000 / Month',
    deadline: daysFromNow(0),
    postedDate: daysFromNow(-8),
    sourcePlatform: 'merojob',
    sourceUrl: 'https://merojob.com/customer-support-representative-night-shift-8123/',
    // The listing pointed at the employer's own form, so `applyUrl` wins over
    // `sourceUrl` and the button reads "Apply on careers.cloudfactory.com".
    applyUrl: 'https://careers.cloudfactory.com/apply/support-night-shift',
  },
  {
    title: 'Graphic Design Intern',
    company: 'Kalaa Design Studio',
    description:
      'Three-month internship with a Kathmandu design studio. Portfolio matters more than marks — send three ' +
      'samples with your application.',
    requiredSkills: ['Adobe Illustrator', 'Adobe Photoshop', 'Figma'],
    preferredSkills: ['Motion Graphics'],
    experienceLevel: 'entry',
    educationRequirement: 'unspecified',
    jobType: 'internship',
    location: 'Kathmandu',
    salary: 'NRs 10,000 / Month',
    deadline: null,
    postedDate: daysFromNow(-1),
    sourcePlatform: 'jobaxle',
    sourceUrl: 'https://jobaxle.com/job/graphic-design-intern-9330',
    // No applyUrl: the posting named no separate route, so Apply falls back to
    // the board it was found on.
  },
);

/** Attach the dedupe hash the scrapers would have computed. */
function withHashes(rows) {
  return rows.map((row) => ({
    ...row,
    dedupeHash: dedupeHash(row.title, row.company, row.description),
    sources: [{ platform: row.sourcePlatform, url: row.sourceUrl }, ...(row.sources || [])],
    lastSeenAt: new Date(),
  }));
}

/** Wipe and re-insert the demo set. Returns the number of documents inserted. */
async function seedJobs() {
  const docs = withHashes(RAW);
  await Job.deleteMany({});
  const inserted = await Job.insertMany(docs, { ordered: false });
  return inserted.length;
}

module.exports = { seedJobs, RAW };

if (require.main === module) {
  const { connectDb, disconnectDb } = require('../src/db/connect');
  connectDb()
    .then(seedJobs)
    .then((count) => {
      console.log(`[seed] ${count} demo job(s) inserted`);
      return disconnectDb();
    })
    .catch((err) => {
      console.error('[seed] failed:', err.message);
      process.exit(1);
    });
}
