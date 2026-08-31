"""ml-service settings, all overridable by environment variable."""

from __future__ import annotations

import os

def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, ""))
    except ValueError:
        return default


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, ""))
    except ValueError:
        return default


class Settings:
    """Runtime configuration for parsing and scoring."""

    service_name = "khoj-ml-service"
    version = "1.0.0"

    # ---------------------------------------------------------------- uploads
    #: Hard ceiling on an uploaded CV. Real CVs are well under 1 MB.
    max_upload_bytes: int = _int("MAX_UPLOAD_BYTES", 5 * 1024 * 1024)
    #: Guard against a PDF bomb producing hundreds of pages of text.
    max_pdf_pages: int = _int("MAX_PDF_PAGES", 15)
    max_text_chars: int = _int("MAX_TEXT_CHARS", 120_000)

    # ---------------------------------------------------------------- matching
    #: Sentence-transformers model used for semantic skill similarity.
    embedding_model: str = os.getenv("EMBEDDING_MODEL", "all-MiniLM-L6-v2")
    #: Cosine similarity at or above this counts as a skill match.
    #: 0.75 is the spec'd threshold: "ReactJS" ~ "React" clears it, unrelated
    #: skills do not.
    similarity_threshold: float = _float("SIMILARITY_THRESHOLD", 0.75)
    #: Set EMBEDDINGS_ENABLED=false to force the deterministic lexical matcher
    #: (useful in CI, or on a box that cannot afford torch).
    embeddings_enabled: bool = _flag("EMBEDDINGS_ENABLED", True)
    #: Load the model at import time instead of on first request.
    preload_model: bool = _flag("PRELOAD_MODEL", False)

    #: Scoring weights. Must sum to 1.0 — asserted at import.
    weight_required_skills: float = _float("WEIGHT_REQUIRED_SKILLS", 0.5)
    weight_preferred_skills: float = _float("WEIGHT_PREFERRED_SKILLS", 0.2)
    weight_experience: float = _float("WEIGHT_EXPERIENCE", 0.2)
    weight_education: float = _float("WEIGHT_EDUCATION", 0.1)

    #: Cap on jobs per /match-score/batch call.
    max_batch_jobs: int = _int("MAX_BATCH_JOBS", 50)

    cors_origins: list[str] = [
        o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()
    ]

    @property
    def weights(self) -> dict[str, float]:
        return {
            "requiredSkills": self.weight_required_skills,
            "preferredSkills": self.weight_preferred_skills,
            "experience": self.weight_experience,
            "education": self.weight_education,
        }


settings = Settings()

_total = sum(settings.weights.values())
if abs(_total - 1.0) > 1e-6:  # pragma: no cover - config guard
    raise ValueError(f"Scoring weights must sum to 1.0, got {_total:.4f}: {settings.weights}")
