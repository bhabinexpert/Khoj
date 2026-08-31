"""Documented, no-auth JSON job feeds.

Some boards publish an open JSON endpoint instead of (or as well as) HTML pages.
That is the friendliest contract there is: one GET returns structured jobs, so
there is nothing to scrape and nothing to break when markup changes. These
adapters read those feeds and map them onto the same raw-dict shape every other
source produces, so dedupe, matching and ingest treat them identically.

Both feeds here are worldwide *remote* boards — the slice that matters to a
Nepal-based jobseeker: work you can actually do from Nepal. Requests still pass
through :class:`~core.http.PoliteSession` (robots.txt + rate limiting); each
endpoint's ``robots.txt`` was checked to allow it (verified 2026-08-31):
Himalayas (``Allow: /``) and Arbeitnow (its Job Board API is publicly
documented and not disallowed).
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any, Iterator

from adapters.base import SourceAdapter

logger = logging.getLogger(__name__)


def _html_to_text(html: Any) -> str:
    # Lazy import keeps adapters.merojob off the import path until needed.
    from adapters.merojob import html_to_text

    return html_to_text(html)


def _unix_to_iso(value: Any) -> str | None:
    """Seconds-since-epoch → ISO-8601 UTC; ``None`` for anything unparseable."""
    try:
        ts = int(value)
    except (TypeError, ValueError):
        return None
    if ts <= 0:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def _money(min_value: Any, max_value: Any, currency: Any, period: Any) -> str:
    """Assemble a human salary string from separate min/max/currency/period."""

    def num(value: Any) -> str:
        try:
            return f"{int(float(value)):,}"
        except (TypeError, ValueError):
            return ""

    low, high = num(min_value), num(max_value)
    if not low and not high:
        return ""
    amount = low or high if (not low or not high or low == high) else f"{low} - {high}"
    parts = [str(currency or "").strip().upper(), amount]
    salary = " ".join(p for p in parts if p)
    per = str(period or "").strip()
    return f"{salary} / {per}" if per else salary


class JsonApiAdapter(SourceAdapter):
    """Base: read a documented, no-auth JSON jobs endpoint.

    Subclasses set :attr:`api_url` and implement :meth:`records` (pull the list
    of job objects out of the payload) and :meth:`to_raw` (map one object onto
    the raw-dict contract). Politeness and per-posting error isolation come from
    :class:`SourceAdapter`, exactly as for the HTML/sitemap sources.
    """

    #: Documented JSON endpoint returning the job feed.
    api_url: str = ""
    max_jobs: int = 25

    def records(self, payload: Any) -> list[dict[str, Any]]:
        raise NotImplementedError

    def to_raw(self, record: dict[str, Any]) -> dict[str, Any] | None:
        raise NotImplementedError

    def fetch_raw_jobs(self) -> Iterator[dict[str, Any]]:
        payload = self.session.get(self.api_url).json()
        records = self.records(payload)
        logger.info("[%s] API returned %s record(s)", self.platform, len(records))
        for record in records[: self.max_jobs]:
            raw = self.to_raw(record)
            if raw and raw.get("title"):
                yield raw


_EMPLOYMENT = {
    "full time": "full-time",
    "full-time": "full-time",
    "part time": "part-time",
    "part-time": "part-time",
    "contract": "contract",
    "contractor": "contract",
    "freelance": "contract",
    "temporary": "contract",
    "internship": "internship",
    "intern": "internship",
}

_SENIORITY = {
    "entry": "entry",
    "entry-level": "entry",
    "junior": "entry",
    "graduate": "entry",
    "mid": "mid",
    "mid-level": "mid",
    "intermediate": "mid",
    "associate": "mid",
    "senior": "senior",
    "lead": "senior",
    "principal": "senior",
    "staff": "senior",
    "director": "senior",
    "executive": "senior",
    "manager": "senior",
}


class HimalayasAdapter(JsonApiAdapter):
    """Himalayas — a remote-only board with a rich, documented JSON feed.

    Every posting carries a salary band, seniority, an expiry date and a canonical
    ``guid`` URL, so these map cleanly onto the full canonical shape.
    """

    platform = "himalayas"
    base_url = "https://himalayas.app"
    api_url = "https://himalayas.app/jobs/api?limit=50"

    def records(self, payload: Any) -> list[dict[str, Any]]:
        return payload.get("jobs", []) if isinstance(payload, dict) else []

    def to_raw(self, record: dict[str, Any]) -> dict[str, Any] | None:
        url = str(record.get("guid") or "").strip()
        if not url.startswith("http"):
            return None

        restrictions = [str(r).strip() for r in (record.get("locationRestrictions") or []) if r]
        location = f"Remote ({', '.join(restrictions)})" if restrictions else "Remote (Worldwide)"

        seniority = [str(s).strip().lower() for s in (record.get("seniority") or [])]
        experience = next((_SENIORITY[s] for s in seniority if s in _SENIORITY), "")

        apply_link = str(record.get("applicationLink") or "").strip()
        return {
            "title": record.get("title"),
            "company": record.get("companyName"),
            "description": _html_to_text(record.get("description") or record.get("excerpt")),
            "jobType": _EMPLOYMENT.get(str(record.get("employmentType") or "").strip().lower(), ""),
            "experienceLevel": experience,
            "location": location,
            "salary": _money(
                record.get("minSalary"), record.get("maxSalary"),
                record.get("currency"), record.get("salaryPeriod"),
            ),
            "deadline": _unix_to_iso(record.get("expiryDate")),
            "postedDate": _unix_to_iso(record.get("pubDate")),
            "sourceUrl": url,
            # Same host as the listing, so clean_apply_url drops it as a self-link.
            "applyUrl": apply_link if apply_link and apply_link != url else None,
        }


class ArbeitnowAdapter(JsonApiAdapter):
    """Arbeitnow — a public, documented Job Board API. Filtered to remote roles,
    which are the ones a Nepal-based applicant can realistically take."""

    platform = "arbeitnow"
    base_url = "https://www.arbeitnow.com"
    api_url = "https://www.arbeitnow.com/api/job-board-api"

    def records(self, payload: Any) -> list[dict[str, Any]]:
        data = payload.get("data", []) if isinstance(payload, dict) else []
        return [job for job in data if job.get("remote")]

    def to_raw(self, record: dict[str, Any]) -> dict[str, Any] | None:
        url = str(record.get("url") or "").strip()
        if not url.startswith("http"):
            return None
        return {
            "title": record.get("title"),
            "company": record.get("company_name"),
            "description": _html_to_text(record.get("description")),
            "jobType": "remote",
            "location": f"Remote — {record.get('location')}" if record.get("location") else "Remote",
            "postedDate": _unix_to_iso(record.get("created_at")),
            "sourceUrl": url,
        }
