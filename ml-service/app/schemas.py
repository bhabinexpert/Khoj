"""Pydantic request/response models — the ml-service's public contract."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

EXPERIENCE_LEVELS = ("entry", "mid", "senior", "unspecified")
EDUCATION_LEVELS = ("slc", "diploma", "bachelor", "master", "phd", "unspecified")


# --------------------------------------------------------------------- CV side
class EducationEntry(BaseModel):
    degree: str = ""
    field: str = ""
    institution: str = ""
    year: str = ""
    #: Normalised ladder rung, used by the education-fit component of the score.
    level: Literal["slc", "diploma", "bachelor", "master", "phd", "unspecified"] = "unspecified"


class ExperienceEntry(BaseModel):
    role: str = ""
    company: str = ""
    #: Human-readable span exactly as written on the CV ("Jan 2021 - Present").
    duration: str = ""
    #: Machine-usable span in months, derived from ``duration`` when possible.
    months: int = 0


class ParsedCv(BaseModel):
    """Structured CV. Also the request body for scoring, since the browser
    round-trips this object out of localStorage untouched."""

    skills: list[str] = Field(default_factory=list)
    education: list[EducationEntry] = Field(default_factory=list)
    experience: list[ExperienceEntry] = Field(default_factory=list)
    certifications: list[str] = Field(default_factory=list)

    #: Convenience fields the UI shows; never required.
    name: str = ""
    email: str = ""
    phone: str = ""

    #: Total professional experience in months, summed across entries.
    totalExperienceMonths: int = 0
    #: Highest education level found.
    highestEducation: Literal["slc", "diploma", "bachelor", "master", "phd", "unspecified"] = "unspecified"

    @field_validator("skills", "certifications", mode="before")
    @classmethod
    def _coerce_string_list(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        return [str(v) for v in value if str(v).strip()]


class ParseCvResponse(BaseModel):
    cv: ParsedCv
    meta: "ParseMeta"


class ParseMeta(BaseModel):
    filename: str
    fileType: Literal["pdf", "docx", "unknown"]
    characters: int
    pages: int = 0
    parser: str
    #: Rough 0-1 signal for "did we actually understand this document?".
    confidence: float = 0.0
    warnings: list[str] = Field(default_factory=list)
    #: Restates the privacy contract in the payload itself.
    persisted: Literal[False] = False


# ------------------------------------------------------------------- job side
class JobRequirements(BaseModel):
    id: str = ""
    title: str = ""
    requiredSkills: list[str] = Field(default_factory=list)
    preferredSkills: list[str] = Field(default_factory=list)
    experienceLevel: Literal["entry", "mid", "senior", "unspecified"] = "unspecified"
    educationRequirement: Literal["slc", "diploma", "bachelor", "master", "phd", "unspecified"] = "unspecified"

    @field_validator("requiredSkills", "preferredSkills", mode="before")
    @classmethod
    def _coerce_skills(cls, value: object) -> list[str]:
        if value is None:
            return []
        if isinstance(value, str):
            return [value]
        return [str(v) for v in value if str(v).strip()]

    @field_validator("experienceLevel", "educationRequirement", mode="before")
    @classmethod
    def _tolerate_unknown(cls, value: object) -> str:
        text = str(value or "").strip().lower()
        return text if text in EXPERIENCE_LEVELS + EDUCATION_LEVELS else "unspecified"


class MatchRequest(BaseModel):
    cv: ParsedCv
    job: JobRequirements


class BatchMatchRequest(BaseModel):
    cv: ParsedCv
    jobs: list[JobRequirements] = Field(default_factory=list)


# ---------------------------------------------------------------- score side
class SkillMatch(BaseModel):
    """One required/preferred skill and the CV skill that satisfied it."""

    required: str
    matchedWith: str
    similarity: float
    #: ``exact`` | ``alias`` | ``semantic`` | ``fuzzy`` — lets the UI explain
    #: *why*, and never claims the embedding model made a call it did not.
    via: Literal["exact", "alias", "semantic", "fuzzy"]


class ScoreBreakdown(BaseModel):
    requiredSkillsMatchPercent: float
    preferredSkillsMatchPercent: float
    experienceFitPercent: float
    educationFitPercent: float
    weights: dict[str, float]
    #: Each component's weighted contribution to the final score.
    contributions: dict[str, float]


class MatchScoreResponse(BaseModel):
    jobId: str = ""
    overallScore: float
    breakdown: ScoreBreakdown
    matchedSkills: list[SkillMatch] = Field(default_factory=list)
    missingSkills: list[str] = Field(default_factory=list)
    matchedPreferredSkills: list[SkillMatch] = Field(default_factory=list)
    missingPreferredSkills: list[str] = Field(default_factory=list)
    experienceFitNote: str = ""
    educationFitNote: str = ""
    #: ``semantic`` when the transformer ran, ``lexical`` on the fallback path.
    engine: Literal["semantic", "lexical"] = "lexical"


class BatchMatchScoreResponse(BaseModel):
    results: list[MatchScoreResponse] = Field(default_factory=list)
    engine: Literal["semantic", "lexical"] = "lexical"


ParseCvResponse.model_rebuild()
