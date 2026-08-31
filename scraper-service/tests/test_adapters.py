"""Adapter tests, run entirely against recorded payloads.

No test in this file touches the network: ``responses`` intercepts every request
made through :class:`~core.http.PoliteSession`, so the suite is safe to run in
CI and cannot accidentally hammer a real job board.
"""

from __future__ import annotations

import pytest
import responses

from adapters.base import SourceAdapter
from adapters.jobaxle import JobaxleAdapter
from adapters.merojob import MerojobAdapter, html_to_text
from core.http import PoliteSession, RobotsDisallowed
from tests.conftest import (
    jobaxle_detail,
    jobaxle_detail_html,
    jobaxle_posting,
    jobaxle_sitemap,
    merojob_item,
    merojob_page,
)

MEROJOB_API = "https://api.merojob.com/api/v1/jobs/"


# ------------------------------------------------------------------- html_to_text
def test_html_to_text_flattens_fragments_into_readable_lines():
    text = html_to_text("<p>Duties:</p><ul><li>Ship&nbsp;features</li><li>Review&amp;merge</li></ul>")
    assert text == "Duties:\n• Ship features\n• Review&merge"


def test_html_to_text_tolerates_empty_input():
    assert html_to_text(None) == ""
    assert html_to_text("") == ""


# ------------------------------------------------------------------------ merojob
@responses.activate
def test_merojob_maps_a_posting_onto_the_canonical_shape(fast_session):
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([merojob_item()]), status=200)

    jobs = MerojobAdapter(fast_session).fetch_jobs()

    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Frontend Developer"
    assert job["company"] == "Leapfrog Technology"
    assert job["sourcePlatform"] == "merojob"
    assert job["sourceUrl"] == "https://merojob.com/frontend-developer-leapfrog/"
    assert job["jobType"] == "full-time"
    assert job["experienceLevel"] == "mid"
    assert job["educationRequirement"] == "bachelor"
    assert job["location"] == "Charkhal, Dillibazar"
    assert job["salary"] == "NRs 60,000 - 90,000 / Month"
    assert job["deadline"] == "2026-09-30T00:00:00+00:00"
    assert job["postedDate"] == "2026-08-25T04:00:00+00:00"
    assert job["requiredSkills"] == ["React", "JavaScript"]   # the blank entry is dropped
    assert "Build modern web UIs with React" in job["description"]
    assert "• Ship features" in job["description"]
    assert job["dedupeHash"]


@responses.activate
def test_merojob_follows_the_drf_next_link_up_to_max_pages(fast_session):
    page_one = f"{MEROJOB_API}?limit=50&offset=0"
    page_two = f"{MEROJOB_API}?limit=50&offset=50"
    page_three = f"{MEROJOB_API}?limit=50&offset=100"
    responses.add(
        responses.GET, page_one,
        json=merojob_page([merojob_item(slug="a", absolute_url="/a/")], next_url=page_two),
        status=200,
    )
    responses.add(
        responses.GET, page_two,
        json=merojob_page([merojob_item(slug="b", absolute_url="/b/")], next_url=page_three),
        status=200,
    )

    jobs = MerojobAdapter(fast_session, max_pages=2).fetch_jobs()

    assert [job["sourceUrl"] for job in jobs] == ["https://merojob.com/a/", "https://merojob.com/b/"]
    assert len(responses.calls) == 2   # page three is never requested


@responses.activate
def test_merojob_stops_when_a_page_comes_back_empty(fast_session):
    responses.add(
        responses.GET, MEROJOB_API,
        json=merojob_page([], next_url=f"{MEROJOB_API}?limit=50&offset=50"),
        status=200,
    )
    assert MerojobAdapter(fast_session).fetch_jobs() == []
    assert len(responses.calls) == 1


@responses.activate
def test_merojob_respects_the_publishers_privacy_flags(fast_session):
    item = merojob_item(hide_org_name=True, hide_salary=True)
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)

    job = MerojobAdapter(fast_session).fetch_jobs()[0]
    assert job["company"] == "Confidential"
    assert job["salary"] is None


