"""Skill similarity: semantic when the model is available, lexical when not.

Why two paths? ``sentence-transformers`` pulls in torch (~2.5 GB) and downloads
model weights on first use. That is the right default in production — it is what
makes "ReactJS" match "React" and "Postgres" match "PostgreSQL" — but it must
not be a hard requirement to run the tests, CI, or a small VPS. So:

* :class:`SemanticMatcher` — ``all-MiniLM-L6-v2`` cosine similarity, threshold
  from ``SIMILARITY_THRESHOLD`` (0.75, per spec).
* :class:`LexicalMatcher` — alias dictionary + token overlap + ``difflib``.
  Deterministic, no downloads, and still resolves the alias cases the spec
  calls out by name.

Whichever ran is reported to the client as ``engine`` so a score is never
silently produced by the weaker matcher.
"""

from __future__ import annotations

import difflib
import logging
import re
import threading
from dataclasses import dataclass

from app.config import settings
from app.parsers.skills_dictionary import canonical_skill

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"[a-z0-9+#.]+")
#: Words that carry no signal when comparing two skill names.
_STOPWORDS = frozenset(
    "and or of the a an in with for to using use knowledge experience good strong "
    "basic advanced excellent proficiency proficient skills skill ability".split()
)


@dataclass
class MatchHit:
    """One requirement satisfied by one CV skill."""

    required: str
    matched_with: str
    similarity: float
    via: str  # "exact" | "alias" | "semantic" | "fuzzy"


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _tokens(value: str) -> frozenset[str]:
    return frozenset(t for t in _TOKEN_RE.findall(_normalise(value)) if t not in _STOPWORDS)


class SkillMatcher:
    """Base class: exact and alias matching, which both engines share."""

    engine = "lexical"
    #: What to call a similarity-based hit in the response. Never claim
    #: "semantic" for a match the embedding model did not actually make.
    similarity_label = "semantic"

    def _similarity_matrix(self, requirements: list[str], candidates: list[str]) -> list[list[float]]:
        raise NotImplementedError

    def match_all(self, requirements: list[str], cv_skills: list[str]) -> list[MatchHit | None]:
        """One entry per requirement: the best CV skill for it, or ``None``.

        Cheap tiers run first so the model is only asked about the requirements
        the dictionary could not resolve.
        """
        if not requirements:
            return []
        candidates = [s for s in cv_skills if str(s).strip()]
        results: list[MatchHit | None] = [None] * len(requirements)
        if not candidates:
            return results

        by_normalised = {_normalise(c): c for c in reversed(candidates)}
        by_canonical: dict[str, str] = {}
        for candidate in reversed(candidates):
            canonical = canonical_skill(candidate)
            if canonical:
                by_canonical[canonical.lower()] = candidate

        unresolved: list[int] = []
        for index, requirement in enumerate(requirements):
            key = _normalise(requirement)
            if not key:
                continue
            if key in by_normalised:
                results[index] = MatchHit(requirement, by_normalised[key], 1.0, "exact")
                continue
            canonical = canonical_skill(requirement)
            if canonical and canonical.lower() in by_canonical:
                results[index] = MatchHit(
                    requirement, by_canonical[canonical.lower()], 1.0, "alias"
                )
                continue
            unresolved.append(index)

        if unresolved:
            pending = [requirements[i] for i in unresolved]
            matrix = self._similarity_matrix(pending, candidates)
            threshold = settings.similarity_threshold
            for row, index in enumerate(unresolved):
                scores = matrix[row] if row < len(matrix) else []
                if not scores:
                    continue
                best = max(range(len(scores)), key=scores.__getitem__)
                if scores[best] >= threshold:
                    results[index] = MatchHit(
                        requirements[index],
                        candidates[best],
                        round(float(scores[best]), 4),
                        self.similarity_label,
                    )
        return results


