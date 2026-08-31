"""Tests for the generic schema.org JobPosting sitemap adapters.

Fully offline: ``responses`` intercepts the sitemap and every detail-page fetch,
so the suite proves the mapping and sitemap traversal against recorded payloads
without ever touching a real job board.
"""

from __future__ import annotations

import re

import responses

from adapters.jsonld import (
    FroxjobAdapter,
    JobsNepalAdapter,
    JsonLdSitemapAdapter,
    KumariJobAdapter,
    MerorojgariAdapter,
    NepaliJobAdapter,
    RojgariAdapter,
)
from core.jsonld import find_job_posting, jobposting_to_raw
from tests.conftest import (
    jobaxle_sitemap,
    jobposting_ldjson,
    jobposting_page,
    sitemap_index,
)


# --------------------------------------------------------------- pure JSON-LD unit
def test_find_job_posting_picks_the_jobposting_out_of_the_graph():
    posting = find_job_posting(jobposting_page(graph=True, noise=True))
    assert posting is not None
    assert posting["title"] == "Digital Marketing Manager"


def test_find_job_posting_returns_none_without_a_block():
    assert find_job_posting("<html><body>no structured data</body></html>") is None
    assert find_job_posting("<script type='application/ld+json'>{bad json</script>") is None


def test_jobposting_to_raw_maps_every_schema_field():
    raw = jobposting_to_raw(jobposting_ldjson(), source_url="https://x.test/job/1")
    assert raw["title"] == "Digital Marketing Manager"
    assert raw["company"] == "Ayurpura Ayurveda Pvt. Ltd."
    assert raw["jobType"] == "full-time"
    assert raw["location"] == "Kathmandu"
    assert raw["salary"] == "NPR 25000 - 30000 / MONTH"
    assert raw["deadline"] == "2026-09-13"
    assert raw["educationRaw"] == "Bachelor's"
    assert raw["experienceRaw"] == "3+ years"
    assert raw["requiredSkills"] == ["SEO", "Google Ads", "Content Marketing"]
    assert "Lead campaigns with SEO" in raw["description"]


def test_jobposting_to_raw_needs_a_title():
    assert jobposting_to_raw({"@type": "JobPosting"}, source_url="https://x.test/1") is None


def test_employment_type_and_salary_variants():
    intern = jobposting_to_raw(
        jobposting_ldjson(employmentType=["INTERN"], baseSalary={}),
        source_url="https://x.test/2",
    )
    assert intern["jobType"] == "internship"
    assert intern["salary"] == ""

    flat = jobposting_to_raw(
        jobposting_ldjson(baseSalary={"currency": "NPR", "value": {"value": "50000", "unitText": "MONTH"}}),
        source_url="https://x.test/3",
    )
    assert flat["salary"] == "NPR 50000 / MONTH"


# ------------------------------------------------------------- end-to-end via sitemap
KUMARI_JOB = "https://www.kumarijob.com/classictech-pvt-ltd/76239-corporate-sales-manager-1"


@responses.activate
def test_kumarijob_follows_the_index_then_reads_jobposting(fast_session):
    responses.add(
        responses.GET, KumariJobAdapter.sitemap_url,
        body=sitemap_index([("https://www.kumarijob.com/sitemap-jobs.xml", "2026-08-31")]),
        status=200, content_type="application/xml",
    )
    responses.add(
        responses.GET, "https://www.kumarijob.com/sitemap-jobs.xml",
        body=jobaxle_sitemap([(KUMARI_JOB, "2026-08-30")]), status=200, content_type="application/xml",
    )
    responses.add(responses.GET, KUMARI_JOB, body=jobposting_page(), status=200, content_type="text/html")

    jobs = KumariJobAdapter(fast_session).fetch_jobs()

    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Digital Marketing Manager"
    assert job["company"] == "Ayurpura Ayurveda Pvt. Ltd."
    assert job["sourcePlatform"] == "kumarijob"
    assert job["sourceUrl"] == KUMARI_JOB
    assert job["jobType"] == "full-time"
    assert job["educationRequirement"] == "bachelor"
    assert job["salary"] == "NPR 25000 - 30000 / MONTH"