@pytest.mark.parametrize(
    ("available_for", "expected"),
    [
        (["Full Time"], "full-time"),
        (["Part Time"], "part-time"),
        (["Internship"], "internship"),
        (["Traineeship"], "internship"),
        (["Freelance"], "contract"),
        (["Remote"], "remote"),
        ([], "full-time"),          # nothing stated -> normalise's default
        (["Something Else"], "full-time"),
    ],
)
@responses.activate
def test_merojob_job_type_mapping(fast_session, available_for, expected):
    item = merojob_item(available_for=available_for, title="Support Associate", description="<p>Help users.</p>")
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["jobType"] == expected


@pytest.mark.parametrize(
    ("job_level", "expected"),
    [("Entry Level", "entry"), ("Mid Level", "mid"), ("Senior Level", "senior"),
     ("Top Management", "senior"), ("Fresher", "entry")],
)
@responses.activate
def test_merojob_level_mapping(fast_session, job_level, expected):
    item = merojob_item(job_level=job_level, experience_required="")
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["experienceLevel"] == expected


@pytest.mark.parametrize(
    ("education_level", "expected"),
    [("Under Graduate (Bachelor)", "bachelor"), ("Graduate (Masters)", "master"),
     ("Intermediate (+2)", "diploma"), ("Diploma", "diploma"), ("PhD", "phd"), ("SEE", "slc")],
)
@responses.activate
def test_merojob_education_mapping(fast_session, education_level, expected):
    item = merojob_item(education_level=education_level, education_description="", description="<p>Help users.</p>")
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["educationRequirement"] == expected


@responses.activate
def test_merojob_skips_unpublished_and_unusable_rows_without_aborting_the_run(fast_session):
    results = [
        merojob_item(status="draft", slug="draft", absolute_url="/draft/"),
        merojob_item(title="", slug="", absolute_url=""),          # no title, no url
        {"status": "published"},                                    # nothing usable at all
        merojob_item(slug="good", absolute_url="/good/", title="Good Job"),
    ]
    responses.add(responses.GET, MEROJOB_API, json=merojob_page(results), status=200)

    jobs = MerojobAdapter(fast_session).fetch_jobs()
    assert [job["title"] for job in jobs] == ["Good Job"]


@responses.activate
def test_merojob_deduplicates_repeated_source_urls(fast_session):
    item = merojob_item()
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item, dict(item)]), status=200)
    assert len(MerojobAdapter(fast_session).fetch_jobs()) == 1


@responses.activate
def test_merojob_honours_max_jobs(fast_session):
    results = [merojob_item(slug=f"job-{i}", absolute_url=f"/job-{i}/") for i in range(5)]
    responses.add(responses.GET, MEROJOB_API, json=merojob_page(results), status=200)

    adapter = MerojobAdapter(fast_session)
    adapter.max_jobs = 3
    assert len(adapter.fetch_jobs()) == 3


@responses.activate
def test_a_dead_api_yields_no_jobs_instead_of_an_exception(fast_session):
    responses.add(responses.GET, MEROJOB_API, status=404)
    assert MerojobAdapter(fast_session).fetch_jobs() == []


@responses.activate
def test_merojob_carries_an_explicit_external_apply_url(fast_session):
    item = merojob_item(apply_url="https://careers.leapfrog.io/jobs/42")
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["applyUrl"] == "https://careers.leapfrog.io/jobs/42"


