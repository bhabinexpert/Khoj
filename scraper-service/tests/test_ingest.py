"""Tests for the backend ingest client and the ``run_scrapers`` wiring."""

from __future__ import annotations

import json

import responses

import run_scrapers
from core.ingest import ingest_jobs, wait_for_backend

BACKEND = "http://backend.test"
ENDPOINT = f"{BACKEND}/api/jobs/ingest"


def jobs(count: int) -> list[dict]:
    return [{"title": f"Job {i}", "sourceUrl": f"https://example.com/{i}", "dedupeHash": f"h{i}"} for i in range(count)]


@responses.activate
def test_ingest_posts_in_batches_and_sums_the_backend_counters():
    responses.add(responses.POST, ENDPOINT, json={"received": 2, "inserted": 2}, status=201)
    responses.add(responses.POST, ENDPOINT, json={"received": 1, "updated": 1, "merged": 1}, status=201)

    totals = ingest_jobs(jobs(3), backend_url=BACKEND, batch_size=2)

    posts = [call for call in responses.calls if call.request.method == "POST"]
    assert len(posts) == 2
    assert [len(json.loads(call.request.body)["jobs"]) for call in posts] == [2, 1]
    assert totals == {
        "received": 3, "inserted": 2, "updated": 1, "merged": 1, "skipped": 0, "failedBatches": 0,
    }


@responses.activate
def test_ingest_sends_json_and_identifies_itself():
    responses.add(responses.POST, ENDPOINT, json={"received": 1, "inserted": 1}, status=201)

    ingest_jobs(jobs(1), backend_url=BACKEND + "/")   # trailing slash must not double up

    request = responses.calls[0].request
    assert request.url == ENDPOINT
    assert request.headers["Content-Type"] == "application/json"
    assert "KhojScraper" in request.headers["User-Agent"]


@responses.activate
def test_the_ingest_token_is_sent_when_configured():
    responses.add(responses.POST, ENDPOINT, json={"received": 1, "inserted": 1}, status=201)
    ingest_jobs(jobs(1), backend_url=BACKEND, token="s3cret")
    assert responses.calls[0].request.headers["X-Ingest-Token"] == "s3cret"


@responses.activate
def test_no_token_header_is_sent_in_open_dev_mode():
    responses.add(responses.POST, ENDPOINT, json={"received": 1, "inserted": 1}, status=201)
    ingest_jobs(jobs(1), backend_url=BACKEND, token="")
    assert "X-Ingest-Token" not in responses.calls[0].request.headers


@responses.activate
def test_one_bad_batch_does_not_discard_the_good_ones():
    responses.add(responses.POST, ENDPOINT, status=500)
    responses.add(responses.POST, ENDPOINT, json={"received": 1, "inserted": 1}, status=201)

    totals = ingest_jobs(jobs(2), backend_url=BACKEND, batch_size=1, max_retries=1)

    assert totals["failedBatches"] == 1
    assert totals["inserted"] == 1


@responses.activate
def test_a_body_less_response_is_treated_as_zero_counters():
    responses.add(responses.POST, ENDPOINT, body="", status=204)
    totals = ingest_jobs(jobs(1), backend_url=BACKEND)
    assert totals["failedBatches"] == 0
    assert totals["inserted"] == 0


def test_dry_run_never_touches_the_network(capsys):
    with responses.RequestsMock(assert_all_requests_are_fired=False):
        totals = ingest_jobs(jobs(4), backend_url=BACKEND, dry_run=True)

    assert totals["received"] == 4
    assert totals["inserted"] == 0
    # It prints a sample so a human can eyeball the payload before going live.
    assert "Job 0" in capsys.readouterr().out


def test_nothing_to_ingest_is_not_an_error():
    with responses.RequestsMock(assert_all_requests_are_fired=False):
        assert ingest_jobs([], backend_url=BACKEND)["received"] == 0


@responses.activate
def test_wait_for_backend_polls_health():
    responses.add(responses.GET, f"{BACKEND}/health", json={"status": "ok"}, status=200)
    assert wait_for_backend(BACKEND, attempts=1, delay=0) is True


@responses.activate
def test_wait_for_backend_gives_up_and_says_so():
    responses.add(responses.GET, f"{BACKEND}/health", status=503)
    assert wait_for_backend(BACKEND, attempts=2, delay=0) is False


# ------------------------------------------------------------------- entrypoint
def test_build_adapters_resolves_names_and_skips_unknown_ones(fast_session, caplog):
    args = run_scrapers.parse_args(["--sources", "merojob,jobaxle,atlantis"])
    adapters = run_scrapers.build_adapters(args, fast_session)

    assert [a.platform for a in adapters] == ["merojob", "jobaxle"]
    assert "atlantis" in caplog.text


def test_limit_and_pages_flags_reach_every_adapter(fast_session):
    args = run_scrapers.parse_args(["--sources", "merojob,jobaxle", "--limit", "4", "--pages", "1"])
    adapters = run_scrapers.build_adapters(args, fast_session)

    assert all(a.max_jobs == 4 and a.max_pages == 1 for a in adapters)
    assert adapters[1].max_detail_pages == 4


def test_run_once_merges_across_sources_and_reports_success(monkeypatch, tmp_path):
    """The end-to-end wiring: scrape -> merge -> ingest, with no network."""
    from core.normalize import normalize_job

    def fake_fetch(self):
        return [
            normalize_job(
                {
                    "title": "Frontend Developer",
                    "company": "Leapfrog Technology",
                    "description": "Build modern web UIs with React and ship them every week.",
                    "sourceUrl": f"https://{self.platform}.example/jobs/1",
                },
                source_platform=self.platform,
            )
        ]

    monkeypatch.setattr("adapters.merojob.MerojobAdapter.fetch_jobs", fake_fetch)
    monkeypatch.setattr("adapters.jobaxle.JobaxleAdapter.fetch_jobs", fake_fetch)

    out = tmp_path / "payload.json"
    args = run_scrapers.parse_args(
        ["--sources", "merojob,jobaxle", "--dry-run", "--min-delay", "0", "--no-robots", "--out", str(out)]
    )
    assert run_scrapers.run_once(args) == 0

    payload = json.loads(out.read_text(encoding="utf-8"))
    assert len(payload) == 1   # the same vacancy on both boards
    assert [s["platform"] for s in payload[0]["sources"]] == ["merojob", "jobaxle"]


def test_run_once_reports_failure_when_no_source_is_usable(monkeypatch):
    args = run_scrapers.parse_args(["--sources", "atlantis", "--min-delay", "0", "--no-robots"])
    assert run_scrapers.run_once(args) == 2
