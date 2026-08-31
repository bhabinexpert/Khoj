"""Tests for the JSON-API job sources (Himalayas, Arbeitnow).

Fully offline: ``responses`` returns recorded JSON payloads, so the suite proves
the field mapping without touching a live API.
"""

from __future__ import annotations

import json

import responses

from adapters.api import ArbeitnowAdapter, HimalayasAdapter, _money, _unix_to_iso


# ------------------------------------------------------------------- pure units
def test_unix_to_iso_handles_seconds_and_junk():
    assert _unix_to_iso(1788155820).startswith("2026-")
    assert _unix_to_iso(0) is None
    assert _unix_to_iso("not-a-number") is None
    assert _unix_to_iso(None) is None


def test_money_formats_band_single_and_empty():
    assert _money(150000, 150000, "USD", "annual") == "USD 150,000 / annual"
    assert _money(120000, 160000, "usd", "annual") == "USD 120,000 - 160,000 / annual"
    assert _money(None, None, "USD", "annual") == ""
    assert _money(50000, None, "EUR", "") == "EUR 50,000"


# -------------------------------------------------------------- Himalayas feed
def _himalayas_payload():
    return {
        "jobs": [
            {
                "title": "Organizing Culture and Capacity Director",
                "companyName": "Sierra Club",
                "employmentType": "Full Time",
                "seniority": ["Director"],
                "locationRestrictions": ["United States"],
                "minSalary": 150000,
                "maxSalary": 150000,
                "currency": "USD",
                "salaryPeriod": "annual",
                "description": "<p>Lead organizing teams.</p><ul><li>Coach staff</li></ul>",
                "pubDate": 1788155820,
                "expiryDate": 1793339819,
                "applicationLink": "https://himalayas.app/companies/sierra-club/jobs/director",
                "guid": "https://himalayas.app/companies/sierra-club/jobs/director",
            }
        ]
    }


@responses.activate
def test_himalayas_maps_the_feed(fast_session):
    responses.add(
        responses.GET, HimalayasAdapter.api_url,
        body=json.dumps(_himalayas_payload()), status=200, content_type="application/json",
    )
    jobs = HimalayasAdapter(fast_session).fetch_jobs()

    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Organizing Culture and Capacity Director"
    assert job["company"] == "Sierra Club"
    assert job["sourcePlatform"] == "himalayas"
    assert job["jobType"] == "full-time"
    assert job["experienceLevel"] == "senior"          # "Director" -> senior
    assert job["location"] == "Remote (United States)"
    assert job["salary"] == "USD 150,000 / annual"
    assert job["deadline"].startswith("2026-")
    assert "Coach staff" in job["description"]
    # guid == applicationLink, so no separate apply link is kept.
    assert job["applyUrl"] is None
    assert job["sourceUrl"] == "https://himalayas.app/companies/sierra-club/jobs/director"


@responses.activate
def test_himalayas_skips_records_without_a_url(fast_session):
    payload = {"jobs": [{"title": "No URL", "companyName": "X", "guid": ""}]}
    responses.add(responses.GET, HimalayasAdapter.api_url, body=json.dumps(payload), status=200)
    assert HimalayasAdapter(fast_session).fetch_jobs() == []


# --------------------------------------------------------------- Arbeitnow feed
@responses.activate
def test_arbeitnow_keeps_only_remote_roles(fast_session):
    payload = {
        "data": [
            {
                "title": "Remote Backend Engineer",
                "company_name": "Mirakl",
                "description": "<p>Build APIs.</p>",
                "remote": True,
                "url": "https://www.arbeitnow.com/jobs/companies/mirakl/remote-backend-123",
                "location": "Munich",
                "created_at": 1788144930,
            },
            {
                "title": "On-site Sales Rep",
                "company_name": "Acme",
                "description": "<p>Sell things.</p>",
                "remote": False,
                "url": "https://www.arbeitnow.com/jobs/companies/acme/onsite-456",
                "location": "Berlin",
                "created_at": 1788144930,
            },
        ]
    }
    responses.add(
        responses.GET, ArbeitnowAdapter.api_url,
        body=json.dumps(payload), status=200, content_type="application/json",
    )
    jobs = ArbeitnowAdapter(fast_session).fetch_jobs()

    assert [job["title"] for job in jobs] == ["Remote Backend Engineer"]
    job = jobs[0]
    assert job["jobType"] == "remote"
    assert job["location"] == "Remote — Munich"
    assert job["sourcePlatform"] == "arbeitnow"


def test_registry_exposes_the_api_sources():
    from adapters import ADAPTERS

    assert "himalayas" in ADAPTERS
    assert "arbeitnow" in ADAPTERS
