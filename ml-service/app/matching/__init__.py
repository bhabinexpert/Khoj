"""Skill similarity and match scoring."""

from app.matching.embedder import (
    MatchHit,
    SkillMatcher,
    current_matcher,
    get_matcher,
    reset_matcher,
)
from app.matching.scorer import score_many, score_match

__all__ = [
    "MatchHit",
    "SkillMatcher",
    "current_matcher",
    "get_matcher",
    "reset_matcher",
    "score_match",
    "score_many",
]
