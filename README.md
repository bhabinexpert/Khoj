# Khoj

A no-login job and internship aggregator for Nepal, with explainable CV matching.
Search postings pulled from Nepali job boards, upload a CV in the browser, and
see — field by field — why each job scores the way it does. There are no
accounts, no tracking, and the CV never leaves the browser except for the single
scoring request you trigger.

## What's inside

| Service | Stack | Role |
|---|---|---|
| `frontend/` | React 18 + Vite + Tailwind | The SPA. Talks only to the backend under `/api`. |
| `backend/` | Node + Express + MongoDB | Public read API, CV/match proxy, ingest endpoint, live SSE feed. |
| `scraper-service/` | Python | One polite, robots-respecting adapter per source; dedupes and posts to ingest. |
| `ml-service/` | Python + FastAPI | CV parsing and the explainable match score. |

The match score is a transparent weighted sum, not a black box:

```
0.5 * required-skills + 0.2 * preferred-skills + 0.2 * experience + 0.1 * education
```

## Quick start (Docker)

The whole stack runs with one command:

```bash
cp .env.example .env      # adjust if you like; defaults work as-is
docker compose up --build
```

Then open http://localhost:8080. The scraper waits for the backend, then crawls
on a schedule and posts what it finds. The first CV match is slow because
ml-service downloads its model once (~2.5 GB), then caches it.

## Local development (without Docker)

Run each service in its own terminal:

```bash
# backend — needs a MongoDB, or use the in-memory dev server
cd backend && npm install && npm run dev:memory

# ml-service
cd ml-service && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && uvicorn app.main:app --reload

# frontend
cd frontend && npm install && npm run dev

# scraper — one-off run against your local backend
cd scraper-service && python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt && python run_scrapers.py --limit 10
```

The frontend dev server proxies `/api` to `http://localhost:5000` (override with
`VITE_PROXY_TARGET`).
## API surface

All under `/api`, all public and read-only except ingest:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/jobs` | Search & filter (`q`, `location`, `jobType`, `experienceLevel`, `source`, `page`, `limit`, `sort`, `includeExpired`). |
| GET | `/api/jobs/filters` | Available filter values. |
| GET | `/api/jobs/stats` | Counts by job type and source, plus live-posting count. |
| GET | `/api/jobs/stream` | Server-Sent Events: announces every ingest that changed something. |
| GET | `/api/jobs/:id` | Full job detail. |
| POST | `/api/jobs/ingest` | Scraper ingest (dedupes + upserts). Gated by `INGEST_TOKEN` when set. |
| POST | `/api/cv/parse` | Parse an uploaded CV (proxied to ml-service). |
| POST | `/api/match/score`, `/api/match/batch` | Score a CV against one or many jobs. |

Past-deadline jobs are hidden by default; pass `?includeExpired=true` to see the
archive.

## Testing

```bash
cd backend && npm test                    # Jest (unit + integration on an in-memory Mongo)
cd scraper-service && python -m pytest     # offline; HTTP is mocked
cd ml-service && python -m pytest
```

## Deploying

See [DEPLOYMENT.md](DEPLOYMENT.md) for a step-by-step production guide.

## Known limitations

- **Dedupe hash strips non-Latin characters**, so two Devanagari-titled postings
  that differ only in Devanagari can collapse into one. Latin titles are
  unaffected. The Python and Node hashes are kept byte-identical on purpose.
- **The live feed is a single-process SSE bus** — it does not fan out across
  multiple backend instances. Run one backend, or add a shared broker, if you
  need the live feed behind a load balancer.
- **Keyword parsing is deliberately conservative.** The scraper prefers to leave
  a field unspecified over guessing; `detect_experience_level` treats "lead" as
  senior, which is usually but not always right.
- **The skills taxonomy is duplicated** between scraper and ml-service on
  purpose, so neither service has to import the other.

## Support

Khoj is free. If it helped you, [buy me a momo](https://buymemomo.com/vabin).