class LexicalMatcher(SkillMatcher):
    """Deterministic stand-in for the embedding model.

    Three cheap signals, blended: Jaccard overlap of significant tokens, a
    containment bonus (``"React"`` inside ``"React Native"``), and
    ``difflib`` character similarity for typos and spacing variants. Scaled so
    that clear synonyms clear the same 0.75 threshold the semantic path uses,
    while unrelated skills stay well below it.
    """

    engine = "lexical"
    similarity_label = "fuzzy"

    def _similarity_matrix(self, requirements: list[str], candidates: list[str]) -> list[list[float]]:
        candidate_tokens = [_tokens(c) for c in candidates]
        candidate_norms = [_normalise(c) for c in candidates]
        matrix: list[list[float]] = []
        for requirement in requirements:
            req_tokens = _tokens(requirement)
            req_norm = _normalise(requirement)
            row: list[float] = []
            for tokens, norm in zip(candidate_tokens, candidate_norms):
                row.append(self._score(req_tokens, req_norm, tokens, norm))
            matrix.append(row)
        return matrix

    @staticmethod
    def _score(
        req_tokens: frozenset[str], req_norm: str,
        cand_tokens: frozenset[str], cand_norm: str,
    ) -> float:
        if not req_norm or not cand_norm:
            return 0.0
        if req_norm == cand_norm:
            return 1.0
        ratio = difflib.SequenceMatcher(None, req_norm, cand_norm).ratio()
        if not req_tokens or not cand_tokens:
            return round(ratio * 0.9, 4)
        shared = req_tokens & cand_tokens
        jaccard = len(shared) / len(req_tokens | cand_tokens)
        # Whole requirement present in the candidate (or vice versa): the two
        # name the same thing at different granularity.
        containment = 0.0
        if req_tokens <= cand_tokens or cand_tokens <= req_tokens:
            containment = 0.8
        elif shared:
            containment = 0.55 * (len(shared) / min(len(req_tokens), len(cand_tokens)))
        return round(min(1.0, max(jaccard, containment, ratio * 0.85)), 4)


class SemanticMatcher(SkillMatcher):
    """sentence-transformers cosine similarity, loaded lazily."""

    engine = "semantic"

    def __init__(self, model) -> None:  # noqa: ANN001 - SentenceTransformer
        self._model = model
        self._cache: dict[str, list[float]] = {}
        self._lock = threading.Lock()

    def _embed(self, values: list[str]) -> list[list[float]]:
        """Embed with a small process-lifetime cache.

        The feed scores one CV against up to 50 jobs whose requirement lists
        overlap heavily, so caching by skill name avoids re-encoding the same
        handful of strings dozens of times.
        """
        missing = [v for v in dict.fromkeys(values) if _normalise(v) not in self._cache]
        if missing:
            vectors = self._model.encode(
                missing, normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False,
            )
            with self._lock:
                for value, vector in zip(missing, vectors):
                    self._cache[_normalise(value)] = [float(x) for x in vector]
            if len(self._cache) > 4000:  # pragma: no cover - long-running guard
                with self._lock:
                    self._cache.clear()
        return [self._cache[_normalise(v)] for v in values]

    def _similarity_matrix(self, requirements: list[str], candidates: list[str]) -> list[list[float]]:
        req_vectors = self._embed(requirements)
        cand_vectors = self._embed(candidates)
        # Vectors are L2-normalised, so the dot product *is* cosine similarity.
        return [
            [sum(a * b for a, b in zip(req, cand)) for cand in cand_vectors]
            for req in req_vectors
        ]


_matcher: SkillMatcher | None = None
_matcher_lock = threading.Lock()


def load_model():  # noqa: ANN201 - SentenceTransformer | None
    """Import and load the embedding model, or return ``None``.

    Every failure mode here (package absent, no disk space, offline box that
    cannot download weights) has the same correct answer: fall back to lexical
    matching and say so.
    """
    if not settings.embeddings_enabled:
        logger.info("embeddings disabled by configuration; using lexical matcher")
        return None
    try:
        from sentence_transformers import SentenceTransformer
    except Exception as exc:  # noqa: BLE001
        logger.warning("sentence-transformers unavailable (%s); using lexical matcher", exc)
        return None
    try:
        logger.info("loading embedding model %s", settings.embedding_model)
        return SentenceTransformer(settings.embedding_model)
    except Exception as exc:  # noqa: BLE001
        logger.warning("could not load %s (%s); using lexical matcher", settings.embedding_model, exc)
        return None


def get_matcher() -> SkillMatcher:
    """The process-wide matcher, built on first use."""
    global _matcher
    if _matcher is None:
        with _matcher_lock:
            if _matcher is None:
                model = load_model()
                _matcher = SemanticMatcher(model) if model is not None else LexicalMatcher()
                logger.info("skill matcher ready: %s", _matcher.engine)
    return _matcher


def current_matcher() -> SkillMatcher | None:
    """The matcher *if it is already built*, without triggering a model load.

    Used by ``/health`` so a liveness probe cannot start a 2.5 GB download.
    """
    return _matcher


def reset_matcher() -> None:
    """Drop the cached matcher. Used by tests to force one engine or the other."""
    global _matcher
    with _matcher_lock:
        _matcher = None
