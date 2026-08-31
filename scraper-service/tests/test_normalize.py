"""Tests for the shared normalisation layer.

The dedupe-hash assertions are the important ones: ``core/normalize.py`` and
``backend/src/utils/dedupe.js`` must produce byte-identical digests, because the
backend recomputes the hash on ingest and enforces a unique index over it. The
three vectors below are asserted in the backend's Jest suite too — if either
side drifts, one of the two suites fails.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from core.normalize import (
    clean_apply_url,
    clean_block,
    clean_text,
    dedupe_hash,
    detect_education,
    detect_experience_level,
    detect_job_type,
    find_apply_link,
    normalize_job,
    tidy_description,
    _dedupe_list,
    _iso,
)


# ------------------------------------------------------------------- dedupe hash
GOLDEN_HASHES = (
    (
        "Frontend Developer",
        "Leapfrog Technology",
        "Build modern web UIs with React.",
        "383681e33501c8e91dfeadd6d1b1bc69768710a3bf616bc10792b072b45ff4eb",
    ),
    (
        "Sr. Data Analyst",
        "F1Soft International",
        "Analyse transaction data using SQL and Power BI dashboards for the payments team.",
        "8b59f026084d9a341ad5b35dfa1fe94bc0eae6d02e5cf7385b505a3d18e53abc",
    ),
    (
        "इन्टर्न — Marketing",
        "Daraz Nepal",
        "Support the growth team with campaigns.",
        "2926c7baa41297bea50932449365517ce63714cf45ab9e087df306b98fecdc7b",
    ),
)


@pytest.mark.parametrize(("title", "company", "description", "expected"), GOLDEN_HASHES)
def test_dedupe_hash_matches_the_cross_language_golden_vectors(title, company, description, expected):
    assert dedupe_hash(title, company, description) == expected


def test_dedupe_hash_ignores_case_punctuation_and_whitespace():
    a = dedupe_hash("Frontend Developer", "Leapfrog Technology", "Build modern web UIs with React.")
    b = dedupe_hash("  frontend   developer ", "LEAPFROG, Technology!", "build modern web uis with react")
    assert a == b


def test_dedupe_hash_only_reads_the_first_100_description_characters():
    head = "x" * 100
    assert dedupe_hash("T", "C", head + " tail one") == dedupe_hash("T", "C", head + " tail two")
    assert dedupe_hash("T", "C", head) != dedupe_hash("T", "C", "y" * 100)


def test_dedupe_hash_separates_the_fields():
    """Field boundaries must matter, or "ab|c" and "a|bc" would collide."""
    assert dedupe_hash("ab", "c", "d") != dedupe_hash("a", "bc", "d")


# ----------------------------------------------------------------------- cleaning
def test_clean_text_collapses_whitespace_and_tolerates_none():
    assert clean_text("  Frontend\n\tDeveloper  ") == "Frontend Developer"
    assert clean_text(None) == ""
    assert clean_text(42) == "42"


def test_clean_block_keeps_one_blank_line_between_paragraphs():
    text = clean_block("Role\r\n\r\n\r\n  Duties   here \n\nEnd")
    assert text == "Role\n\nDuties here\n\nEnd"


# ------------------------------------------------------------- apply-link mining
def test_find_apply_link_prefers_an_anchor_href():
    html = 'Send it here: <a href="https://careers.example.com/apply/42">Apply</a> today.'
    assert find_apply_link(html) == "https://careers.example.com/apply/42"


def test_find_apply_link_falls_back_to_a_bare_url_stripping_trailing_punctuation():
    assert find_apply_link("Apply at https://example.com/jobs/7.") == "https://example.com/jobs/7"


def test_find_apply_link_turns_a_hiring_email_into_a_mailto():
    assert find_apply_link("Email your CV to hr@example.com") == "mailto:hr@example.com"


def test_find_apply_link_returns_none_when_nothing_submittable_is_present():
    assert find_apply_link("Walk in to our office between 10am and 5pm.") is None
    assert find_apply_link(None, "", "   ") is None


def test_find_apply_link_scans_multiple_fragments_in_order():
    """An anchor in a later fragment still wins over a bare email earlier."""
    assert find_apply_link("write to hr@x.com", '<a href="https://x.com/apply">go</a>') == "https://x.com/apply"


# ------------------------------------------------------------- description tidying
def test_tidy_description_strips_board_chrome_lines():
    raw = "Apply Now\nWe are hiring a backend engineer.\nViews: 1,204\nShare this job\nStrong Python skills required."
    assert tidy_description(raw) == "We are hiring a backend engineer.\nStrong Python skills required."


def test_tidy_description_collapses_blank_runs_left_by_removal():
    raw = "Real duty one.\n\nApply Now\n\nReal duty two."
    assert tidy_description(raw) == "Real duty one.\n\nReal duty two."


def test_tidy_description_leaves_a_clean_posting_untouched():
    body = "Design REST APIs.\n\nMaintain the CI pipeline."
    assert tidy_description(body) == body


# ---------------------------------------------------------------------- detectors
@pytest.mark.parametrize(
    ("sources", "expected"),
    [
        (("Marketing Intern",), "internship"),
        (("Graphic Design Trainee",), "internship"),
        (("Support Engineer", "Fully remote team"), "remote"),
        (("Tutor", "Part-time, evenings only"), "part-time"),
        (("Consultant Auditor",), "contract"),
        (("Accountant", "Permanent position"), "full-time"),
        (("Accountant", "No hints at all"), "full-time"),
    ],
)
def test_detect_job_type(sources, expected):
    assert detect_job_type(*sources) == expected


def test_international_is_not_an_internship():
    """Regression: substring matching used to read "intern" out of it."""
    assert detect_job_type("International Sales Manager", "Grow our export business.") == "full-time"


@pytest.mark.parametrize(
    ("sources", "expected"),
    [
        (("Engineer", "5+ years of experience required"), "senior"),
        (("Engineer", "2 to 4 years experience"), "mid"),
        (("Engineer", "1 year experience"), "entry"),
        (("Senior Backend Engineer",), "senior"),
        (("QA Officer",), "mid"),
        (("Fresher welcome",), "entry"),
        (("Accountant", "Join our team"), "unspecified"),
    ],
)
def test_detect_experience_level(sources, expected):
    assert detect_experience_level(*sources) == expected


def test_stated_years_beat_the_title_keywords():
    """A "Senior" title with "1 year experience" is the years, not the word."""
    assert detect_experience_level("Senior Officer", "1 year experience") == "entry"


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("PhD in Economics", "phd"),
        ("Master's degree in Business Administration", "master"),
        ("MBA preferred", "master"),
        ("Bachelor's degree in Computer Science", "bachelor"),
        ("BE in Civil Engineering", "bachelor"),
        ("BSc.CSIT or BIM graduates", "bachelor"),
        ("+2 completed", "diploma"),
        ("Diploma in Nursing", "diploma"),
        ("SEE passed candidates may apply", "slc"),
        ("Any background is fine", "unspecified"),
    ],
)
def test_detect_education(text, expected):
    assert detect_education(text) == expected


@pytest.mark.parametrize(
    "text",
    [
        "You will be responsible for the team and should be able to travel",
        "Please see the attached job description before you apply",
        "Salaries will be reviewed annually",
        "Mastery of spoken English is expected",
    ],
)
def test_english_prose_is_not_mistaken_for_a_degree(text):
    """Regression: the "be " and "see" substrings labelled nearly every posting."""
    assert detect_education(text) == "unspecified"


def test_the_highest_qualification_mentioned_wins():
    assert detect_education("Master's preferred; Bachelor's minimum; +2 considered") == "master"


# ---------------------------------------------------------------------------- iso
@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("2026-09-30", "2026-09-30T00:00:00+00:00"),
        ("30 Sep 2026", "2026-09-30T00:00:00+00:00"),
        ("September 30, 2026", "2026-09-30T00:00:00+00:00"),
        ("30/09/2026", "2026-09-30T00:00:00+00:00"),
        ("2026-08-25T04:00:00Z", "2026-08-25T04:00:00+00:00"),
        ("whenever", None),
        ("", None),
        (None, None),
    ],
)
def test_iso_parses_the_date_shapes_the_sources_use(value, expected):
    assert _iso(value) == expected


def test_iso_assumes_utc_for_naive_datetimes():
    assert _iso(datetime(2026, 9, 30, 12, 0)) == "2026-09-30T12:00:00+00:00"


def test_dedupe_list_is_case_insensitive_and_capped():
    assert _dedupe_list(["React", "react", " REACT ", "", None, "Node.js"]) == ["React", "Node.js"]
    assert len(_dedupe_list([f"skill-{i}" for i in range(100)])) == 40
    assert _dedupe_list([f"skill-{i}" for i in range(100)], limit=3) == ["skill-0", "skill-1", "skill-2"]


# ------------------------------------------------------------------ normalize_job
RAW = {
    "title": "  Frontend Developer  ",
    "company": "Leapfrog Technology",
    "description": (
        "Required: build modern web UIs with React and Node.js.\n\n\n"
        "Preferred: Docker and Kubernetes are a plus point."
    ),
    "location": "Charkhal, Kathmandu",
    "salary": "NRs 60,000 - 90,000 / Month",
    "deadline": "2026-09-30",
    "postedDate": "2026-08-25T04:00:00Z",
    "sourceUrl": "https://merojob.com/frontend-developer-leapfrog/",
}


def test_normalize_job_produces_the_canonical_ingest_shape():
    job = normalize_job(RAW, source_platform="merojob")

    assert set(job) == {
        "title", "company", "description", "requiredSkills", "preferredSkills",
        "experienceLevel", "educationRequirement", "jobType", "location", "salary",
        "deadline", "postedDate", "sourcePlatform", "sourceUrl", "applyUrl", "dedupeHash",
    }
    assert job["title"] == "Frontend Developer"          # whitespace collapsed
    assert job["sourcePlatform"] == "merojob"
    assert job["applyUrl"] is None                       # this board *is* the apply page
    assert job["deadline"] == "2026-09-30T00:00:00+00:00"
    assert job["postedDate"] == "2026-08-25T04:00:00+00:00"
    assert job["dedupeHash"] == dedupe_hash(job["title"], job["company"], job["description"])


def test_clean_apply_url_keeps_only_submittable_destinations():
    assert clean_apply_url("https://forms.gle/abc") == "https://forms.gle/abc"
    assert clean_apply_url("mailto:hr@example.com") == "mailto:hr@example.com"
    assert clean_apply_url("  https://careers.example.com/1  ") == "https://careers.example.com/1"
    assert clean_apply_url("tel:+9779800000000") is None
    assert clean_apply_url("javascript:alert(1)") is None
    assert clean_apply_url("9801234567") is None
    assert clean_apply_url(None) is None
    # Pointing "apply here" back at the post we scraped tells the reader nothing.
    post = "https://t.me/nepalijobs/1211"
    assert clean_apply_url(post, source_url=post) is None


def test_normalize_job_splits_required_from_preferred_skills():
    job = normalize_job(RAW, source_platform="merojob")
    assert job["requiredSkills"] == ["React", "Node.js"]
    assert job["preferredSkills"] == ["Docker", "Kubernetes"]


def test_normalize_job_never_repeats_a_required_skill_as_preferred():
    raw = dict(RAW, requiredSkills=["React", "Docker"], preferredSkills=["docker", "Kubernetes"])
    job = normalize_job(raw, source_platform="merojob")
    assert job["requiredSkills"] == ["React", "Docker"]
    assert job["preferredSkills"] == ["Kubernetes"]


def test_normalize_job_fills_the_gaps_a_thin_posting_leaves():
    job = normalize_job(
        {"title": "Office Helper", "url": "https://example.com/jobs/1"},
        source_platform="jobaxle",
    )
    assert job["company"] == "Not disclosed"
    assert job["location"] == "Nepal"
    assert job["description"] == "Office Helper"   # falls back to the title
    assert job["salary"] is None
    assert job["deadline"] is None
    assert job["jobType"] == "full-time"
    assert job["experienceLevel"] == "unspecified"
    assert job["educationRequirement"] == "unspecified"
    assert job["sourceUrl"] == "https://example.com/jobs/1"   # "url" is accepted too

    posted = datetime.fromisoformat(job["postedDate"])
    assert datetime.now(timezone.utc) - posted < timedelta(minutes=5)


@pytest.mark.parametrize(
    "raw",
    [
        {"title": "", "sourceUrl": "https://example.com/1"},
        {"title": "Developer"},
        {"title": "Developer", "sourceUrl": "   "},
        {},
    ],
)
def test_normalize_job_returns_none_for_unusable_postings(raw):
    assert normalize_job(raw, source_platform="merojob") is None


def test_normalize_job_trusts_valid_adapter_enums():
    job = normalize_job(
        dict(RAW, jobType="Internship", experienceLevel="Entry", educationRequirement="bachelor"),
        source_platform="merojob",
    )
    assert job["jobType"] == "internship"
    assert job["experienceLevel"] == "entry"
    assert job["educationRequirement"] == "bachelor"


def test_normalize_job_falls_back_to_detection_for_unknown_enums():
    job = normalize_job(
        dict(RAW, jobType="wizardry", experienceLevel="rockstar", experienceRaw="6 years"),
        source_platform="merojob",
    )
    assert job["jobType"] == "full-time"
    assert job["experienceLevel"] == "senior"
