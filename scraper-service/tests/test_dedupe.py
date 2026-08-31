"""Tests for cross-platform duplicate merging."""

from __future__ import annotations

from core.dedupe import merge_duplicates
from core.normalize import normalize_job

#: Deliberately longer than 100 characters: the hash only reads the first 100,
#: which is what lets a padded copy of the same posting still collide.
DESCRIPTION = (
    "Build modern web UIs with React, ship weekly with a small product team in "
    "Kathmandu, and work closely with our designers."
)


def posting(platform: str, **overrides) -> dict:
    raw = {
        "title": "Frontend Developer",
        "company": "Leapfrog Technology",
        "description": DESCRIPTION,
        "sourceUrl": f"https://{platform}.com/jobs/frontend-developer",
    }
    raw.update(overrides)
    job = normalize_job(raw, source_platform=platform)
    assert job is not None
    return job


def test_the_same_vacancy_on_two_boards_becomes_one_job_with_two_sources():
    merged = merge_duplicates([posting("merojob"), posting("jobaxle")])

    assert len(merged) == 1
    assert [s["platform"] for s in merged[0]["sources"]] == ["merojob", "jobaxle"]
    assert merged[0]["sources"][1]["url"] == "https://jobaxle.com/jobs/frontend-developer"


def test_different_vacancies_are_left_alone():
    merged = merge_duplicates(
        [posting("merojob"), posting("merojob", title="Backend Developer", sourceUrl="https://merojob.com/be")]
    )
    assert len(merged) == 2
    assert all(len(job["sources"]) == 1 for job in merged)


def test_the_richest_copy_supplies_the_displayed_fields():
    thin = posting("jobaxle")
    rich = posting(
        "merojob",
        description=DESCRIPTION + " " + "You will own the component library and design system. " * 3,
        salary="NRs 60,000 / Month",
        deadline="2026-09-30",
    )
    # Same hash: only the first 100 description characters are hashed.
    assert thin["dedupeHash"] == rich["dedupeHash"]

    for order in ([thin, rich], [rich, thin]):
        merged = merge_duplicates(order)
        assert len(merged) == 1
        assert merged[0]["description"] == rich["description"]
        assert merged[0]["salary"] == "NRs 60,000 / Month"
        assert merged[0]["deadline"] == "2026-09-30T00:00:00+00:00"
        assert len(merged[0]["sources"]) == 2


def test_skills_are_unioned_so_a_thin_posting_benefits_from_a_detailed_one():
    a = posting("merojob", requiredSkills=["React", "Git"], preferredSkills=["Docker"])
    b = posting("jobaxle", requiredSkills=["react", "Node.js"], preferredSkills=["Kubernetes", "git"])

    merged = merge_duplicates([a, b])[0]
    assert merged["requiredSkills"] == ["React", "Git", "Node.js"]
    # "git" is already required, so it must not also be advertised as preferred.
    assert merged["preferredSkills"] == ["Docker", "Kubernetes"]


def test_a_repeat_of_the_same_url_does_not_duplicate_a_source():
    merged = merge_duplicates([posting("merojob"), posting("merojob")])
    assert len(merged[0]["sources"]) == 1


def test_jobs_without_a_dedupe_hash_are_dropped():
    assert merge_duplicates([{"title": "Mystery job"}]) == []


def test_merging_does_not_mutate_the_input_jobs():
    a, b = posting("merojob"), posting("jobaxle")
    merge_duplicates([a, b])
    assert "sources" not in a
    assert "sources" not in b


def test_empty_input():
    assert merge_duplicates([]) == []
