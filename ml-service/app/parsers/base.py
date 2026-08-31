"""The seam between "we have text" and "we have a structured CV".

The spec asks for a keyword/dictionary parser *now* with room for a spaCy NER
model *later*. That swap only stays cheap if the rest of the service never
imports the keyword parser directly — so everything goes through
:class:`CvParser` and :func:`get_parser`.

To add a spaCy implementation later:

1. write ``app/parsers/ner_parser.py`` with ``class NerCvParser(CvParser)``,
2. add it to the registry inside :func:`get_parser`,
3. run with ``CV_PARSER=ner``.

No other file changes.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
import os


@dataclass
class ParseResult:
    """What every parser must produce, in ml-service's own vocabulary.

    Deliberately *not* a Pydantic model: parsers should not have to care about
    the HTTP contract, and ``app/main.py`` does the mapping onto
    :class:`app.schemas.ParsedCv`.
    """

    skills: list[str] = field(default_factory=list)
    education: list[dict] = field(default_factory=list)
    experience: list[dict] = field(default_factory=list)
    certifications: list[str] = field(default_factory=list)

    name: str = ""
    email: str = ""
    phone: str = ""

    total_experience_months: int = 0
    highest_education: str = "unspecified"

    #: 0-1 self-assessment: "how much of this document did I understand?".
    confidence: float = 0.0
    warnings: list[str] = field(default_factory=list)


class CvParser(ABC):
    """Turn CV plain text into a :class:`ParseResult`."""

    #: Reported back to the client in ``meta.parser`` so support can tell which
    #: implementation produced a given result.
    name: str = "abstract"

    @abstractmethod
    def parse(self, text: str) -> ParseResult:
        """Parse ``text``. Must never raise on merely-unusual input; report
        problems through :attr:`ParseResult.warnings` instead."""


def get_parser(kind: str | None = None) -> CvParser:
    """Return the configured parser. ``CV_PARSER`` env var picks it."""
    from app.parsers.keyword_parser import KeywordCvParser

    registry: dict[str, type[CvParser]] = {"keyword": KeywordCvParser}
    key = (kind or os.getenv("CV_PARSER") or "keyword").strip().lower()
    return registry.get(key, KeywordCvParser)()
