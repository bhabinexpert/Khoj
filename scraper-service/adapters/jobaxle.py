"""JobAxle adapter.

JobAxle is a Next.js App Router site, so the job list is client-rendered — but
two machine-readable contracts are published and both are used here:

1. ``/sitemap.xml`` — explicitly advertised in ``robots.txt``; gives every
   ``/jobs/<slug>`` URL plus a ``lastmod`` so we can crawl newest-first and
   stop early instead of walking the whole archive.
2. Each detail page ships a ``application/ld+json`` **schema.org JobPosting**
   block (title, hiringOrganization, datePosted, validThrough,
   employmentType, jobLocation, baseSalary) — data the site publishes
   specifically for machine consumption.

The React Server Component payload embedded in the same page carries the full
``jobDescription``/``jobSpecification``/``educationRequired`` HTML, so it is
used as *optional enrichment*: if the payload shape changes, the adapter still
produces a valid posting from the JSON-LD alone.

Compliance notes (verified 2026-08-30): ``robots.txt`` allows ``/jobs`` and the
sitemap for ``User-agent: *`` and disallows only ``/admin``, ``/auth`` and
``/axletech`` — none of which are touched. No ``Crawl-delay`` is declared, so
the conservative :class:`~core.http.PoliteSession` default applies.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Iterator

from adapters.base import SourceAdapter
from adapters.merojob import html_to_text
from core.normalize import clean_text, find_apply_link

logger = logging.getLogger(__name__)

_LDJSON_RE = re.compile(r'<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>', re.S)
_RSC_RE = re.compile(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)')
_JOB_PATH_RE = re.compile(r"^https://jobaxle\.com/jobs/[^/]+$")
_LOC_RE = re.compile(r"<loc>(.*?)</loc>\s*(?:<lastmod>(.*?)</lastmod>)?", re.S)

_LEVEL_MAP = {
    "entry level": "entry",
    "fresher": "entry",
    "junior level": "entry",
    "mid level": "mid",
    "senior level": "senior",
    "top level": "senior",
}

_EDU_MAP = {
    "bachelor's": "bachelor",
    "bachelors": "bachelor",
    "master's": "master",
    "masters": "master",
    "intermediate": "diploma",
    "diploma": "diploma",
    "phd": "phd",
    "slc": "slc",
    "see": "slc",
}

_TYPE_MAP = {
    "full time": "full-time",
    "part time": "part-time",
    "internship": "internship",
    "intern": "internship",
    "contract": "contract",
    "temporary": "contract",
    "freelance": "contract",
    "remote": "remote",
    "traineeship": "internship",
}


class JobaxleAdapter(SourceAdapter):
    platform = "jobaxle"
    base_url = "https://jobaxle.com"
    sitemap_url = "https://jobaxle.com/sitemap.xml"
    #: Detail pages fetched per run — each one is a full page load, so keep it low.
    max_detail_pages = 40
    max_jobs = 40

    def fetch_raw_jobs(self) -> Iterator[dict[str, Any]]:
        urls = self._job_urls()
        logger.info("[%s] sitemap yielded %s job URL(s)", self.platform, len(urls))

        for url in urls[: self.max_detail_pages]:
            html = self.session.get(url).text
            posting = self._parse_ldjson(html)
            if not posting:
                logger.debug("[%s] no JobPosting JSON-LD on %s", self.platform, url)
                continue
            yield self._build(posting, self._parse_rsc(html), url)

    # ----------------------------------------------------------------- sitemap
    def _job_urls(self) -> list[str]:
        xml = self.session.get(self.sitemap_url).text
        entries: list[tuple[str, str]] = []
        for loc, lastmod in _LOC_RE.findall(xml):
            loc = loc.strip()
            if _JOB_PATH_RE.match(loc):
                entries.append((loc, (lastmod or "").strip()))
        # Newest first; blank lastmod sorts last.
        entries.sort(key=lambda item: item[1] or "", reverse=True)
        return [loc for loc, _ in entries]

    # ---------------------------------------------------------------- parsing
    @staticmethod
    def _parse_ldjson(html: str) -> dict[str, Any] | None:
        for block in _LDJSON_RE.findall(html):
            try:
                data = json.loads(block.strip())
            except json.JSONDecodeError:
                continue
            candidates = data if isinstance(data, list) else [data]
            for candidate in candidates:
                if isinstance(candidate, dict) and candidate.get("@type") == "JobPosting":
                    return candidate
        return None

    @staticmethod
    def _parse_rsc(html: str) -> dict[str, Any]:
        """Best-effort extraction of the embedded ``jobDetail`` object."""
        chunks: list[str] = []
        for raw in _RSC_RE.findall(html):
            try:
                chunks.append(json.loads(raw))
            except json.JSONDecodeError:
                continue
        payload = "".join(chunks)

        marker = '"jobDetail":{"jobDetail":'
        start = payload.find(marker)
        if start == -1:
            return {}
        start += len(marker)

        end = JobaxleAdapter._matching_brace(payload, start)
        if end == -1:
            return {}
        try:
            return json.loads(payload[start : end + 1])
        except json.JSONDecodeError:
            return {}

    @staticmethod
    def _matching_brace(text: str, start: int) -> int:
        """Index of the ``}`` closing the ``{`` at ``start``, or ``-1``.

        String-aware, so braces inside JSON string values do not confuse the
        depth counter.
        """
        if start >= len(text) or text[start] != "{":
            return -1
        depth = 0
        in_string = False
        escaped = False
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
                continue
            if char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    return index
        return -1

    # --------------------------------------------------------------- assembly
    def _build(self, posting: dict[str, Any], detail: dict[str, Any], url: str) -> dict[str, Any]:
        title = (posting.get("title") or detail.get("jobTitle") or "").strip()

        org = posting.get("hiringOrganization") or {}
        company = (org.get("name") if isinstance(org, dict) else str(org or "")) or ""

        description = "\n\n".join(
            part
            for part in (
                html_to_text(detail.get("jobPurpose")),
                html_to_text(detail.get("jobDescription")),
                html_to_text(detail.get("jobSpecification")),
            )
            if part
        ) or html_to_text(posting.get("description"))

        job_type_raw = str(
            (detail.get("jobtype") or {}).get("title") or posting.get("employmentType") or ""
        ).strip()
        level_raw = str((detail.get("joblevel") or {}).get("title") or "").strip()
        edu_raw = str((detail.get("educationlevel") or {}).get("title") or "").strip()

        return {
            "title": title,
            "company": company.strip(),
            "description": description,
            "requirements": "\n".join(
                filter(
                    None,
                    [html_to_text(detail.get("jobSpecification")), html_to_text(detail.get("educationRequired"))],
                )
            ),
            "experienceLevel": _LEVEL_MAP.get(level_raw.lower(), ""),
            "experienceRaw": self._experience_note(detail, level_raw),
            "educationRequirement": _EDU_MAP.get(edu_raw.lower(), ""),
            "educationRaw": " ".join(filter(None, [edu_raw, html_to_text(detail.get("educationRequired"))])),
            "jobType": _TYPE_MAP.get(job_type_raw.lower(), ""),
            "jobTypeRaw": job_type_raw,
            "location": self._location(posting),
            "salary": self._salary(posting, detail),
            "deadline": posting.get("validThrough"),
            "postedDate": posting.get("datePosted"),
            "sourceUrl": url,
            "applyUrl": self._apply_url(posting, detail),
        }

    @staticmethod
    def _apply_url(posting: dict[str, Any], detail: dict[str, Any]) -> str:
        """The employer's own application destination, when JobAxle carries one.

        The embedded RSC ``jobDetail`` sometimes names an external apply URL
        directly; failing that, the "how to apply" HTML is the only place a real
        link or hiring email shows up. ``normalize`` rejects anything that just
        points back at the JobAxle post.
        """
        for key in ("applyUrl", "externalApplyUrl", "externalUrl", "applyLink", "applicationUrl"):
            value = clean_text(detail.get(key))
            if value:
                return value
        return find_apply_link(detail.get("howToApply"), detail.get("applyProcedure")) or ""

    @staticmethod
    def _experience_note(detail: dict[str, Any], level_raw: str) -> str:
        minimum = str(detail.get("minExperience") or "").strip()
        # JobAxle stores "no maximum" as -2; only render a real upper bound.
        maximum = str(detail.get("maxExperience") or "").strip()
        if minimum and minimum not in ("0", "-1", "-2"):
            span = f"{minimum}+ years" if maximum in ("", "-1", "-2", "0") else f"{minimum}-{maximum} years"
            return f"{span} {level_raw}".strip()
        return level_raw

    @staticmethod
    def _location(posting: dict[str, Any]) -> str:
        locations = posting.get("jobLocation")
        locations = locations if isinstance(locations, list) else [locations]
        parts: list[str] = []
        for entry in locations:
            address = (entry or {}).get("address") if isinstance(entry, dict) else None
            if not isinstance(address, dict):
                continue
            for key in ("addressLocality", "streetAddress", "addressRegion"):
                value = str(address.get(key) or "").strip()
                if value and value not in parts:
                    parts.append(value)
                    break
        return ", ".join(parts[:3])

    @staticmethod
    def _salary(posting: dict[str, Any], detail: dict[str, Any]) -> str:
        base = posting.get("baseSalary") or {}
        value = base.get("value") if isinstance(base, dict) else None
        amount = str((value or {}).get("value") or "").strip() if isinstance(value, dict) else ""
        if amount and amount.lower() not in ("negotiable", "0", ""):
            currency = str(base.get("currency") or "NPR").strip()
            unit = str((value or {}).get("unitText") or "").strip()
            return " ".join(filter(None, [currency, amount, f"/ {unit}" if unit else ""]))
        if str(detail.get("salaryType") or "").lower() == "negotiable":
            return "Negotiable"
        return ""
