"""Tests for skill matching, the weighted score, and the match endpoints."""

from __future__ import annotations

import os

import pytest

from app.config import settings
from app.matching.embedder import LexicalMatcher, get_matcher
from app.matching.scorer import score_match
from app.schemas import JobRequirements, ParsedCv

CV = ParsedCv(
    skills=["ReactJS", "Node.js", "MongoDB", "Tailwind CSS", "Git"],
    totalExperienceMonths=36,
    highestEducation="bachelor",
)


def job(**overrides) -> JobRequirements:
    payload = {
        "id": "job-1",
        "title": "Frontend Developer",
        "requiredSkills": ["React", "Node.js"],
        "preferredSkills": ["Docker"],
        "experienceLevel": "mid",
        "educationRequirement": "bachelor",
    }
    payload.update(overrides)
    return JobRequirements(**payload)


# -------------------------------------------------------------------- matcher
def test_the_test_suite_runs_on_the_lexical_engine():
    assert settings.embeddings_enabled is False
    assert isinstance(get_matcher(), LexicalMatcher)


def test_reactjs_matches_react_without_the_model():
    """The spec's headline example, on the fallback path."""
    hits = LexicalMatcher().match_all(["React"], ["ReactJS"])
    assert hits[0] is not None
    assert hits[0].matched_with == "ReactJS"
    assert hits[0].via == "alias"
    assert hits[0].similarity == 1.0


def test_exact_matches_are_labelled_exact():
    hits = LexicalMatcher().match_all(["MongoDB"], ["mongodb"])
    assert hits[0].via == "exact"


def test_unknown_skills_still_match_by_similarity():
    hits = LexicalMatcher().match_all(["Kubernetes Administration"], ["Kubernetes"])
    assert hits[0] is not None
    assert hits[0].via == "fuzzy"
    assert hits[0].similarity >= settings.similarity_threshold


def test_unrelated_skills_do_not_match():
    hits = LexicalMatcher().match_all(["Welding"], ["ReactJS", "MongoDB", "Nursing"])
    assert hits[0] is None


def test_matching_is_stable_with_no_cv_skills():
    assert LexicalMatcher().match_all(["React"], []) == [None]
    assert LexicalMatcher().match_all([], ["React"]) == []


# ---------------------------------------------------------------------- score
def test_weighted_formula_matches_the_spec():
    result = score_match(CV, job())
    breakdown = result.breakdown

    assert breakdown.requiredSkillsMatchPercent == 100.0
    assert breakdown.preferredSkillsMatchPercent == 0.0   # no Docker on the CV
    assert breakdown.experienceFitPercent == 100.0        # 36 mo in the mid band
    assert breakdown.educationFitPercent == 100.0
    assert breakdown.weights == {
        "requiredSkills": 0.5, "preferredSkills": 0.2,
        "experience": 0.2, "education": 0.1,
    }
    # 0.5*100 + 0.2*0 + 0.2*100 + 0.1*100
    assert result.overallScore == 80.0
    assert sum(breakdown.contributions.values()) == pytest.approx(result.overallScore, abs=0.05)


def test_missing_skills_are_listed_for_the_ui():
    result = score_match(CV, job(requiredSkills=["React", "Django", "Kubernetes"]))
    assert [m.required for m in result.matchedSkills] == ["React"]
    assert result.missingSkills == ["Django", "Kubernetes"]
    assert result.breakdown.requiredSkillsMatchPercent == pytest.approx(33.3, abs=0.1)
    assert result.missingPreferredSkills == ["Docker"]


def test_unassessable_components_do_not_cost_points():
    """A job that lists no preferred skills must not lose their 20%."""
    result = score_match(CV, job(preferredSkills=[]))
    assert result.breakdown.weights["preferredSkills"] == 0.0
    assert result.breakdown.contributions["preferredSkills"] == 0.0
    assert result.overallScore == 100.0


def test_score_is_skills_only_when_the_job_states_nothing_else():
    result = score_match(
        CV,
        job(preferredSkills=[], experienceLevel="unspecified", educationRequirement="unspecified"),
    )
    assert result.breakdown.weights["requiredSkills"] == 1.0
    assert result.overallScore == 100.0
    assert "does not state an experience level" in result.experienceFitNote
    assert "does not state an education requirement" in result.educationFitNote


def test_a_job_with_no_requirements_at_all_scores_zero_but_explains_itself():
    result = score_match(
        CV,
        job(
            requiredSkills=[], preferredSkills=[],
            experienceLevel="unspecified", educationRequirement="unspecified",
        ),
    )
    assert result.overallScore == 0.0
    assert all(weight == 0.0 for weight in result.breakdown.weights.values())


def test_experience_shortfall_gets_partial_credit_and_a_note():
    junior = CV.model_copy(update={"totalExperienceMonths": 12})
    result = score_match(junior, job(experienceLevel="senior"))
    assert 0 < result.breakdown.experienceFitPercent < 100
    assert "senior-level role" in result.experienceFitNote
    assert "1 yr" in result.experienceFitNote


def test_over_qualification_is_never_penalised():
    veteran = CV.model_copy(update={"totalExperienceMonths": 120, "highestEducation": "master"})
    result = score_match(veteran, job(experienceLevel="entry", educationRequirement="bachelor"))
    assert result.breakdown.experienceFitPercent == 100.0
    assert result.breakdown.educationFitPercent == 100.0
    assert "above" in result.experienceFitNote or "above" in result.educationFitNote