@responses.activate
def test_index_child_selection_ignores_non_job_sitemaps(fast_session):
    """Only the jobs child sitemap is opened, not blogs/employers/etc."""
    responses.add(
        responses.GET, KumariJobAdapter.sitemap_url,
        body=sitemap_index(
            [
                ("https://www.kumarijob.com/sitemap-blogs.xml", "2026-08-31"),
                ("https://www.kumarijob.com/sitemap-jobs.xml", "2026-08-31"),
                ("https://www.kumarijob.com/sitemap-employers.xml", "2026-08-31"),
            ]
        ),
        status=200,
    )
    responses.add(
        responses.GET, "https://www.kumarijob.com/sitemap-jobs.xml",
        body=jobaxle_sitemap([(KUMARI_JOB, "2026-08-30")]), status=200,
    )
    responses.add(responses.GET, KUMARI_JOB, body=jobposting_page(), status=200)

    jobs = KumariJobAdapter(fast_session).fetch_jobs()
    requested = [call.request.url for call in responses.calls]
    assert "https://www.kumarijob.com/sitemap-blogs.xml" not in requested
    assert "https://www.kumarijob.com/sitemap-employers.xml" not in requested
    assert len(jobs) == 1


@responses.activate
def test_job_url_pattern_filters_out_non_posting_locs(fast_session):
    """A category page in the jobs sitemap must not be treated as a posting."""
    category = "https://www.kumarijob.com/job-listing/it-jobs-in-nepal"
    responses.add(
        responses.GET, KumariJobAdapter.sitemap_url,
        body=sitemap_index([("https://www.kumarijob.com/sitemap-jobs.xml", "2026-08-31")]), status=200,
    )
    responses.add(
        responses.GET, "https://www.kumarijob.com/sitemap-jobs.xml",
        body=jobaxle_sitemap([(KUMARI_JOB, "2026-08-30"), (category, "2026-08-30")]), status=200,
    )
    responses.add(responses.GET, KUMARI_JOB, body=jobposting_page(), status=200)

    jobs = KumariJobAdapter(fast_session).fetch_jobs()
    assert [job["sourceUrl"] for job in jobs] == [KUMARI_JOB]


@responses.activate
def test_a_page_without_jobposting_is_skipped_not_fatal(fast_session):
    good = "https://rojgari.com/job/graphic-designer-108/detail"
    bad = "https://rojgari.com/job/no-structured-data/detail"
    responses.add(
        responses.GET, RojgariAdapter.sitemap_url,
        body=sitemap_index([("https://rojgari.com/sitemap-jobs.xml", "2026-08-30")]), status=200,
    )
    responses.add(
        responses.GET, "https://rojgari.com/sitemap-jobs.xml",
        body=jobaxle_sitemap([(good, "2026-08-30"), (bad, "2026-08-29")]), status=200,
    )
    responses.add(responses.GET, good, body=jobposting_page(), status=200)
    responses.add(responses.GET, bad, body="<html><body>marketing</body></html>", status=200)

    jobs = RojgariAdapter(fast_session).fetch_jobs()
    assert [job["sourceUrl"] for job in jobs] == [good]


@responses.activate
def test_flat_sitemap_without_an_index_is_supported(fast_session):
    """JobsNepal's jobs sitemap is reached via index, but a flat one also works."""

    class _Flat(JsonLdSitemapAdapter):
        platform = "flat"
        base_url = "https://flat.test"
        sitemap_url = "https://flat.test/sitemap.xml"
        job_url_pattern = re.compile(r"^https://flat\.test/job/\d+$")

    url = "https://flat.test/job/7"
    responses.add(responses.GET, _Flat.sitemap_url, body=jobaxle_sitemap([(url, "2026-08-30")]), status=200)
    responses.add(responses.GET, url, body=jobposting_page(), status=200)

    jobs = _Flat(fast_session).fetch_jobs()
    assert len(jobs) == 1