@responses.activate
def test_merojob_mines_the_apply_url_from_the_how_to_apply_blurb(fast_session):
    item = merojob_item(how_to_apply="<p>Email your CV to <a href='mailto:hr@leapfrog.io'>hr@leapfrog.io</a></p>")
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([item]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["applyUrl"] == "mailto:hr@leapfrog.io"


@responses.activate
def test_merojob_apply_url_is_null_when_the_board_is_the_only_destination(fast_session):
    responses.add(responses.GET, MEROJOB_API, json=merojob_page([merojob_item()]), status=200)
    assert MerojobAdapter(fast_session).fetch_jobs()[0]["applyUrl"] is None


# ------------------------------------------------------------------------ jobaxle
JOB_URL = "https://jobaxle.com/jobs/backend-engineer-f1soft"


@responses.activate
def test_jobaxle_reads_the_sitemap_then_enriches_from_the_rsc_payload(fast_session):
    responses.add(
        responses.GET, JobaxleAdapter.sitemap_url,
        body=jobaxle_sitemap([(JOB_URL, "2026-08-20")]), status=200,
        content_type="application/xml",
    )
    responses.add(
        responses.GET, JOB_URL,
        body=jobaxle_detail_html(jobaxle_posting(), jobaxle_detail()), status=200,
        content_type="text/html",
    )

    jobs = JobaxleAdapter(fast_session).fetch_jobs()

    assert len(jobs) == 1
    job = jobs[0]
    assert job["title"] == "Backend Engineer"
    assert job["company"] == "F1Soft International"
    assert job["sourcePlatform"] == "jobaxle"
    assert job["sourceUrl"] == JOB_URL
    assert job["location"] == "Lalitpur"
    assert job["salary"] == "NPR 80000 / MONTH"
    assert job["deadline"] == "2026-09-15T00:00:00+00:00"
    assert job["jobType"] == "full-time"
    assert job["experienceLevel"] == "mid"
    assert job["educationRequirement"] == "bachelor"
    # RSC enrichment supplies the real body, not the JSON-LD stub.
    assert "Own the payments API." in job["description"]
    assert "Write services in Python and Django." in job["description"]
    assert "Python" in job["requiredSkills"]
    assert "PostgreSQL" in job["requiredSkills"]


@responses.activate
def test_jobaxle_degrades_to_json_ld_when_the_rsc_shape_changes(fast_session):
    """The brittle part is optional by design — a valid posting still comes out."""
    responses.add(
        responses.GET, JobaxleAdapter.sitemap_url,
        body=jobaxle_sitemap([(JOB_URL, "2026-08-20")]), status=200,
    )
    responses.add(
        responses.GET, JOB_URL,
        body=jobaxle_detail_html(jobaxle_posting()), status=200,   # no RSC script at all
    )

    job = JobaxleAdapter(fast_session).fetch_jobs()[0]
    assert job["title"] == "Backend Engineer"
    assert job["description"] == "Fallback description from JSON-LD."
    assert job["salary"] == "NPR 80000 / MONTH"


@responses.activate
def test_jobaxle_skips_pages_without_a_jobposting_block(fast_session):
    other = "https://jobaxle.com/jobs/not-a-posting"
    responses.add(
        responses.GET, JobaxleAdapter.sitemap_url,
        body=jobaxle_sitemap([(JOB_URL, "2026-08-20"), (other, "2026-08-19")]), status=200,
    )
    responses.add(responses.GET, JOB_URL, body=jobaxle_detail_html(jobaxle_posting()), status=200)
    responses.add(responses.GET, other, body="<html><body>marketing page</body></html>", status=200)

    jobs = JobaxleAdapter(fast_session).fetch_jobs()
    assert [job["sourceUrl"] for job in jobs] == [JOB_URL]


def test_jobaxle_sitemap_filtering_and_ordering(fast_session):
    adapter = JobaxleAdapter(fast_session)
    with responses.RequestsMock() as mock:
        mock.add(
            responses.GET, adapter.sitemap_url,
            body=jobaxle_sitemap(
                [
                    ("https://jobaxle.com/jobs/older", "2026-08-01"),
                    ("https://jobaxle.com/companies/acme", "2026-08-30"),   # not a job
                    ("https://jobaxle.com/jobs/newest", "2026-08-29"),
                    ("https://jobaxle.com/jobs/nested/page", "2026-08-28"), # too deep
                    ("https://jobaxle.com/jobs/undated", ""),
                ]
            ),
            status=200,
        )
        urls = adapter._job_urls()

    assert urls == [
        "https://jobaxle.com/jobs/newest",
        "https://jobaxle.com/jobs/older",
        "https://jobaxle.com/jobs/undated",
    ]


def test_jobaxle_experience_note_renders_a_span_only_when_bounded():
    note = JobaxleAdapter._experience_note
    assert note({"minExperience": "3", "maxExperience": "-2"}, "Mid Level") == "3+ years Mid Level"
    assert note({"minExperience": "3", "maxExperience": "5"}, "") == "3-5 years"
    assert note({"minExperience": "0"}, "Entry Level") == "Entry Level"
    assert note({}, "") == ""


@responses.activate
def test_jobaxle_extracts_an_apply_url_from_the_how_to_apply_html(fast_session):
    responses.add(
        responses.GET, JobaxleAdapter.sitemap_url,
        body=jobaxle_sitemap([(JOB_URL, "2026-08-20")]), status=200,
    )
    detail = jobaxle_detail(howToApply='<p>Apply at <a href="https://f1soft.com/careers/12">our portal</a>.</p>')
    responses.add(responses.GET, JOB_URL, body=jobaxle_detail_html(jobaxle_posting(), detail), status=200)

    assert JobaxleAdapter(fast_session).fetch_jobs()[0]["applyUrl"] == "https://f1soft.com/careers/12"


# ------------------------------------------------------------------ base contract
class _BrokenAdapter(SourceAdapter):
    platform = "broken"
    base_url = "https://example.com"

    def fetch_raw_jobs(self):
        yield {"title": "Fine job", "sourceUrl": "https://example.com/1"}
        raise ValueError("selector changed")


class _RefusedAdapter(SourceAdapter):
    platform = "refused"
    base_url = "https://example.com"

    def fetch_raw_jobs(self):
        yield {"title": "Fine job", "sourceUrl": "https://example.com/1"}
        raise RobotsDisallowed("robots.txt disallows https://example.com/2")


def test_a_mid_iteration_crash_keeps_the_jobs_already_collected(fast_session):
    assert len(_BrokenAdapter(fast_session).fetch_jobs()) == 1


def test_a_robots_refusal_stops_the_run_cleanly(fast_session):
    assert len(_RefusedAdapter(fast_session).fetch_jobs()) == 1


def test_absolute_resolves_relative_hrefs(fast_session):
    adapter = MerojobAdapter(fast_session)
    assert adapter.absolute("/jobs/1/") == "https://merojob.com/jobs/1/"
    assert adapter.absolute("https://other.example/x") == "https://other.example/x"
    assert adapter.absolute(None) == ""


# ---------------------------------------------------------------- robots handling
@responses.activate
def test_robots_disallow_blocks_the_fetch():
    session = PoliteSession(min_delay=0.0, jitter=0.0, max_retries=1)
    responses.add(
        responses.GET, "https://example.com/robots.txt",
        body="User-agent: *\nDisallow: /jobs\n", status=200,
    )

    assert session.can_fetch("https://example.com/public") is True
    assert session.can_fetch("https://example.com/jobs/1") is False
    with pytest.raises(RobotsDisallowed):
        session.get("https://example.com/jobs/1")


@responses.activate
def test_a_missing_robots_txt_means_allow_all():
    session = PoliteSession(min_delay=0.0, jitter=0.0, max_retries=1)
    responses.add(responses.GET, "https://example.com/robots.txt", status=404)
    assert session.can_fetch("https://example.com/anything") is True


@responses.activate
def test_an_unreachable_robots_txt_fails_closed():
    """If the rules cannot be read, the host is treated as disallowed."""
    session = PoliteSession(min_delay=0.0, jitter=0.0, max_retries=1)
    # Nothing registered for robots.txt -> responses raises ConnectionError.
    assert session.can_fetch("https://example.com/jobs/1") is False


@responses.activate
def test_crawl_delay_is_honoured_when_declared():
    session = PoliteSession(min_delay=1.0, jitter=0.0, max_retries=1)
    responses.add(
        responses.GET, "https://example.com/robots.txt",
        body="User-agent: *\nCrawl-delay: 9\n", status=200,
    )
    assert session.crawl_delay("https://example.com/jobs") == 9.0
