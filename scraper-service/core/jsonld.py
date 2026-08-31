"""Shared schema.org ``JobPosting`` reader.

Most Nepali job boards publish a ``<script type="application/ld+json">``
JobPosting block on every detail page — the exact structured data Google Jobs
consumes, and a far kinder, more stable contract than scraping rendered markup.
This module turns that block into the loose dict shape
:func:`core.normalize.normalize_job` expects, so a new source usually needs
nothing more than a sitemap URL and a job-URL pattern (see
:class:`adapters.jsonld.JsonLdSitemapAdapter`).

Everything here degrades quietly: a page with no JobPosting yields ``None`` and
a malformed field is skipped, never raised, so one odd posting cannot abort a
run.
"""

from __future__ import annotations

import json
import re
from typing import Any

from .normalize import clean_text, find_apply_link

_LDJSON_RE = re.compile(r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)

#: schema.org ``employmentType`` -> our canonical ``jobType`` (``""`` = let
#: :func:`core.normalize.detect_job_type` decide from the title/description).
_EMPLOYMENT_TYPE = {
    "full_time": "full-time",
    "fulltime": "full-time",
    "part_time": "part-time",
    "parttime": "part-time",
    "contractor": "contract",
    "contract": "contract",
    "temporary": "contract",
    "intern": "internship",
    "internship": "internship",
    "per_diem": "part-time",
}


def _iter_jsonld(html: str):
    """Yield every JSON object embedded in a page's ld+json blocks.

    Handles the three shapes seen in the wild: a bare object, a list of
    objects, and a ``@graph`` wrapper. Malformed blocks are skipped.
    """
    for block in _LDJSON_RE.findall(html or ""):
        try:
            data = json.loads(block.strip())
        except (json.JSONDecodeError, ValueError):
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop(0)
            if not isinstance(node, dict):
                continue
            graph = node.get("@graph")
            if isinstance(graph, list):
                stack.extend(graph)
            yield node


def _is_jobposting(node: dict[str, Any]) -> bool:
    node_type = node.get("@type")
    types = node_type if isinstance(node_type, list) else [node_type]
    return any(str(t).lower() == "jobposting" for t in types)


def find_job_posting(html: str) -> dict[str, Any] | None:
    """Return the first schema.org ``JobPosting`` object on the page, if any."""
    for node in _iter_jsonld(html):
        if _is_jobposting(node):
            return node
    return None


def _text(html_value: Any) -> str:
    """Flatten a possibly-HTML schema.org string into readable plain text."""
    # Imported lazily to avoid a hard dependency cycle at module import time.
    from adapters.merojob import html_to_text

    return html_to_text(html_value) if html_value else ""


def _organization_name(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("name"))
    if isinstance(value, list) and value:
        return _organization_name(value[0])
    return clean_text(value)


def _employment_type(value: Any) -> str:
    values = value if isinstance(value, list) else [value]
    for candidate in values:
        mapped = _EMPLOYMENT_TYPE.get(str(candidate or "").strip().lower().replace("-", "_"))
        if mapped:
            return mapped
    return ""


def _location(value: Any) -> str:
    entries = value if isinstance(value, list) else [value]
    parts: list[str] = []
    for entry in entries:
        address = entry.get("address") if isinstance(entry, dict) else None
        if isinstance(address, str):
            candidate = clean_text(address)
            if candidate and candidate not in parts:
                parts.append(candidate)
            continue
        if not isinstance(address, dict):
            continue
        for key in ("addressLocality", "streetAddress", "addressRegion", "addressCountry"):
            candidate = clean_text(address.get(key))
            if isinstance(address.get(key), dict):
                candidate = clean_text(address[key].get("name"))
            if candidate and candidate not in parts:
                parts.append(candidate)
                break
    return ", ".join(parts[:3])


def _salary(value: Any) -> str:
    if not isinstance(value, dict):
        return ""
    currency = clean_text(value.get("currency") or value.get("salaryCurrency")) or "NPR"
    inner = value.get("value")
    unit = ""
    amount = ""
    if isinstance(inner, dict):
        unit = clean_text(inner.get("unitText"))
        low = clean_text(inner.get("minValue") or inner.get("value"))
        high = clean_text(inner.get("maxValue"))
        if low and high and low != high:
            amount = f"{low} - {high}"
        else:
            amount = low or high
    elif inner not in (None, ""):
        amount = clean_text(inner)
    if not amount or amount.lower() in ("0", "negotiable"):
        return "Negotiable" if str(inner).lower() == "negotiable" else ""
    return " ".join(part for part in (currency, amount, f"/ {unit}" if unit else "") if part)


def _education(value: Any) -> str:
    if isinstance(value, dict):
        return clean_text(value.get("credentialCategory") or value.get("name"))
    if isinstance(value, list):
        return " ".join(_education(v) for v in value if v).strip()
    return clean_text(value)


def _experience(value: Any) -> str:
    if isinstance(value, dict):
        months = value.get("monthsOfExperience")
        try:
            years = int(months) // 12
            if years >= 1:
                return f"{years}+ years"
        except (TypeError, ValueError):
            pass
        return clean_text(value.get("description") or value.get("experienceRequirements"))
    return clean_text(value)


def _skills(value: Any) -> list[str]:
    if isinstance(value, list):
        return [clean_text(v) for v in value if clean_text(v)]
    text = clean_text(value)
    if not text:
        return []
    # schema.org packs skills into one comma/semicolon-separated string.
    return [part.strip() for part in re.split(r"[;,]", text) if part.strip()]


def _apply_url(posting: dict[str, Any]) -> str:
    """Best-effort employer application route from the JobPosting object."""
    direct = posting.get("url") or posting.get("applicationUrl")
    if isinstance(direct, str) and direct.strip().startswith(("http", "mailto:")):
        # ``url`` is often the posting itself; normalize rejects a self-link, so
        # this only survives when it points somewhere genuinely external.
        return direct.strip()
    return find_apply_link(posting.get("applicationContact"), posting.get("description")) or ""


def jobposting_to_raw(posting: dict[str, Any], *, source_url: str) -> dict[str, Any] | None:
    """Map a schema.org ``JobPosting`` onto the adapter raw-dict contract."""
    title = clean_text(posting.get("title"))
    if not title:
        return None
    return {
        "title": title,
        "company": _organization_name(posting.get("hiringOrganization")),
        "description": _text(posting.get("description")),
        "requirements": _text(posting.get("responsibilities") or posting.get("qualifications")),
        "requiredSkills": _skills(posting.get("skills")),
        "experienceRaw": _experience(posting.get("experienceRequirements")),
        "educationRaw": _education(posting.get("educationRequirements")),
        "jobType": _employment_type(posting.get("employmentType")),
        "jobTypeRaw": clean_text(posting.get("employmentType") if not isinstance(posting.get("employmentType"), (list, dict)) else ""),
        "location": _location(posting.get("jobLocation")),
        "salary": _salary(posting.get("baseSalary")),
        "deadline": posting.get("validThrough"),
        "postedDate": posting.get("datePosted"),
        "sourceUrl": source_url,
        "applyUrl": _apply_url(posting),
    }
