"""The match score itself.

    score = 0.5*requiredSkills% + 0.2*preferredSkills% + 0.2*experienceFit% + 0.1*educationFit%

Weights come from :mod:`app.config` (asserted at import to sum to 1.0). Every
component returns a percentage *and* a human-readable note, because a bare
number the candidate cannot interrogate is worse than no number at all.

Design rules:

* A job that lists no required skills must not score 0% on that component —
  there is nothing to fail. Missing requirements are treated as "not assessed"
  and their weight is redistributed across the components that *were*
  assessable, so the score stays comparable between jobs.
* Over-qualification is never punished below 100%: a senior applying to an
  entry-level role is a fit for the requirement, whatever else it may be.
"""

from __future__ import annotations

from app.config import settings
from app.matching.embedder import MatchHit, SkillMatcher, get_matcher
from app.schemas import (
    JobRequirements,
    MatchScoreResponse,
    ParsedCv,
    ScoreBreakdown,
    SkillMatch,
)

#: Experience bands in months. The upper bound is open-ended.
EXPERIENCE_BANDS: dict[str, tuple[int, int]] = {
    "entry": (0, 24),
    "mid": (24, 60),
    "senior": (60, 10_000),
}
_EDUCATION_RANK = {
    "unspecified": 0, "slc": 1, "diploma": 2, "bachelor": 3, "master": 4, "phd": 5,
}
_LEVEL_LABEL = {
    "slc": "SLC/SEE", "diploma": "a diploma or +2", "bachelor": "a bachelor's degree",
    "master": "a master's degree", "phd": "a PhD",
}


def _to_skill_match(hit: MatchHit) -> SkillMatch:
    return SkillMatch(
        required=hit.required,
        matchedWith=hit.matched_with,
        similarity=round(hit.similarity, 4),
        via=hit.via,
    )


def _score_skills(
    requirements: list[str], cv_skills: list[str], matcher: SkillMatcher,
) -> tuple[float | None, list[SkillMatch], list[str]]:
    """``(percent, matched, missing)``; percent is ``None`` when not assessable."""
    wanted = [str(r).strip() for r in requirements if str(r).strip()]
    if not wanted:
        return None, [], []
    hits = matcher.match_all(wanted, cv_skills)
    matched = [_to_skill_match(hit) for hit in hits if hit is not None]
    missing = [wanted[i] for i, hit in enumerate(hits) if hit is None]
    percent = round(100.0 * len(matched) / len(wanted), 1)
    return percent, matched, missing


def _months_label(months: int) -> str:
    if months <= 0:
        return "no dated experience"
    years, remainder = divmod(months, 12)
    if years and remainder:
        return f"{years} yr {remainder} mo"
    if years:
        return f"{years} yr{'s' if years > 1 else ''}"
    return f"{months} mo"


def _score_experience(cv: ParsedCv, level: str) -> tuple[float | None, str]:
    months = max(0, int(cv.totalExperienceMonths or 0))
    if not months and cv.experience:
        months = sum(max(0, int(e.months or 0)) for e in cv.experience)
    have = _months_label(months)

    if level not in EXPERIENCE_BANDS:
        note = (
            f"This job does not state an experience level, so this part of the score "
            f"was skipped. Your CV shows {have}."
        )
        return None, note

    low, high = EXPERIENCE_BANDS[level]
    if months >= low:
        if level == "entry" and months > high:
            return 100.0, f"You have {have} — comfortably above the entry-level requirement."
        return 100.0, f"You have {have}, which meets the {level}-level requirement."

    if low <= 0:  # pragma: no cover - entry band starts at 0, so unreachable
        return 100.0, f"You have {have}."
    # Partial credit, floored at 20% so "some experience" never reads as none.
    ratio = months / low
    percent = round(max(20.0, min(100.0, 100.0 * ratio)), 1) if months else 0.0
    shortfall = _months_label(low - months)
    note = (
        f"This is a {level}-level role (about {_months_label(low)}+). "
        f"Your CV shows {have} — roughly {shortfall} short."
        if months
        else f"This is a {level}-level role (about {_months_label(low)}+) and no dated "
             f"experience was found on your CV."
    )
    return percent, note


