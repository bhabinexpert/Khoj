# Khoj scraper-service — polite, scheduled job aggregation.
#
# The container's default command is the in-process scheduler (`--loop`), which
# is what docker-compose uses. A host cron installation is also supported; see
# the bundled `crontab`.
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Where the merged payload is written when --out is used.
    SCRAPER_OUT_DIR=/data

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt \
 && useradd --create-home --uid 10002 scraper \
 && mkdir -p /data && chown scraper:scraper /data

COPY --chown=scraper:scraper adapters ./adapters
COPY --chown=scraper:scraper core ./core
COPY --chown=scraper:scraper run_scrapers.py ./
COPY --chown=scraper:scraper pytest.ini ./
COPY --chown=scraper:scraper tests ./tests

USER scraper

# No ports and no healthcheck: this is a batch worker, not a server. Liveness is
# visible in the logs ("run finished in ...s") and in the backend's job counts.
#
# 8 hours sits in the middle of the 6-12h window the sources can absorb; the
# entrypoint also waits for the backend's /health before its first run.
CMD ["python", "run_scrapers.py", "--loop", "--interval-hours", "8"]
