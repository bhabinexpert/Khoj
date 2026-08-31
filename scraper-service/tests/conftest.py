"""Shared fixtures for the scraper-service test suite.

Every test runs fully offline: HTTP is intercepted by ``responses`` and the
:class:`~core.http.PoliteSession` under test is built with its politeness
delays set to zero, so the suite finishes in well under a second instead of
sleeping the production 3s-per-request floor.
"""

from __future__ import annotations

import json

import pytest

from core.http import PoliteSession


@pytest.fixture
def fast_session() -> PoliteSession:
    """A PoliteSession with the throttling and robots gate switched off.

    ``obey_robots=False`` is documented on the class as "tests only"; the
    robots behaviour itself is covered explicitly in ``test_http.py``.
    """
    session = PoliteSession(min_delay=0.0, jitter=0.0, obey_robots=False, max_retries=1)
    yield session
    session.close()


# --------------------------------------------------------------- merojob payload
def merojob_item(**overrides) -> dict:
    """One posting shaped like ``api.merojob.com/api/v1/jobs/`` returns them."""
    item = {
        "status": "published",
        "title": "Frontend Developer",
        "slug": "frontend-developer-leapfrog",
        "absolute_url": "/frontend-developer-leapfrog/",
        "client": {"client_name": "Leapfrog Technology"},
        "hide_org_name": False,
        "description": "<p>Build modern web UIs with <b>React</b>.</p><ul><li>Ship features</li></ul>",
        "specification": "<p>Requirements:</p><ul><li>2 years with React and Node.js</li></ul>",
        "extra_description": "None",
        "job_summary": "<p>Frontend role</p>",
        "skills": ["React", "JavaScript", ""],
        "job_level": "Mid Level",
        "experience_required": "2 years",
        "education_level": "Under Graduate (Bachelor)",
        "education_description": "<p>BE in Computer Engineering</p>",
        "available_for": ["Full Time"],
        "job_locations": [{"address": "Charkhal, Dillibazar", "district": {"name": "Kathmandu"}}],
        "hide_salary": False,
        "offered_salary": {"minimum": 60000, "maximum": 90000, "currency": "NRs", "unit": "Month"},
        "deadline": "2026-09-30",
        "posted_at": "2026-08-25T04:00:00Z",
    }
    item.update(overrides)
    return item


def merojob_page(results: list[dict], next_url: str | None = None) -> dict:
    return {"count": len(results), "next": next_url, "previous": None, "results": results}


# --------------------------------------------------------------- jobaxle payload
def jobaxle_sitemap(entries: list[tuple[str, str]]) -> str:
    body = "\n".join(
        f"  <url><loc>{loc}</loc><lastmod>{lastmod}</lastmod></url>" for loc, lastmod in entries
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset>\n{body}\n</urlset>'


def jobaxle_detail_html(posting: dict, detail: dict | None = None) -> str:
    """A JobAxle detail page: schema.org JSON-LD plus an optional RSC payload."""
    ldjson = json.dumps({"@context": "https://schema.org", **posting})
    script = f'<script type="application/ld+json">{ldjson}</script>'

    rsc = ""
    if detail is not None:
        # The real page streams the RSC flight payload as escaped JSON strings,
        # with no whitespace — the adapter's marker search depends on that.
        chunk = "3:" + json.dumps({"jobDetail": {"jobDetail": detail}}, separators=(",", ":"))
        rsc = f"<script>self.__next_f.push([1,{json.dumps(chunk)}])</script>"

    return f"<!doctype html><html><head>{script}</head><body>{rsc}</body></html>"


def jobaxle_posting(**overrides) -> dict:
    posting = {
        "@type": "JobPosting",
        "title": "Backend Engineer",
        "description": "<p>Fallback description from JSON-LD.</p>",
        "hiringOrganization": {"@type": "Organization", "name": "F1Soft International"},
        "datePosted": "2026-08-20",
        "validThrough": "2026-09-15",
        "employmentType": "FULL_TIME",
        "jobLocation": [{"@type": "Place", "address": {"addressLocality": "Lalitpur"}}],
        "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "NPR",
            "value": {"@type": "QuantitativeValue", "value": "80000", "unitText": "MONTH"},
        },
    }
    posting.update(overrides)
    return posting


def sitemap_index(children: list[tuple[str, str]]) -> str:
    """A ``<sitemapindex>`` pointing at child sitemaps (loc, lastmod)."""
    body = "\n".join(
        f"  <sitemap><loc>{loc}</loc><lastmod>{lastmod}</lastmod></sitemap>" for loc, lastmod in children
    )
    return f'<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex>\n{body}\n</sitemapindex>'


def jobposting_ldjson(**overrides) -> dict:
    """A schema.org JobPosting object as boards embed it for Google Jobs."""
    posting = {
        "@context": "https://schema.org/",
        "@type": "JobPosting",
        "title": "Digital Marketing Manager",
        "description": "<p>Lead campaigns with <b>SEO</b> and Google Ads.</p><ul><li>Grow traffic</li></ul>",
        "hiringOrganization": {"@type": "Organization", "name": "Ayurpura Ayurveda Pvt. Ltd."},
        "datePosted": "2026-08-20",
        "validThrough": "2026-09-13",
        "employmentType": "FULL_TIME",
        "jobLocation": [{"@type": "Place", "address": {"@type": "PostalAddress", "addressLocality": "Kathmandu"}}],
        "baseSalary": {
            "@type": "MonetaryAmount",
            "currency": "NPR",
            "value": {"@type": "QuantitativeValue", "minValue": "25000", "maxValue": "30000", "unitText": "MONTH"},
        },
        "educationRequirements": {"@type": "EducationalOccupationalCredential", "credentialCategory": "Bachelor's"},
        "experienceRequirements": {"@type": "OccupationalExperienceRequirements", "monthsOfExperience": "36"},
        "skills": "SEO, Google Ads, Content Marketing",
    }
    posting.update(overrides)
    return posting


def jobposting_page(posting: dict | None = None, *, graph: bool = False, noise: bool = True) -> str:
    """A detail page carrying a JobPosting ld+json block.

    ``graph`` nests the posting under ``@graph``; ``noise`` adds an unrelated
    Organization block first, so the finder must pick the JobPosting out.
    """
    posting = posting if posting is not None else jobposting_ldjson()
    blocks = []
    if noise:
        blocks.append(json.dumps({"@context": "https://schema.org", "@type": "Organization", "name": "Some Board"}))
    if graph:
        blocks.append(json.dumps({"@context": "https://schema.org", "@graph": [posting]}))
    else:
        blocks.append(json.dumps(posting))
    scripts = "".join(f'<script type="application/ld+json">{b}</script>' for b in blocks)
    return f"<!doctype html><html><head>{scripts}</head><body>a page</body></html>"


def jobaxle_detail(**overrides) -> dict:
    detail = {
        "jobTitle": "Backend Engineer",
        "jobPurpose": "<p>Own the payments API.</p>",
        "jobDescription": "<p>Write services in <b>Python</b> and Django.</p>",
        "jobSpecification": "<ul><li>PostgreSQL</li><li>Docker preferred</li></ul>",
        "educationRequired": "<p>BE in Computer Engineering</p>",
        "educationlevel": {"title": "Bachelor's"},
        "joblevel": {"title": "Mid Level"},
        "jobtype": {"title": "Full Time"},
        "minExperience": "3",
        "maxExperience": "-2",
        "salaryType": "negotiable",
    }
    detail.update(overrides)
    return detail