def _score_education(cv: ParsedCv, requirement: str) -> tuple[float | None, str]:
    have_rank = _EDUCATION_RANK.get(cv.highestEducation or "unspecified", 0)
    have_label = _LEVEL_LABEL.get(cv.highestEducation or "", "no recognised qualification")

    if requirement not in _EDUCATION_RANK or requirement == "unspecified":
        return None, (
            "This job does not state an education requirement, so this part of the "
            "score was skipped."
        )
    need_rank = _EDUCATION_RANK[requirement]
    need_label = _LEVEL_LABEL.get(requirement, requirement)

    if not have_rank:
        return 0.0, (
            f"This job asks for {need_label}. No education entries were recognised on "
            f"your CV — add them on the CV page to improve this score."
        )
    if have_rank >= need_rank:
        extra = " (above what is asked)" if have_rank > need_rank else ""
        return 100.0, f"This job asks for {need_label}; your CV shows {have_label}{extra}."
    # One rung short still counts for something.
    percent = round(max(0.0, 100.0 - 30.0 * (need_rank - have_rank)), 1)
    return percent, (
        f"This job asks for {need_label}; your CV shows {have_label}, which is "
        f"{need_rank - have_rank} level(s) below."
    )


def _redistribute(assessed: dict[str, float | None]) -> dict[str, float]:
    """Effective weight per component, with unassessable ones zeroed.

    A job with no preferred-skills list would otherwise lose 20 points it never
    had a chance to earn, making it look like a worse match than an identical
    job that happened to list some. So the configured weight of every skipped
    component is spread across the ones that could be assessed.
    """
    configured = settings.weights
    usable = {key: configured[key] for key, value in assessed.items() if value is not None}
    total = sum(usable.values())
    if not usable or total <= 0:
        return {key: 0.0 for key in configured}
    return {
        key: (round(configured[key] / total, 6) if key in usable else 0.0)
        for key in configured
    }


def score_match(
    cv: ParsedCv, job: JobRequirements, matcher: SkillMatcher | None = None,
) -> MatchScoreResponse:
    """Score one CV against one job's requirements."""
    matcher = matcher or get_matcher()

    required_pct, matched, missing = _score_skills(job.requiredSkills, cv.skills, matcher)
    preferred_pct, matched_pref, missing_pref = _score_skills(
        job.preferredSkills, cv.skills, matcher
    )
    experience_pct, experience_note = _score_experience(cv, job.experienceLevel)
    education_pct, education_note = _score_education(cv, job.educationRequirement)

    assessed: dict[str, float | None] = {
        "requiredSkills": required_pct,
        "preferredSkills": preferred_pct,
        "experience": experience_pct,
        "education": education_pct,
    }
    weights = _redistribute(assessed)
    contributions = {
        key: round((assessed[key] or 0.0) * weights[key], 2) for key in weights
    }
    overall = round(sum(contributions.values()), 1)

    return MatchScoreResponse(
        jobId=job.id or "",
        overallScore=max(0.0, min(100.0, overall)),
        breakdown=ScoreBreakdown(
            requiredSkillsMatchPercent=required_pct or 0.0,
            preferredSkillsMatchPercent=preferred_pct or 0.0,
            experienceFitPercent=experience_pct or 0.0,
            educationFitPercent=education_pct or 0.0,
            weights=weights,
            contributions=contributions,
        ),
        matchedSkills=matched,
        missingSkills=missing,
        matchedPreferredSkills=matched_pref,
        missingPreferredSkills=missing_pref,
        experienceFitNote=experience_note,
        educationFitNote=education_note,
        engine=matcher.engine,
    )


def score_many(
    cv: ParsedCv, jobs: list[JobRequirements], matcher: SkillMatcher | None = None,
) -> list[MatchScoreResponse]:
    """Score one CV against many jobs, reusing the matcher (and its embedding
    cache) across all of them — the whole point of the batch endpoint."""
    matcher = matcher or get_matcher()
    return [score_match(cv, job, matcher) for job in jobs]
