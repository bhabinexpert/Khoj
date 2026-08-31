"""Ships normalised jobs to the backend's ``POST /api/jobs/ingest`` endpoint."""

from __future__ import annotations

import json
import logging
import os
import time
from typing import Any

import requests

logger = logging.getLogger(__name__)

DEFAULT_BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:5000")
#: Small batches keep individual requests well under body-size limits and make
#: a partial failure cheap to retry.
BATCH_SIZE = int(os.getenv("INGEST_BATCH_SIZE", "50"))
#: Optional shared secret for the one write endpoint in the whole API. Unset in
#: local dev (the backend then leaves ingest open); set it in production so only
#: this scheduler can post jobs. It is *not* a user account — there are none.
INGEST_TOKEN = os.getenv("INGEST_TOKEN", "")


class IngestError(RuntimeError):
    pass


def _chunks(items: list[Any], size: int):
    for start in range(0, len(items), size):
        yield items[start : start + size]


def ingest_jobs(
    jobs: list[dict[str, Any]],
    *,
    backend_url: str = DEFAULT_BACKEND_URL,
    batch_size: int = BATCH_SIZE,
    max_retries: int = 3,
    dry_run: bool = False,
    timeout: float = 60.0,
    token: str | None = None,
) -> dict[str, int]:
    """POST ``jobs`` to the backend in batches and return aggregate counters.

    Returns the backend's ``{inserted, updated, merged, skipped}`` totals summed
    across batches. A batch that keeps failing is logged and skipped so one bad
    chunk cannot discard an entire successful run.
    """
    endpoint = backend_url.rstrip("/") + "/api/jobs/ingest"
    totals = {"received": 0, "inserted": 0, "updated": 0, "merged": 0, "skipped": 0, "failedBatches": 0}

    headers = {"Content-Type": "application/json", "User-Agent": "KhojScraper/1.0"}
    secret = INGEST_TOKEN if token is None else token
    if secret:
        headers["X-Ingest-Token"] = secret

    if not jobs:
        logger.info("nothing to ingest")
        return totals

    if dry_run:
        logger.info("[dry-run] would POST %s job(s) to %s", len(jobs), endpoint)
        sample = json.dumps(jobs[:3], indent=2, ensure_ascii=False)
        # Windows consoles default to cp1252, which chokes on characters like the
        # non-breaking hyphen scraped titles carry. Fall back to an ASCII-safe
        # rendering rather than crash a --dry-run over cosmetics.
        try:
            print(sample)
        except UnicodeEncodeError:
            print(sample.encode("ascii", "backslashreplace").decode("ascii"))
        totals["received"] = len(jobs)
        return totals

    for index, batch in enumerate(_chunks(jobs, batch_size), start=1):
        for attempt in range(1, max_retries + 1):
            try:
                response = requests.post(
                    endpoint,
                    json={"jobs": batch},
                    timeout=timeout,
                    headers=headers,
                )
                response.raise_for_status()
            except requests.RequestException as exc:
                detail = ""
                if getattr(exc, "response", None) is not None:
                    detail = f" body={exc.response.text[:300]}"
                logger.warning(
                    "batch %s failed (attempt %s/%s): %s%s", index, attempt, max_retries, exc, detail
                )
                if attempt == max_retries:
                    totals["failedBatches"] += 1
                else:
                    time.sleep(2 ** attempt)
                continue

            payload = response.json() if response.content else {}
            for key in ("received", "inserted", "updated", "merged", "skipped"):
                totals[key] += int(payload.get(key) or 0)
            logger.info("batch %s ok: %s", index, {k: payload.get(k) for k in ("inserted", "updated", "merged")})
            break

    logger.info("ingest totals: %s", totals)
    if totals["failedBatches"]:
        logger.error("%s batch(es) never made it to the backend", totals["failedBatches"])
    return totals


def wait_for_backend(backend_url: str = DEFAULT_BACKEND_URL, *, attempts: int = 10, delay: float = 3.0) -> bool:
    """Poll ``/health`` so a compose-started scraper does not race the API."""
    url = backend_url.rstrip("/") + "/health"
    for attempt in range(1, attempts + 1):
        try:
            if requests.get(url, timeout=5).ok:
                return True
        except requests.RequestException:
            pass
        logger.info("backend not ready yet (%s/%s)", attempt, attempts)
        time.sleep(delay)
    return False
