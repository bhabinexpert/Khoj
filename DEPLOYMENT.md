# Deploying Khoj to production

A step-by-step guide to taking Khoj from a clone to a running public site. It
assumes a single Linux host with Docker, the simplest topology that runs the
whole stack. Notes for splitting services across managed platforms are at the
end.

Khoj has no user accounts, so there are no passwords or sessions to secure. The
one thing you *must* decide is whether to lock down the ingest endpoint. Do it.

If you only want to run Khoj on your own machine (development, or to try it
before deploying), start with **Section 0**, which builds up from nothing
installed. The production path (Sections 1 onward) picks up from a server.

---

## 0. Run it locally first (from zero)

Khoj is four services: MongoDB (data), the backend API, the ml-service (CV
parsing and match scoring), and the frontend. The site cannot load jobs unless
the backend is reachable, and the backend cannot answer unless MongoDB is up.
The single most common "it doesn't work" is the frontend showing **"Could not
load jobs — HTTP 500"**: that is the dev proxy failing to reach a backend that
is not running (see Troubleshooting).

### Fastest local run (Docker)

If Docker is installed, one command runs everything exactly as production does:

```bash
git clone <your-repo-url> khoj && cd khoj
cp .env.example .env
docker compose up --build
```

Open http://localhost:8080. Seed a first batch of jobs so the feed is not empty:

```bash
docker compose run --rm scraper python run_scrapers.py --limit 20
```

That is the whole story if you have Docker. The manual path below is only for
running the services directly (hot reload, debugging a single service).

### Manual run (no Docker)

Install the toolchains first:

- **Node.js 22+** and npm (backend + frontend).
- **Python 3.12+** (scraper + ml-service).
- **MongoDB 7** running locally on `27017`, *or* use the backend's built-in
  in-memory database (below) and skip installing Mongo entirely.

Run each service in its own terminal, in this order:

**1. MongoDB** — start your local `mongod`, or skip it and use the in-memory DB
in step 2.

**2. Backend API** (port 5000):

```bash
cd backend
npm ci
npm run seed          # inserts 10 demo jobs (needs MongoDB on 27017)
npm start             # or: npm run dev  (auto-reload)
```

No MongoDB installed? Run the backend with a throwaway in-memory database
instead of `npm start`:

```bash
npm run dev:memory    # spins up an in-memory Mongo; data is lost on exit
```

The backend defaults `MONGO_URI` to `mongodb://127.0.0.1:27017/khoj`. Override
it with an env var if your Mongo lives elsewhere. Confirm it is up:

```bash
curl -fsS http://127.0.0.1:5000/health        # expect: {"status":"ok",...,"db":"connected"}
curl -fsS "http://127.0.0.1:5000/api/jobs?limit=1"
```

**3. ml-service** (port 8000, optional for the feed — needed only for CV
matching):

```bash
cd ml-service
pip install -r requirements.txt
uvicorn app.main:app --port 8000
```

The first CV match downloads a ~2.5 GB sentence-transformers model. Until
ml-service is running, the site works but CV match scores are unavailable (the
UI says so rather than faking them).

**4. Frontend** (port 5173):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. Vite proxies `/api` to `http://localhost:5000`, so
the backend must be running or the feed returns HTTP 500.

**5. Scraper** (optional locally — pulls real postings):

```bash
cd scraper-service
pip install -r requirements.txt
python run_scrapers.py --dry-run --limit 5           # inspect, no writes
python run_scrapers.py --sources merojob,kumarijob   # ingest into the backend
```

---

## 1. Prerequisites

- A Linux host (2 vCPU / 4 GB RAM minimum — ml-service loads a ~2.5 GB model
  into memory; give it 4 GB or run ml-service on its own box).
- Docker Engine 24+ and the Compose plugin (`docker compose version`).
- A domain name pointing at the host, if you want HTTPS (you do).
- Outbound network access from the host (the scraper crawls job boards; the
  ml-service downloads its model once on first use).

---

## 2. Clone and configure

```bash
git clone <your-repo-url> khoj && cd khoj
cp .env.example .env
```

Edit `.env`. The values that matter for production:

| Variable | Set it to | Why |
|---|---|---|
| `INGEST_TOKEN` | a long random string | Gates `POST /api/jobs/ingest`. **Leave it blank and anyone can post fake jobs.** |
| `CORS_ORIGINS` | `https://yourdomain.com` | Restrict which origins the browser API accepts. `*` is fine only because the API is read-only, but tightening it is free. |
| `SCRAPER_MIN_DELAY` | `3.0` or higher | Politeness floor between scraper requests. Never go below a source's robots.txt `Crawl-delay`. |
| `SCRAPER_INTERVAL_HOURS` | `8` | How often to re-crawl. 6–12h is kind to the sources. |

Generate a token:

```bash
openssl rand -hex 32
```

The same `INGEST_TOKEN` is read by both the backend (to require it) and the
scraper (to send it) — compose passes it to both, so set it once.

---

## 3. Build and start

```bash
docker compose up --build -d
```

This brings up mongo → ml-service → backend → frontend → scraper in dependency
order. Watch it settle:

```bash
docker compose ps          # every service should become healthy/running
docker compose logs -f backend
```

The frontend is published on port `8080` by default (`FRONTEND_PORT` in `.env`).
Everything else is internal to the compose network.

---

## 4. Verify

```bash
# Backend liveness (does not touch Mongo)
curl -fsS http://localhost:8080/api/../health || curl -fsS http://localhost:5000/health

# The API answers and reports counts
curl -fsS http://localhost:8080/api/jobs/stats

# The SPA loads
curl -fsSI http://localhost:8080/ | head -n 1     # expect: HTTP/1.1 200
```

