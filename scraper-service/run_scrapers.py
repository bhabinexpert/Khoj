#!/usr/bin/env python
"""Khoj scraper entrypoint.

Runs every configured :class:`~adapters.base.SourceAdapter`, merges duplicates
across platforms, and POSTs the result to the backend's ingest endpoint.

Examples::

    python run_scrapers.py                            # default sources, once
    python run_scrapers.py --sources merojob          # one source
    python run_scrapers.py --dry-run --limit 5        # inspect without ingesting
    python run_scrapers.py --loop                     # in-process scheduler
    python run_scrapers.py --loop --interval-minutes 15

Scheduling: use ``--loop`` inside Docker (see ``docker-compose.yml``) or install
the bundled ``crontab`` on a host. Both default to every 30 minutes, which keeps
the feed close to live while staying well inside what the sources can absorb —
each run touches only a couple of listing pages, and
:class:`~core.http.PoliteSession` still enforces a per-host delay and obeys
robots.txt. Raise :option:`--interval-minutes` if a source ever asks for less.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import sys
import time
from datetime import datetime, timezone

from adapters import ADAPTERS, DEFAULT_SOURCES
from core.dedupe import merge_duplicates
from core.http import PoliteSession
from core.ingest import DEFAULT_BACKEND_URL, ingest_jobs, wait_for_backend

logger = logging.getLogger("khoj.scraper")


def configure_logging(verbose: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if verbose else logging.INFO,
        format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
        stream=sys.stdout,
    )
    logging.getLogger("urllib3").setLevel(logging.WARNING)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape Nepali job sources and ingest into Khoj.")
    parser.add_argument(
        "--sources",
        default=os.getenv("SCRAPER_SOURCES", ",".join(DEFAULT_SOURCES)),
        help=f"Comma-separated source names. Available: {', '.join(ADAPTERS)}",
    )
    parser.add_argument("--backend-url", default=DEFAULT_BACKEND_URL, help="Backend base URL.")
    parser.add_argument("--limit", type=int, default=None, help="Cap jobs per source (debugging).")
    parser.add_argument("--pages", type=int, default=None, help="Cap listing pages per source.")
    parser.add_argument(
        "--min-delay",
        type=float,
        default=float(os.getenv("SCRAPER_MIN_DELAY", "3.0")),
        help="Minimum seconds between requests to the same host.",
    )
    parser.add_argument("--dry-run", action="store_true", help="Print instead of POSTing to the backend.")
    parser.add_argument("--out", default=None, help="Also write the merged payload to this JSON file.")
    parser.add_argument("--loop", action="store_true", help="Keep running on an interval (container scheduler).")
    parser.add_argument(
        "--interval-minutes",
        type=float,
        default=float(os.getenv("SCRAPER_INTERVAL_MINUTES", "30")),
        help="Minutes between runs when --loop is set (default 30; raise it, never drop below ~10).",
    )
    parser.add_argument("--no-robots", action="store_true", help="Skip robots.txt checks (offline tests only).")
    parser.add_argument("-v", "--verbose", action="store_true")
    return parser.parse_args(argv)


def build_adapters(args: argparse.Namespace, session: PoliteSession) -> list:
    requested = [name.strip().lower() for name in args.sources.split(",") if name.strip()]

    adapters = []
    for name in requested:
        adapter_cls = ADAPTERS.get(name)
        if adapter_cls is None:
            logger.error("unknown source %r (available: %s)", name, ", ".join(ADAPTERS))
            continue
        kwargs = {"session": session}
        if args.pages is not None:
            kwargs["max_pages"] = args.pages
        adapter = adapter_cls(**kwargs)
        if args.limit is not None:
            adapter.max_jobs = args.limit
            if hasattr(adapter, "max_detail_pages"):
                adapter.max_detail_pages = args.limit
        adapters.append(adapter)
    return adapters


def run_once(args: argparse.Namespace) -> int:
    started = datetime.now(timezone.utc)
    session = PoliteSession(min_delay=args.min_delay, obey_robots=not args.no_robots)
    adapters = build_adapters(args, session)

    if not adapters:
        logger.error("no usable sources — nothing to do")
        return 2

    collected: list[dict] = []
    per_source: dict[str, int] = {}
    for adapter in adapters:
        logger.info("=== %s ===", adapter.platform)
        jobs = adapter.fetch_jobs()
        per_source[adapter.platform] = len(jobs)
        collected.extend(jobs)

    merged = merge_duplicates(collected)
    logger.info("scraped=%s merged=%s per_source=%s", len(collected), len(merged), per_source)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            json.dump(merged, handle, indent=2, ensure_ascii=False)
        logger.info("wrote %s job(s) to %s", len(merged), args.out)

    exit_code = 0
    if merged:
        totals = ingest_jobs(merged, backend_url=args.backend_url, dry_run=args.dry_run)
        if totals["failedBatches"]:
            exit_code = 1
    elif not args.dry_run:
        logger.warning("no jobs scraped — check adapter selectors or connectivity")
        exit_code = 1

    session.close()
    logger.info("run finished in %.1fs", (datetime.now(timezone.utc) - started).total_seconds())
    return exit_code


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    configure_logging(args.verbose)

    if not args.dry_run and not wait_for_backend(args.backend_url):
        logger.error("backend at %s never became healthy", args.backend_url)
        if not args.loop:
            return 3

    if not args.loop:
        return run_once(args)

    interval = max(60.0, args.interval_minutes * 60)
    logger.info("scheduler mode: every %.0f min", interval / 60)
    while True:
        try:
            run_once(args)
        except KeyboardInterrupt:
            logger.info("interrupted — exiting")
            return 0
        except Exception:  # noqa: BLE001 - a scheduler must survive a bad run
            logger.exception("run failed; will retry next interval")
        # Jitter avoids hitting sources on exactly the same clock minute forever.
        sleep_for = interval + random.uniform(0, min(300, interval * 0.2))
        logger.info("sleeping %.0f min", sleep_for / 60)
        time.sleep(sleep_for)


if __name__ == "__main__":
    raise SystemExit(main())
