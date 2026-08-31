"""Merojob adapter.

Merojob's public web app is a client-rendered Next.js bundle, but it is backed
by a **public, unauthenticated JSON API** at ``api.merojob.com/api/v1/jobs/``
(DRF-style ``limit``/``offset`` pagination). Reading that is strictly kinder to
the site than scraping rendered HTML: one request returns 50 fully-structured
postings instead of 50 page loads.

Compliance notes (verified 2026-08-30):
  * ``merojob.com/robots.txt``     -> ``User-agent: *`` with an empty
    ``Disallow:`` (everything allowed) and no ``Crawl-delay``.
  * ``api.merojob.com/robots.txt`` -> comments only, i.e. no restrictions.
  * Both declare ``Content-Signal: ai-train=no, search=yes, ai-input=yes``.
    Khoj only builds a search index and feeds text into a model at
    request time (``ai-input``); nothing here is used to train a model.
"""

from __future__ import annotations

import logging
import re
from typing import Any, Iterator

from adapters.base import SourceAdapter
from core.normalize import clean_text, find_apply_link

logger = logging.getLogger(__name__)

_TAG_RE = re.compile(r"<[^>]+>")
_ENTITY_FIXES = (("&nbsp;", " "), ("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&#39;", "'"), ("&quot;", '"'))

_LEVEL_MAP = {
    "entry level": "entry",
    "fresher": "entry",
    "junior level": "entry",
    "mid level": "mid",
    "senior level": "senior",
    "top level": "senior",
    "top management": "senior",
}

_EDU_MAP = {
    "under graduate (bachelor)": "bachelor",
    "graduate (masters)": "master",
    "post graduate": "master",
    "intermediate (+2)": "diploma",
    "higher secondary (+2/a levels)": "diploma",
    "diploma": "diploma",
    "phd": "phd",
    "slc": "slc",
    "see": "slc",
}

_TYPE_MAP = {
    "full time": "full-time",
    "part time": "part-time",
    "internship": "internship",
    "contract": "contract",
    "freelance": "contract",
    "remote": "remote",
    "traineeship": "internship",
}


def html_to_text(html: str | None) -> str:
    """Flatten the API's HTML fragments into readable plain text."""
    if not html:
        return ""
    text = str(html)
    text = re.sub(r"<\s*(br|/p|/div|/li|/h[1-6])\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"<\s*li[^>]*>", "\n• ", text, flags=re.I)
    text = _TAG_RE.sub(" ", text)
    for needle, replacement in _ENTITY_FIXES:
        text = text.replace(needle, replacement)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    return "\n".join(line for line in lines if line)


class MerojobAdapter(SourceAdapter):
    platform = "merojob"
    base_url = "https://merojob.com"
    api_url = "https://api.merojob.com/api/v1/jobs/"
    page_size = 50
    max_pages = 5
    max_jobs = 250

    def fetch_raw_jobs(self) -> Iterator[dict[str, Any]]:
        next_url: str | None = f"{self.api_url}?limit={self.page_size}&offset=0"
        pages = 0

        while next_url and pages < self.max_pages:
            logger.info("[%s] GET %s", self.platform, next_url)
            payload = self.session.get(next_url, headers={"Accept": "application/json"}).json()
            pages += 1

            results = payload.get("results") or []
            if not results:
                break
            for item in results:
                mapped = self._map(item)
                if mapped:
                    yield mapped

            next_url = payload.get("next")

    # ------------------------------------------------------------------ mapping
    def _map(self, item: dict[str, Any]) -> dict[str, Any] | None:
        if item.get("status") and str(item["status"]).lower() != "published":
            return None

        title = (item.get("title") or "").strip()
        slug_path = item.get("absolute_url") or (f"/{item['slug']}/" if item.get("slug") else "")
        if not title or not slug_path:
            return None

        client = item.get("client") or {}
        company = "Confidential" if item.get("hide_org_name") else (client.get("client_name") or "").strip()

        description = "\n\n".join(
            part
            for part in (
                html_to_text(item.get("description")),
                html_to_text(item.get("specification")),
                html_to_text(item.get("extra_description")) if item.get("extra_description") not in (None, "None") else "",
            )
            if part
        )

        return {
            "title": title,
            "company": company,
            "description": description or html_to_text(item.get("job_summary")),
            "requirements": html_to_text(item.get("specification")),
            "requiredSkills": [s for s in (item.get("skills") or []) if s],
            "experienceLevel": self._level(item),
            "experienceRaw": item.get("experience_required") or "",
            "educationRequirement": _EDU_MAP.get(str(item.get("education_level") or "").strip().lower(), ""),
            "educationRaw": " ".join(
                filter(None, [str(item.get("education_level") or ""), html_to_text(item.get("education_description"))])
            ),
            "jobType": self._job_type(item),
            "jobTypeRaw": ", ".join(item.get("available_for") or []),
            "location": self._location(item),
            "salary": self._salary(item),
            "deadline": item.get("deadline"),
            "postedDate": item.get("posted_at") or item.get("posted_date"),
            "sourceUrl": self.absolute(slug_path),
            "applyUrl": self._apply_url(item),
        }

    @staticmethod
    def _apply_url(item: dict[str, Any]) -> str:
        """The employer's own application route, when the API names one.

        Merojob marks some postings as external and carries the destination in
        one of a few fields; otherwise the "how to apply" blurb is the only
        place a real link or hiring email appears. ``normalize`` validates and
        rejects anything that just points back at the Merojob post.
        """
        for key in ("apply_url", "external_apply_url", "external_url", "application_url", "apply_link"):
            value = clean_text(item.get(key))
            if value:
                return value
        return find_apply_link(
            item.get("how_to_apply"), item.get("apply_procedure"), item.get("apply_instruction")
        ) or ""

    @staticmethod
    def _level(item: dict[str, Any]) -> str:
        return _LEVEL_MAP.get(str(item.get("job_level") or "").strip().lower(), "")

    @staticmethod
    def _job_type(item: dict[str, Any]) -> str:
        for value in item.get("available_for") or []:
            mapped = _TYPE_MAP.get(str(value).strip().lower())
            if mapped:
                return mapped
        return ""

    @staticmethod
    def _location(item: dict[str, Any]) -> str:
        parts: list[str] = []
        for loc in item.get("job_locations") or []:
            for key in ("address", "name", "district", "local_government", "province"):
                value = loc.get(key)
                label = value.get("name") if isinstance(value, dict) else value
                if label and str(label).strip() and str(label).strip() not in parts:
                    parts.append(str(label).strip())
                    break
        return ", ".join(parts[:3])

    @staticmethod
    def _salary(item: dict[str, Any]) -> str:
        if item.get("hide_salary"):
            return ""
        salary = item.get("offered_salary") or {}
        minimum, maximum = salary.get("minimum"), salary.get("maximum")
        if not minimum and not maximum:
            return ""
        currency = salary.get("currency") or "NRs"
        unit = salary.get("unit") or ""

        def fmt(value: Any) -> str:
            return f"{float(value):,.0f}"

        amount = fmt(minimum) if not maximum or minimum == maximum else f"{fmt(minimum)} - {fmt(maximum)}"
        return " ".join(part for part in (currency, amount, f"/ {unit}" if unit else "") if part)
