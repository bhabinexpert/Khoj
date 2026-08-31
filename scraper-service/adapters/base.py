"""Adapter contract every job source must implement.

Adding a new source means: subclass :class:`SourceAdapter`, set
``platform``/``base_url``, and implement :meth:`fetch_raw_jobs` yielding loose
dicts. Normalisation, skill extraction, hashing and error isolation are all
handled here so adapters stay small and focused on the site's markup.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Iterator

from core.http import PoliteSession, RobotsDisallowed
from core.normalize import normalize_job

logger = logging.getLogger(__name__)


class SourceAdapter(ABC):
    """Base class for all job source adapters."""

    #: Short, stable identifier stored on every job (``sourcePlatform``).
    platform: str = "unknown"
    #: Root URL, used for resolving relative links and robots.txt lookups.
    base_url: str = ""
    #: Safety valve so a broken selector cannot spider a whole site.
    max_pages: int = 3
    #: Cap on postings returned per run.
    max_jobs: int = 60

    def __init__(self, session: PoliteSession | None = None, *, max_pages: int | None = None) -> None:
        self.session = session or PoliteSession()
        if max_pages is not None:
            self.max_pages = max_pages

    # ---------------------------------------------------------------- contract
    @abstractmethod
    def fetch_raw_jobs(self) -> Iterator[dict[str, Any]]:
        """Yield raw, un-normalised job dicts scraped from the source.

        Keys are best-effort; :func:`core.normalize.normalize_job` fills gaps.
        At minimum a usable posting needs ``title`` and ``sourceUrl``.
        """
        raise NotImplementedError

    # ----------------------------------------------------------------- public
    def fetch_jobs(self) -> list[dict[str, Any]]:
        """Scrape, normalise and return canonical job dicts.

        Never raises for per-posting problems: a bad row is logged and skipped
        so one malformed posting cannot abort an entire run.
        """
        jobs: list[dict[str, Any]] = []
        seen_urls: set[str] = set()

        try:
            raw_iter = self.fetch_raw_jobs()
        except RobotsDisallowed as exc:
            logger.error("[%s] refusing to scrape: %s", self.platform, exc)
            return []
        except Exception as exc:  # noqa: BLE001 - adapter-level failure is non-fatal
            logger.exception("[%s] listing fetch failed: %s", self.platform, exc)
            return []

        while True:
            try:
                raw = next(raw_iter)
            except StopIteration:
                break
            except RobotsDisallowed as exc:
                logger.error("[%s] stopping: %s", self.platform, exc)
                break
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] skipping a posting: %s", self.platform, exc)
                continue

            try:
                job = normalize_job(raw, source_platform=self.platform)
            except Exception as exc:  # noqa: BLE001
                logger.warning("[%s] normalisation failed for %r: %s", self.platform, raw.get("title"), exc)
                continue

            if job is None:
                logger.debug("[%s] dropped incomplete posting: %r", self.platform, raw.get("title"))
                continue
            if job["sourceUrl"] in seen_urls:
                continue

            seen_urls.add(job["sourceUrl"])
            jobs.append(job)
            if len(jobs) >= self.max_jobs:
                logger.info("[%s] hit max_jobs=%s", self.platform, self.max_jobs)
                break

        logger.info("[%s] normalised %s job(s)", self.platform, len(jobs))
        return jobs

    # ---------------------------------------------------------------- helpers
    def absolute(self, href: str | None) -> str:
        """Resolve a possibly-relative href against :attr:`base_url`."""
        from urllib.parse import urljoin

        if not href:
            return ""
        return urljoin(self.base_url, href.strip())

    def soup(self, url: str):
        """Fetch ``url`` and return a BeautifulSoup document."""
        from bs4 import BeautifulSoup

        response = self.session.get(url)
        return BeautifulSoup(response.text, "html.parser")