def test_education_below_the_requirement_scores_partially():
    school_leaver = CV.model_copy(update={"highestEducation": "diploma"})
    result = score_match(school_leaver, job(educationRequirement="master"))
    assert result.breakdown.educationFitPercent == 40.0  # two rungs short
    assert "below" in result.educationFitNote


def test_experience_falls_back_to_summing_entries():
    cv = ParsedCv(
        skills=["React"],
        experience=[{"role": "Dev", "duration": "2020 - 2022", "months": 24}],
        totalExperienceMonths=0,
    )
    result = score_match(cv, job(experienceLevel="mid"))
    assert result.breakdown.experienceFitPercent == 100.0


# ------------------------------------------------------------------ endpoints
def test_match_score_endpoint(client):
    response = client.post(
        "/match-score",
        json={"cv": CV.model_dump(), "job": job().model_dump()},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["jobId"] == "job-1"
    assert body["overallScore"] == 80.0
    assert body["engine"] == "lexical"
    assert body["matchedSkills"][0]["via"] in ("exact", "alias")


def test_match_score_endpoint_tolerates_a_sparse_job(client):
    response = client.post(
        "/match-score",
        json={"cv": {"skills": ["React"]}, "job": {"requiredSkills": ["React"]}},
    )
    assert response.status_code == 200
    assert response.json()["overallScore"] == 100.0


def test_match_score_endpoint_coerces_unknown_enum_values(client):
    response = client.post(
        "/match-score",
        json={
            "cv": {"skills": ["React"]},
            "job": {"requiredSkills": ["React"], "experienceLevel": "wizard"},
        },
    )
    assert response.status_code == 200
    assert "does not state an experience level" in response.json()["experienceFitNote"]


def test_batch_endpoint_scores_every_job(client):
    jobs = [
        job(id="a").model_dump(),
        job(id="b", requiredSkills=["Welding", "AutoCAD"]).model_dump(),
    ]
    response = client.post(
        "/match-score/batch", json={"cv": CV.model_dump(), "jobs": jobs}
    )
    assert response.status_code == 200
    body = response.json()
    assert [r["jobId"] for r in body["results"]] == ["a", "b"]
    assert body["results"][0]["overallScore"] > body["results"][1]["overallScore"]
    assert body["engine"] == "lexical"


def test_batch_endpoint_rejects_oversized_requests(client):
    jobs = [job(id=str(i)).model_dump() for i in range(settings.max_batch_jobs + 1)]
    response = client.post("/match-score/batch", json={"cv": CV.model_dump(), "jobs": jobs})
    assert response.status_code == 400


def test_batch_endpoint_handles_an_empty_job_list(client):
    response = client.post("/match-score/batch", json={"cv": CV.model_dump(), "jobs": []})
    assert response.status_code == 200
    assert response.json()["results"] == []


# ----------------------------------------------------------- semantic engine
class _StubModel:
    """Stands in for SentenceTransformer so the semantic path is testable
    without downloading 2.5 GB of torch. Returns unit vectors on a small
    hand-built map, which is all cosine similarity needs."""

    VECTORS = {
        "react": (1.0, 0.0, 0.0),
        "react framework": (0.96, 0.28, 0.0),   # ~0.96 cosine with "react"
        "welding": (0.0, 0.0, 1.0),             # orthogonal
    }

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def encode(self, values, **_kwargs):
        self.calls.append(list(values))
        return [self.VECTORS.get(str(v).lower(), (0.0, 1.0, 0.0)) for v in values]


def test_semantic_matcher_uses_cosine_similarity_and_caches_embeddings():
    from app.matching.embedder import SemanticMatcher

    model = _StubModel()
    matcher = SemanticMatcher(model)
    assert matcher.engine == "semantic"

    hits = matcher.match_all(["React Framework"], ["Welding", "react"])
    # "react" is an alias of React and so is "React Framework"? No — the phrase
    # is unknown to the dictionary, so this must go through the model.
    assert hits[0] is not None
    assert hits[0].via == "semantic"
    assert hits[0].matched_with == "react"
    assert hits[0].similarity == pytest.approx(0.96, abs=0.01)

    # Second call for the same strings must not re-encode anything.
    before = len(model.calls)
    matcher.match_all(["React Framework"], ["Welding", "react"])
    assert len(model.calls) == before


def test_load_model_returns_none_when_embeddings_are_disabled():
    from app.matching.embedder import load_model

    assert load_model() is None  # EMBEDDINGS_ENABLED=false in conftest


@pytest.mark.skipif(
    not os.getenv("RUN_SEMANTIC_TESTS"),
    reason="downloads all-MiniLM-L6-v2; set RUN_SEMANTIC_TESTS=1 to run",
)
def test_real_model_matches_reactjs_to_react():  # pragma: no cover - opt-in
    import importlib

    os.environ["EMBEDDINGS_ENABLED"] = "true"
    from app import config as config_module
    from app.matching import embedder as embedder_module

    importlib.reload(config_module)
    importlib.reload(embedder_module)
    try:
        matcher = embedder_module.get_matcher()
        assert matcher.engine == "semantic"
        hits = matcher.match_all(["React Framework"], ["ReactJS"])
        assert hits[0] is not None
        assert hits[0].similarity >= config_module.settings.similarity_threshold
    finally:
        os.environ["EMBEDDINGS_ENABLED"] = "false"
        importlib.reload(config_module)
        importlib.reload(embedder_module)
