"""Sitemap-driven schema.org ``JobPosting`` adapters.

Every source here follows the same polite, standards-based recipe JobAxle
proved out:

1. read the site's XML sitemap (following a sitemap *index* to the child that
   holds job URLs), newest-first by ``<lastmod>``;
2. fetch each job detail page and lift its ``application/ld+json`` JobPosting
   block — the structured data the site publishes for Google Jobs.

That contract is stable and machine-readable, so a new board is usually a
five-line subclass: point at the sitemap and describe its job URLs. If a page
has no JobPosting block the adapter skips it, so a source that stops publishing
structured data degrades to zero rather than to garbage.

Compliance: discovery is sitemap-based (the least demanding way to crawl), and
every request still passes through :class:`~core.http.PoliteSession`, which
obeys ``robots.txt`` and rate-limits per host. Each source's ``robots.txt`` was
checked to allow ``User-agent: *`` on job pages (verified 2026-08-31).
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterator, Pattern

from adapters.base import SourceAdapter
from core.jsonld import find_job_posting, jobposting_to_raw

logger = logging.getLogger(__name__)

_LOC_RE = re.compile(r"<loc>(.*?)</loc>\s*(?:<lastmod>(.*?)</lastmod>)?", re.S)
_INDEX_HINT = re.compile(r"<sitemapindex", re.I)


class JsonLdSitemapAdapter(SourceAdapter):
    """Base: crawl a sitemap, read schema.org JobPosting from each detail page.

    Subclasses set :attr:`sitemap_url`, :attr:`job_url_pattern` and, when the
    sitemap is an index, :attr:`job_sitemap_pattern`.
    """

    #: Root sitemap (or sitemap index) URL.
    sitemap_url: str = ""
    #: Which child sitemaps in an index hold jobs (ignored for a flat sitemap).
    job_sitemap_pattern: Pattern[str] = re.compile(r".*")
    #: Which ``<loc>`` entries are individual job postings.
    job_url_pattern: Pattern[str] = re.compile(r".*")
    #: Child sitemaps to open from an index in one run.
    max_sitemaps: int = 3
    #: Detail pages fetched per run — each is a full page load, so keep it low.
    max_detail_pages: int = 40
    max_jobs: int = 40

    def fetch_raw_jobs(self) -> Iterator[dict[str, Any]]:
        urls = self._job_urls()
        logger.info("[%s] sitemap yielded %s job URL(s)", self.platform, len(urls))

        for url in urls[: self.max_detail_pages]:
            html = self.session.get(url).text
            posting = find_job_posting(html)
            if not posting:
                logger.debug("[%s] no JobPosting JSON-LD on %s", self.platform, url)
                continue
            raw = jobposting_to_raw(posting, source_url=url)
            if raw:
                yield raw

    # ----------------------------------------------------------------- sitemap
    def _job_urls(self) -> list[str]:
        entries = self._entries(self.sitemap_url)
        if _INDEX_HINT.search(self._last_xml):
            # Open the most-recently-updated job child sitemaps first: WordPress
            # indexes often put the oldest postings in sitemap1, so document
            # order would bury the newest jobs.
            children = [(loc, lastmod) for loc, lastmod in entries if self.job_sitemap_pattern.search(loc)]
            children.sort(key=lambda item: item[1] or "", reverse=True)
            entries = []
            for child, _ in children[: self.max_sitemaps]:
                entries.extend(self._entries(child))

        jobs = [(loc, lastmod) for loc, lastmod in entries if self.job_url_pattern.match(loc)]
        jobs.sort(key=lambda item: item[1] or "", reverse=True)  # newest first; blanks last

        seen: set[str] = set()
        ordered: list[str] = []
        for loc, _ in jobs:
            if loc not in seen:
                seen.add(loc)
                ordered.append(loc)
        return ordered

    def _entries(self, url: str) -> list[tuple[str, str]]:
        self._last_xml = self.session.get(url).text
        return [(loc.strip(), (lastmod or "").strip()) for loc, lastmod in _LOC_RE.findall(self._last_xml)]

    _last_xml: str = ""


class KumariJobAdapter(JsonLdSitemapAdapter):
    platform = "kumarijob"
    base_url = "https://www.kumarijob.com"
    sitemap_url = "https://www.kumarijob.com/sitemap.xml"
    job_sitemap_pattern = re.compile(r"/sitemap-jobs\.xml$", re.I)
    # /<company-slug>/<numeric-id>-<title-slug>
    job_url_pattern = re.compile(r"^https://www\.kumarijob\.com/[^/]+/\d+-[^/]+/?$")


class FroxjobAdapter(JsonLdSitemapAdapter):
    platform = "froxjob"
    base_url = "https://froxjob.com"
    sitemap_url = "https://froxjob.com/sitemap.xml"
    job_sitemap_pattern = re.compile(r"/sitemap/jobs\.xml$", re.I)
    # /<title-slug>-<numeric-id>
    job_url_pattern = re.compile(r"^https://froxjob\.com/[^/]+-\d+/?$")


class MerorojgariAdapter(JsonLdSitemapAdapter):
    platform = "merorojgari"
    base_url = "https://merorojgari.com"
    # WordPress (WP Job Manager) index -> job_listing-sitemapN.xml
    sitemap_url = "https://merorojgari.com/sitemap_index.xml"
    job_sitemap_pattern = re.compile(r"/job_listing-sitemap\d*\.xml$", re.I)
    max_sitemaps = 2
    # /job/<slug>/
    job_url_pattern = re.compile(r"^https://merorojgari\.com/job/[^/]+/?$")


class JobsNepalAdapter(JsonLdSitemapAdapter):
    platform = "jobsnepal"
    base_url = "https://www.jobsnepal.com"
    sitemap_url = "https://www.jobsnepal.com/sitemap.xml"
    job_sitemap_pattern = re.compile(r"/jobs-sitemap\.xml$", re.I)
    # /<title-slug>-<numeric-id>
    job_url_pattern = re.compile(r"^https://www\.jobsnepal\.com/[^/]+-\d+/?$")


class RojgariAdapter(JsonLdSitemapAdapter):
    platform = "rojgari"
    base_url = "https://rojgari.com"
    sitemap_url = "https://rojgari.com/sitemap.xml"
    job_sitemap_pattern = re.compile(r"/sitemap-jobs\.xml$", re.I)
    # /job/<slug>/detail
    job_url_pattern = re.compile(r"^https://rojgari\.com/job/[^/]+/detail/?$")


class NepaliJobAdapter(JsonLdSitemapAdapter):
    platform = "nepalijob"
    base_url = "https://nepalijob.com"
    sitemap_url = "https://nepalijob.com/sitemap.xml"
    # Index -> sitemap-jobs.xml?page=N (query string, so no end-anchor here).
    job_sitemap_pattern = re.compile(r"/sitemap-jobs\.xml", re.I)
    # /job/<numeric-id>/<title-slug>-in-<location>
    job_url_pattern = re.compile(r"^https://nepalijob\.com/job/\d+/[^/]+/?$")