@responses.activate
def test_detail_pages_are_capped(fast_session):
    urls = [f"https://froxjob.com/sales-officer-{i}" for i in range(6)]
    responses.add(
        responses.GET, FroxjobAdapter.sitemap_url,
        body=sitemap_index([("https://froxjob.com/sitemap/jobs.xml", "2026-08-31")]), status=200,
    )
    responses.add(
        responses.GET, "https://froxjob.com/sitemap/jobs.xml",
        body=jobaxle_sitemap([(u, "2026-08-31") for u in urls]), status=200,
    )
    for u in urls:
        responses.add(responses.GET, u, body=jobposting_page(), status=200)

    adapter = FroxjobAdapter(fast_session)
    adapter.max_detail_pages = 2
    assert len(adapter.fetch_jobs()) == 2


@responses.activate
def test_newest_job_child_sitemaps_are_opened_first(fast_session):
    """WordPress indexes bury new jobs in high-numbered sitemaps; the adapter
    must open the most-recently-updated child, not sitemap1."""
    old_child = "https://merorojgari.com/job_listing-sitemap1.xml"
    new_child = "https://merorojgari.com/job_listing-sitemap9.xml"
    new_job = "https://merorojgari.com/job/brand-officer/"
    responses.add(
        responses.GET, MerorojgariAdapter.sitemap_url,
        body=sitemap_index([(old_child, "2026-01-01"), (new_child, "2026-08-31")]), status=200,
    )
    responses.add(responses.GET, new_child, body=jobaxle_sitemap([(new_job, "2026-08-31")]), status=200)
    responses.add(responses.GET, new_job, body=jobposting_page(), status=200)

    adapter = MerorojgariAdapter(fast_session)
    adapter.max_sitemaps = 1
    jobs = adapter.fetch_jobs()

    requested = [call.request.url for call in responses.calls]
    assert new_child in requested
    assert old_child not in requested  # older child never opened under the cap
    assert [job["sourceUrl"] for job in jobs] == [new_job]


def test_registry_exposes_every_new_source():
    from adapters import ADAPTERS

    for name in ("kumarijob", "froxjob", "merorojgari", "jobsnepal", "rojgari", "nepalijob"):
        assert name in ADAPTERS


def test_url_patterns_match_real_examples():
    assert KumariJobAdapter.job_url_pattern.match(KUMARI_JOB)
    assert FroxjobAdapter.job_url_pattern.match("https://froxjob.com/delivery-rider-16")
    assert MerorojgariAdapter.job_url_pattern.match("https://merorojgari.com/job/brand-officer/")
    assert JobsNepalAdapter.job_url_pattern.match("https://www.jobsnepal.com/field-officer-143912")
    assert RojgariAdapter.job_url_pattern.match("https://rojgari.com/job/head-chef-79/detail")
    assert NepaliJobAdapter.job_url_pattern.match("https://nepalijob.com/job/48122/content-creator-in-kathmandu")
    # Non-postings must not match.
    assert not KumariJobAdapter.job_url_pattern.match("https://www.kumarijob.com/job-listing/it-jobs-in-nepal")
    assert not RojgariAdapter.job_url_pattern.match("https://rojgari.com/sitemap-jobs.xml")
    assert not NepaliJobAdapter.job_url_pattern.match("https://nepalijob.com/sitemap-jobs.xml?page=1")


@responses.activate
def test_nepalijob_index_child_uses_query_string(fast_session):
    """NepaliJob's job child sitemaps carry a ?page=N query string; the child
    pattern must still select them (it is search-based, not end-anchored)."""
    child = "https://nepalijob.com/sitemap-jobs.xml?page=1"
    job = "https://nepalijob.com/job/48122/content-creator-in-kathmandu"
    responses.add(
        responses.GET, NepaliJobAdapter.sitemap_url,
        body=sitemap_index(
            [
                ("https://nepalijob.com/sitemap-static.xml", "2026-08-31"),
                (child, "2026-08-31"),
            ]
        ),
        status=200,
    )
    responses.add(responses.GET, child, body=jobaxle_sitemap([(job, "2026-08-31")]), status=200)
    responses.add(responses.GET, job, body=jobposting_page(), status=200)

    jobs = NepaliJobAdapter(fast_session).fetch_jobs()
    requested = [call.request.url for call in responses.calls]
    assert "https://nepalijob.com/sitemap-static.xml" not in requested
    assert [j["sourceUrl"] for j in jobs] == [job]
