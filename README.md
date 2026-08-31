# Khoj

A no-login job and internship aggregator for Nepal, with **explainable** CV
matching. Khoj pulls postings from Nepali job boards and a couple of free
remote-work APIs, lets you upload a CV in the browser, and shows — field by
field — *why* each job scores the way it does. There are no accounts, no
tracking, and the CV never leaves the browser except for the single scoring
request you trigger.

> _Khoj_ (खोज) is Nepali for "search."

---

## Table of contents

- [What it does](#what-it-does)
- [Architecture at a glance](#architecture-at-a-glance)
- [How the pieces talk](#how-the-pieces-talk)
- [The job pipeline (and its timing)](#the-job-pipeline-and-its-timing)
- [How CV matching works](#how-cv-matching-works)
- [Repository structure](#repository-structure)
- [API reference](#api-reference)
- [The Job data model](#the-job-data-model)
- [Configuration](#configuration)
- [Running locally](#running-locally)
- [Testing](#testing)
- [Deploying](#deploying)
- [Design decisions & known limitations](#design-decisions--known-limitations)
- [Support](#support)

---

## What it does

- **Aggregates** jobs and internships from **10 sources** — eight Nepali boards
  (merojob, jobaxle, kumarijob, froxjob, merorojgari, jobsnepal, rojgari,
  nepalijob) and two free remote-work APIs (himalayas, arbeitnow) — into one
  searchable feed.
- **Deduplicates** across sources: the same posting seen on two boards collapses
  into one record that remembers both origins.
- **Serves** a fast, no-login SPA with full-text search, faceted filters,
  shareable URLs, a live feed that updates as new jobs arrive, and client-side
  saved jobs.
- **Explains** CV-to-job fit as a transparent weighted score, never a black box:

  ```
  overall = 0.5·required-skills + 0.2·preferred-skills + 0.2·experience + 0.1·education
  ```

  Every score comes with the matched skills, the missing skills, and each
  component's contribution — so a candidate can see exactly what to add.
- **Keeps nothing about you.** No accounts, no sessions, no cookies for identity.
  An uploaded CV is parsed in memory and returned; it is never written to disk or
  a database.

---

## Architecture at a glance

Four services plus a database. Each has one job and a clean boundary.

| Service | Stack | Role |
|---|---|---|
| [`frontend/`](frontend/) | React 18 · Vite 5 · Tailwind 3 · React Router 6 | The SPA. Talks **only** to the backend under `/api`. |
| [`backend/`](backend/) | Node 18+ · Express 4 · MongoDB (Mongoose 8) | Public read API, CV/match proxy, guarded ingest endpoint, live SSE feed. |
| [`scraper-service/`](scraper-service/) | Python 3.12 | One polite, robots-respecting adapter per source; dedupes and POSTs to ingest. |
| [`ml-service/`](ml-service/) | Python 3.12 · FastAPI | CV parsing (PDF/DOCX) and the explainable match score. Stateless. |
| _database_ | MongoDB 7 | The single source of truth for jobs. |

**Why this split?** The browser never touches Mongo or the ML service directly —
the backend is the only public write-aware surface, so CORS, rate limiting, and
the ingest token all live in one place. The scraper and the ML service are
independent workers the backend calls or is called by; either can be down and the
rest of the site keeps working (the feed survives a dead ML service; CV matching
survives a paused scraper).

---

## How the pieces talk

```
                          ┌──────────────────────────────────────┐
                          │              Browser (SPA)            │
                          │   React + Vite  ·  saved jobs in       │
                          │   localStorage  ·  CV held in memory   │
                          └───────────────┬──────────────────────┘
                                          │  HTTPS, only /api/*
                                          ▼
        ┌───────────────────────────────────────────────────────────────┐
        │                        backend  (Express)                       │
        │  GET  /api/jobs · /filters · /stats · /:id                       │
        │  GET  /api/jobs/stream   ── Server-Sent Events (live feed) ──►   │
        │  POST /api/jobs/ingest   ◄── X-Ingest-Token guarded              │
        │  POST /api/cv/parse · /api/match/score · /api/match/batch        │
        └───────┬───────────────────────────┬───────────────────┬────────┘
                │ Mongoose                   │ axios proxy       │ SSE push
                ▼                            ▼                   ▼
        ┌───────────────┐        ┌────────────────────┐   (fan-out to
        │   MongoDB      │        │     ml-service      │    connected
        │  jobs (dedupe  │        │  FastAPI · stateless│    browsers)
        │  hash unique)  │        │  parse CV + score   │
        └───────▲───────┘        └────────────────────┘
                │ POST /api/jobs/ingest
                │ (deduped batch)
        ┌───────┴────────────────────────────┐
        │           scraper-service            │
        │  10 adapters → normalize → merge     │
        │  duplicates → ingest (polite crawl,  │
        │  robots.txt honored, delay floor)    │
        └──────────────────────────────────────┘
```

Two facts fall out of this diagram:

1. **The browser only ever calls the backend.** CV parsing and scoring are
   *proxied* through the backend to the ML service. The ML service is never
   exposed to the internet, and the browser doesn't need to know it exists.
2. **Ingest is the only write path.** The scraper is the only thing that POSTs
   jobs, and it authenticates with a shared `X-Ingest-Token`. Everything else the
   public touches is read-only.

---

## The job pipeline (and its timing)

Jobs travel through two independent clocks: how often they're **fetched**, and
how quickly a fetched job **shows up** in a visitor's browser.

### Ingest side — how often jobs are fetched

The scraper runs each adapter, normalizes the results into a common shape, merges
duplicates within the batch, and POSTs the deduped payload to
`POST /api/jobs/ingest`. It is polite by construction: it reads each source's
`robots.txt`, waits at least `SCRAPER_MIN_DELAY` seconds (default **3s**) between
requests, and identifies itself.

There are three ways to schedule it, depending on how you run Khoj:

| Mode | Cadence | Where |
|---|---|---|
| In-process loop | `--loop --interval-minutes N` (**default 30 min**, env `SCRAPER_INTERVAL_MINUTES`; 60s floor + jitter up to 20%) | `docker compose` runs the scraper this way |
| Host crontab | `:07` and `:37` every hour (every 30 min) | [`scraper-service/crontab`](scraper-service/crontab) for a bare-metal cron install |
| One-off | `python run_scrapers.py` (optionally `--sources …`, `--limit …`, `--dry-run`) | manual / CI |

> **On managed hosting (Render), there is no scraper process.** The blueprint in
> [`render.yaml`](render.yaml) deploys only the backend and ml-service. Jobs are
> ingested by running the scraper elsewhere (a laptop, a small VM, or a scheduled
> CI job) pointed at the live backend with the shared `INGEST_TOKEN`. A cron-style
> CI workflow is the intended fit for a free-tier deployment.

On ingest, the backend upserts by `dedupeHash` (a SHA-256 of the normalized
title + company + first 100 chars of the description). A brand-new posting is
inserted; a posting already seen — even from a different board — updates the
existing record and appends the new source. `lastSeenAt` is bumped every time.

### Serve side — how fast a job reaches the browser

Once a job lands in Mongo, two mechanisms get it in front of visitors:

- **Live push (near-instant).** Every ingest that actually changed something
  publishes an event on an in-process bus, which the backend streams to every
  connected browser over `GET /api/jobs/stream` (Server-Sent Events). Open tabs
  refetch within a second or two — no reload needed.
- **Poll floor (safety net).** The frontend also polls on a **60-second** floor,
  so a client that missed an SSE event (reconnect, proxy hiccup) is never more
  than about a minute stale.

### Freshness and expiry

- `postedDate` defaults to ingest time and drives the default **newest-first**
  sort (a search query switches the default to relevance).
- A job is flagged **fresh today** when its `postedDate` is within the last 24
  hours — a rolling window, not a calendar day.
- A job with a `deadline` in the past is **hidden by default**; pass
  `?includeExpired=true` to see the archive.

So end to end: a new posting is typically discovered within the scrape interval
(minutes to a few hours depending on schedule), and once ingested it appears in
open browsers within seconds via SSE, or within 60 seconds via the poll.

---

## How CV matching works

CV matching is a separate, stateless service so a slow or heavy model never
touches the job feed.

**1. Parse.** `POST /api/cv/parse` proxies the upload to the ML service, which
extracts text (pdfplumber for PDF, python-docx for DOCX) and runs a keyword
parser against a skills dictionary to pull out skills, education, experience,
certifications, and contact fields. The parsed JSON is the *only* copy — nothing
is stored.

**2. Score.** `POST /api/match/score` (one job) and `POST /api/match/batch` (up
to 50 jobs at once, for badging the feed) compute the transparent weighted sum:

| Component | Weight | What it measures |
|---|---|---|
| Required skills | **0.50** | Overlap between CV skills and the job's required skills |
| Preferred skills | **0.20** | Overlap with nice-to-have skills |
| Experience | **0.20** | CV experience vs. the job's level |
| Education | **0.10** | Highest education vs. the requirement |

Each response includes the **matched** skills, the **missing** skills, and each
component's contribution — the "explainable" part. The UI renders this as a
breakdown, not just a number.

**Two matching engines, same API:**

- **Lexical (default, free).** A deterministic matcher: an alias dictionary
  (`ReactJS` → `React`, `Postgres` → `PostgreSQL`), token-overlap (Jaccard),
  containment, and fuzzy `difflib` matching tuned to a threshold. No model, no
  GPU, tiny memory footprint — it runs on a 512 MB free instance.
- **Semantic (opt-in).** `all-MiniLM-L6-v2` via sentence-transformers for
  embedding-based similarity. Better on paraphrases and unseen skills, but pulls
  ~2.5 GB of torch and wants ≥2 GB RAM.

The service **degrades gracefully**: if `sentence-transformers` isn't installed
(or `EMBEDDINGS_ENABLED=false`), it silently falls back to the lexical matcher.
Every response reports which `engine` produced it. Upgrading to semantic later is
a dependency swap plus one env var — **no code change**. CV *parsing* never needs
torch either way.

If the ML service is unreachable, the backend maps the failure to a clean status
(unreachable → 503, timeout → 504) and the UI shows a calm "CV matching is
temporarily unavailable" notice — **browsing and search keep working**.

---

## Repository structure

```
Khoj/
├── docker-compose.yml          # One-host stack: mongo → ml → backend → frontend → scraper
├── render.yaml                 # Render Blueprint: backend + ml-service (lexical, free tier)
├── netlify.toml                # Frontend static hosting config
├── .env.example                # Compose-level env (copy to .env)
├── README.md                   # You are here
├── DEPLOYMENT.md               # Step-by-step production guide
│
├── frontend/                   # React 18 + Vite 5 SPA (talks only to /api)
│   ├── index.html
│   ├── nginx.conf              # Prod: SPA fallback + no buffering on /api (for SSE)
│   ├── Dockerfile
│   ├── vite.config.js          # Dev proxy: /api → VITE_PROXY_TARGET
│   ├── tailwind.config.js  postcss.config.js
│   ├── public/hero/            # Curated landing-page photos
│   └── src/
│       ├── main.jsx  App.jsx   # 5 routes: / /jobs /jobs/:id /cv /saved
│       ├── api/client.js       # Single fetch wrapper + typed ApiError
│       ├── pages/              # Landing, JobFeed, JobDetail, CVUpload, SavedJobs, NotFound
│       ├── components/         # JobCard, FilterSidebar, MatchBreakdown, Dropzone, LiveStatus, …
│       │   └── ui/             # HeroCanvas/HeroScene (react-three-fiber), Aceternity effects
│       ├── hooks/              # useJobs, useLiveJobs (SSE+poll), useCv, useMatchScores, useSavedJobs, …
│       └── lib/                # cv parsing helpers, formatting, localStore (saved jobs)
│
├── backend/                    # Node + Express + Mongoose (CommonJS)
│   ├── Dockerfile
│   ├── scripts/
│   │   ├── dev-with-memory-db.cjs   # npm run dev:memory — throwaway in-memory Mongo
│   │   └── seed-jobs.js             # npm run seed — 10 demo jobs
│   └── src/
│       ├── server.js           # Boot, graceful shutdown, keep-alive self/ml ping
│       ├── app.js              # Express app: helmet, cors, compression, rate limit, routes
│       ├── config/index.js     # All env → config (tolerates scheme-less ML_SERVICE_URL)
│       ├── routes/             # jobs.routes, cv.routes, match.routes
│       ├── controllers/        # jobs / cv / match request handlers
│       ├── services/
│       │   ├── jobs.service.js       # Query building, filters, sort, expiry
│       │   ├── ingest.service.js     # Dedupe-aware upsert
│       │   ├── jobEvents.js          # In-process SSE bus (publishJobsChanged)
│       │   └── mlClient.js           # axios → ml-service, error mapping (503/504/502)
│       ├── models/Job.js       # Mongoose schema, indexes, virtuals
│       ├── middleware/errorHandler.js
│       └── utils/              # dedupe (SHA-256), http helpers
│
├── ml-service/                 # FastAPI, stateless
│   ├── Dockerfile
│   ├── requirements.txt        # Full install (adds torch/sentence-transformers)
│   ├── requirements-lite.txt   # Lean install (no torch) — free-tier / lexical
│   └── app/
│       ├── main.py             # Endpoints: /health /parse-cv /match-score /match-score/batch
│       ├── config.py           # settings (weights, threshold, EMBEDDINGS_ENABLED, limits)
│       ├── schemas.py          # Pydantic request/response models
│       ├── parsers/            # text_extract (pdf/docx), keyword_parser, skills_dictionary
│       └── matching/           # embedder (Lexical/Semantic matchers), scorer (weighted sum)
│
└── scraper-service/            # Python crawler
    ├── Dockerfile
    ├── crontab                 # Bare-metal schedule (:07, :37)
    ├── run_scrapers.py         # Entrypoint: run-once and --loop scheduler
    ├── adapters/               # One per source
    │   ├── __init__.py         # ADAPTERS registry + DEFAULT_SOURCES
    │   ├── merojob.py          # HTML adapter
    │   ├── jobaxle.py          # HTML adapter
    │   ├── jsonld.py           # JSON-LD boards: froxjob, jobsnepal, kumarijob, merorojgari, nepalijob, rojgari
    │   └── api.py              # JSON APIs: himalayas, arbeitnow
    └── core/                   # http (polite client + robots), normalize, dedupe, jsonld, skills, ingest
```

---

## API reference

Base URL is `/api`. Everything is public and read-only **except ingest**.

### Backend

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness (does not touch Mongo). Returns db state + uptime. |
| `GET` | `/health/deep` | Readiness: pings Mongo **and** the ML service; `503` if degraded. |
| `GET` | `/api` | Self-describing endpoint index. |
| `GET` | `/api/jobs` | Search & filter — `q`, `location`, `jobType`, `experienceLevel`, `source`, `page`, `limit`, `sort` (`relevance`/`newest`/`oldest`/`deadline`), `includeExpired`. |
| `GET` | `/api/jobs/filters` | Available filter values (job types, sources, …). |
| `GET` | `/api/jobs/stats` | Totals, counts by type and source, `freshToday`, `openNow`. |
| `GET` | `/api/jobs/stream` | **Server-Sent Events** — announces every ingest that changed something. |
| `GET` | `/api/jobs/:id` | Full job detail. |
| `POST` | `/api/jobs/ingest` | Scraper ingest (dedupes + upserts). Gated by `X-Ingest-Token` when `INGEST_TOKEN` is set. |
| `POST` | `/api/cv/parse` | Multipart PDF/DOCX → parsed CV JSON (proxied to ML; never stored). |
| `POST` | `/api/match/score` | Score one job against a parsed CV. |
| `POST` | `/api/match/batch` | Score up to 50 jobs against a CV in one call. |

Errors use a flat envelope: `{ "error": "<label>", "message": "<human text>", "details"?: … }`.

### ML service (internal — reached only via the backend)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness + which matcher/engine is loaded. Never downloads the model. |
| `POST` | `/parse-cv` | PDF/DOCX upload → structured CV JSON. `meta.persistence: "none"`. |
| `POST` | `/match-score` | One CV + one job → explainable score. |
| `POST` | `/match-score/batch` | One CV + many jobs → one score each. |

---

## The Job data model

The `Job` document (Mongoose) is the single shape everything agrees on.

| Field | Type | Notes |
|---|---|---|
| `title`, `company`, `description` | String | Core content; text-indexed (title weighted highest). |
| `requiredSkills`, `preferredSkills` | [String] | Drive the match score. |
| `experienceLevel` | enum | `entry` · `mid` · `senior` · `unspecified` |
| `educationRequirement` | enum | `slc` · `diploma` · `bachelor` · `master` · `phd` · `unspecified` |
| `jobType` | enum | `internship` · `full-time` · `part-time` · `contract` · `remote` |
| `location`, `salary` | String | Free text; often unspecified. |
| `postedDate` | Date | Defaults to ingest time; indexed; drives newest-first sort. |
| `deadline` | Date \| null | Past deadline → hidden unless `includeExpired=true`. |
| `sourcePlatform`, `sourceUrl`, `applyUrl` | String | Primary origin + apply link. |
| `sources[]` | [{platform, url}] | All boards this posting was seen on (dedupe merges them). |
| `dedupeHash` | String (unique) | SHA-256 of normalized title + company + description[:100]. |
| `lastSeenAt` | Date | Bumped on every re-ingest. |

**Virtuals:** `isExpired` (deadline in the past), `allSources`. **Indexes:** text
index for search; compound `{ postedDate: -1, jobType, experienceLevel }`;
`{ deadline: 1 }`; unique `dedupeHash`.

> The dedupe hash is computed **byte-identically** in the Python scraper and the
> Node backend so both agree on what "the same job" means.

---

## Configuration

Every value has a working default — Khoj runs with no `.env` at all in dev.
**Nothing here is a real secret** except `INGEST_TOKEN`, which gates the one write
endpoint. Never put a secret in a `VITE_` variable — those are compiled into the
public bundle.

### Backend (`backend/.env`)

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `5000` | Listen port. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/khoj` | Mongo connection (include the `/khoj` db). |
| `ML_SERVICE_URL` | `http://localhost:8000` | ML service base URL. Scheme is added if missing (for Render's `fromService`). |
| `ML_TIMEOUT_MS` | `30000` | Proxy timeout (bump to `45000` for a cold free-tier ML). |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins. Lock to your domain in prod. |
| `INGEST_TOKEN` | _(empty)_ | Shared secret for `POST /api/jobs/ingest`. Empty = endpoint is open. **Set it in prod.** |
| `MAX_UPLOAD_BYTES` | `5242880` | CV upload ceiling (5 MB). |
| `DEFAULT_PAGE_SIZE` / `MAX_PAGE_SIZE` | `20` / `100` | Pagination. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_INGEST_MAX` | `240` / `30` | Per-minute request caps. |
| `KEEPALIVE_URL` / `RENDER_EXTERNAL_URL` | _(auto)_ | Self-ping target to keep a free tier warm. |

### ML service (`ml-service` env)

| Variable | Default | Purpose |
|---|---|---|
| `EMBEDDINGS_ENABLED` | `false` | `true` switches to the semantic matcher (needs torch + ≥2 GB RAM). |
| `PRELOAD_MODEL` | `false` | Load the model at boot (slow start, fast first request). |
| `PYTHON_VERSION` | `3.12.x` | Pinned on Render. |

### Scraper (`scraper-service` env / flags)

| Variable | Default | Purpose |
|---|---|---|
| `BACKEND_URL` | compose backend | Where to POST ingested jobs. |
| `INGEST_TOKEN` | _(empty)_ | Must match the backend's. |
| `SCRAPER_SOURCES` | all 10 | Comma-separated source names to crawl. |
| `SCRAPER_MIN_DELAY` | `3.0` | Politeness floor (seconds) between requests. **Never below a source's `Crawl-delay`.** |
| `SCRAPER_INTERVAL_MINUTES` | `30` | Minutes between runs in `--loop` mode. |

### Frontend (`frontend/.env`, build-time)

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Where the browser sends API calls. Set an absolute URL only for split-origin (e.g. Netlify → Render). |
| `VITE_PROXY_TARGET` | `http://localhost:5000` | Dev-only: where Vite proxies `/api`. Ignored in the build. |

---

## Running locally

### With Docker (the whole stack, one command)

```bash
cp .env.example .env      # defaults work as-is
docker compose up --build
```

Open http://localhost:8080. Seed a first batch so the feed isn't empty:

```bash
docker compose run --rm scraper python run_scrapers.py --limit 20
```

### Without Docker (per-service, for hot reload)

```bash
# backend — needs MongoDB on :27017, or use the in-memory dev server
cd backend && npm install && npm run dev:memory

# ml-service — lexical (fast, no torch):
cd ml-service && python -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements-lite.txt && uvicorn app.main:app --reload
# …or semantic: pip install -r requirements.txt and set EMBEDDINGS_ENABLED=true

# frontend
cd frontend && npm install && npm run dev      # proxies /api → :5000

# scraper — one-off run against your local backend
cd scraper-service && python -m venv .venv && . .venv/bin/activate \
  && pip install -r requirements.txt && python run_scrapers.py --limit 10
```

The most common "it doesn't work" is the feed showing **HTTP 500** — that's the
dev proxy failing to reach a backend that isn't running. See DEPLOYMENT.md §0.

---

## Testing

```bash
cd backend        && npm test                 # Jest: unit + integration on in-memory Mongo
cd scraper-service && python -m pytest         # offline; all HTTP is mocked
cd ml-service     && python -m pytest          # parser + scorer
```

---

## Deploying

[**DEPLOYMENT.md**](DEPLOYMENT.md) is the step-by-step guide. Two supported
topologies:

- **One host with Docker Compose** — `docker compose up -d` brings up
  mongo → ml → backend → frontend → scraper in dependency order. Simplest.
- **Split across managed platforms** — the intended free/cheap production shape:
  - **Database:** MongoDB Atlas (`MONGO_URI`).
  - **Backend + ML:** Render, via the [`render.yaml`](render.yaml) Blueprint. It
    provisions both, auto-wires `ML_SERVICE_URL`, and runs the ML service in
    **lexical mode** (`requirements-lite.txt`, no torch) so it fits the free tier.
  - **Frontend:** Netlify (or any static host) — `npm run build` emits
    `frontend/dist`; set `VITE_API_BASE_URL` to the backend URL at build time.
  - **Scraper:** run on a schedule elsewhere (small VM cron, or a CI cron job)
    pointed at the live backend with the shared `INGEST_TOKEN`.

**Production must-dos:** set a long random `INGEST_TOKEN`, restrict
`CORS_ORIGINS` to your domain, terminate HTTPS, and ensure whatever proxy sits in
front does **not** buffer `/api/jobs/stream` (or the live feed stalls).

---

## Design decisions & known limitations

- **Explainable by construction.** The score is a weighted sum with a visible
  breakdown, not an opaque model output — chosen so a job-seeker can act on it.
- **Graceful degradation everywhere.** A dead ML service doesn't break browsing;
  a paused scraper doesn't break CV matching; a missing torch install falls back
  to lexical matching. Each failure has a calm, honest UI state.
- **The skills taxonomy is duplicated** between scraper and ml-service on
  purpose, so neither service has to import the other.
- **Dedupe hash strips non-Latin characters**, so two Devanagari-titled postings
  differing only in Devanagari can collapse into one. Latin titles are
  unaffected. Python and Node hashes are kept byte-identical on purpose.
- **The live feed is a single-process SSE bus** — it does not fan out across
  multiple backend instances. Run one backend, or add a shared broker, behind a
  load balancer.
- **Keyword parsing is deliberately conservative** — it prefers leaving a field
  `unspecified` over guessing.

---

## Support

Khoj is free and has no ads or tracking. If it helped you,
[buy me a momo](https://buymemomo.com/vabin).
