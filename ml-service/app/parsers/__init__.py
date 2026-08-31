"""Document -> text -> structured CV.

Import :func:`app.parsers.base.get_parser` rather than a concrete parser, so
the keyword implementation can be swapped for a spaCy NER one later.
"""

from app.parsers.base import CvParser, ParseResult, get_parser

__all__ = ["CvParser", "ParseResult", "get_parser"]