The job list is empty until the scraper's first run finishes. Trigger one
immediately instead of waiting for the schedule:

```bash
docker compose run --rm scraper python run_scrapers.py --limit 20
```

Khoj ships **10 sources**: eight Nepali job boards (`merojob`, `jobaxle`,
`kumarijob`, `froxjob`, `merorojgari`, `jobsnepal`, `rojgari`, `nepalijob`) and
two free remote-job APIs (`himalayas`, `arbeitnow`). To confirm what a source
actually returns before trusting it, dry-run one without writing anything:

```bash
docker compose run --rm scraper python run_scrapers.py --sources nepalijob --dry-run
```

Then reload the site — postings should appear, and the live feed announces the
ingest.

---

## 5. Put it behind HTTPS

Terminate TLS in front of the frontend container. The simplest options:

**Caddy (automatic certificates):**

```
yourdomain.com {
    reverse_proxy localhost:8080
}
```

**nginx + certbot:** proxy `yourdomain.com` to `http://localhost:8080` and let
certbot manage the certificate.

Then set `CORS_ORIGINS=https://yourdomain.com` in `.env` and
`docker compose up -d` to apply.

> The frontend's own nginx already does SPA fallback and disables buffering on
> `/api` so the SSE live feed streams. Your outer proxy must **also** not buffer
> `/api/jobs/stream` — for nginx add `proxy_buffering off;` on that location, for
> Caddy `reverse_proxy` streams by default.

---

## 6. Operate

**Logs:**

```bash
docker compose logs -f --tail=100 backend scraper
```

**Update to a new version:**

```bash
git pull
docker compose up --build -d          # rebuilds only what changed
```

**Back up the data** (all state lives in the `mongo-data` volume):

```bash
docker compose exec mongo mongodump --archive --db=khoj | gzip > khoj-$(date +%F).archive.gz
```

Restore with `mongorestore --archive --gzip` reading that file back in.

**Model cache:** ml-service caches its model in the `model-cache` volume. Don't
delete it, or the next CV match re-downloads ~2.5 GB.

---

## 7. Health checks and monitoring

Every long-running service ships a Docker healthcheck (`docker compose ps` shows
the status). For external uptime monitoring, poll:

- `GET /health` on the backend — liveness, does not touch Mongo.
- `GET /api/jobs/stats` — readiness, confirms Mongo is reachable and returns
  the live-posting count.

The scraper is a batch worker with no port; its liveness is visible in the logs
(`run finished in …s`) and in the job counts climbing after each run.

---

## 8. Splitting across managed platforms (optional)

The compose file is one host for simplicity. To spread the load:

- **Database:** point `MONGO_URI` at MongoDB Atlas (or any managed Mongo) and
  drop the `mongo` service.
- **Backend / ml-service:** each has its own Dockerfile and can deploy to any
  container host (Fly, Render, Cloud Run, ECS). Set `ML_SERVICE_URL` on the
  backend to wherever ml-service lands. Give ml-service ≥4 GB RAM.
- **Frontend:** it is static files after `npm run build` — host `frontend/dist`
  on any CDN or static host, and set `VITE_API_BASE_URL` at build time to the
  backend's public URL (or keep it relative and proxy `/api` at the edge).
- **Scraper:** run it as a scheduled job. Either keep the in-process loop
  (`--loop`), or use the bundled host `crontab` (`scraper-service/crontab`) and
  run `run_scrapers.py` on a timer. It only needs `BACKEND_URL` and, if set,
  `INGEST_TOKEN`.

---

## 9. Troubleshooting

**"Could not load jobs — HTTP 500" (or `/api/jobs/stats` 500s) in the browser.**
The frontend reached its proxy, but the proxy could not reach a working backend.
In order of likelihood:

1. *The backend is not running.* In local dev, Vite proxies `/api` to
   `http://localhost:5000`; if nothing listens there the proxy returns HTTP 500.
   Start the backend (Section 0, step 2) and reload. Confirm with
   `curl -fsS http://127.0.0.1:5000/health`.
2. *MongoDB is unreachable.* The backend is up but its query throws. Check
   `MONGO_URI` and that Mongo is listening on `27017` (or use `npm run dev:memory`).
   Under Docker, `docker compose logs backend` shows the connection error.
3. *Under Docker, a dependency is unhealthy.* `docker compose ps` — the backend
   waits for Mongo to become healthy; if Mongo never does, the backend never
   starts. Check `docker compose logs mongo`.

**The feed loads but is empty.** No jobs have been ingested yet. Run a scrape
(Section 4) or `npm run seed` locally for demo data.

**CV match scores say "unavailable".** ml-service is not running or still
downloading its model on first use. Start it (Section 0, step 3) and retry; the
first request is slow while the ~2.5 GB model downloads.

**`docker compose up` errors on a `service_healthy` dependency.** A depended-on
service has no healthcheck or is failing it. Every long-running service defines
one in its Dockerfile; run `docker compose ps` to see which is unhealthy and
read that service's logs.

---

## Production checklist

- [ ] `INGEST_TOKEN` is set to a long random value.
- [ ] `CORS_ORIGINS` is your real domain, not `*`.
- [ ] HTTPS terminates in front of the frontend, and `/api/jobs/stream` is not
      buffered by the outer proxy.
- [ ] `SCRAPER_MIN_DELAY` respects every source's robots.txt.
- [ ] A backup of the `mongo-data` volume is scheduled.
- [ ] Uptime monitoring polls `/health` and `/api/jobs/stats`.
- [ ] ml-service has ≥4 GB RAM and a persistent `model-cache`.
