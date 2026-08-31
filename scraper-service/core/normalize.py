"""Shared, source-agnostic job normalisation helpers.

Every :class:`SourceAdapter` funnels its raw scrape results through
:func:`normalize_job` so the ingestion payload has exactly one shape,
regardless of how messy the upstream HTML was.
"""

from __future__ import annotations

import hashlib
import re
from datetime import datetime, timezone
from typing import Any, Iterable

from .skills import extract_preferred_skills, extract_required_skills

JOB_TYPES = ("internship", "full-time", "part-time", "contract", "remote")
EXPERIENCE_LEVELS = ("entry", "mid", "senior", "unspecified")

_WHITESPACE_RE = re.compile(r"\s+")
_HASH_NORMALISE_RE = re.compile(r"[^a-z0-9]+")
_APPLY_URL_RE = re.compile(r"^(?:https?://\S|mailto:\S+@\S+)", re.I)
_HREF_RE = re.compile(r"""href=["']([^"']+)["']""", re.I)
_URL_IN_TEXT_RE = re.compile(r"https?://[^\s\"'<>)]+", re.I)
_EMAIL_IN_TEXT_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")

#: Whole-line chrome that job boards wrap around the real posting — share
#: buttons, view counters, "apply now" call-to-actions. Matched line-by-line
#: and case-insensitively so the substance is left untouched.
_DESC_NOISE_RE = re.compile(
    r"^(?:•\s*)?(?:"
    r"apply\s*now|apply\s+before.*|share\s*(?:this)?\s*(?:job)?|share\s+on\s+\w+|"
    r"job\s+overview|views?\s*:.*|no\.?\s*of\s+vacanc\w*\s*:?.*|"
    r"tweet|print(?:\s+this)?(?:\s+job)?|save(?:\s+this)?(?:\s+job)?|"
    r"report\s+this\s+job|back\s+to\s+(?:jobs|listings?)"
    r")\s*$",
    re.I,
)

def _compile(
    groups: tuple[tuple[str, tuple[str, ...]], ...],
) -> tuple[tuple[str, re.Pattern[str]], ...]:
    """Compile ``(label, needles)`` groups into word-boundary matchers.

    Plain substring matching was too eager: "international" contains "intern",
    "we are a fully remote-friendly office" contains "remote", and — worst of
    all — "you will *be* responsible" contained the "be " spelling of a B.E.
    degree, so almost every posting claimed to require a bachelor's.
    """
    return tuple(
        (label, re.compile(rf"(?<![a-z0-9])(?:{'|'.join(needles)})(?![a-z0-9])", re.I))
        for label, needles in groups
    )


_JOB_TYPE_PATTERNS = _compile(
    (
        ("internship", ("interns?", "internships?", "trainee", "apprentice(?:ship)?")),
        ("remote", ("remote", r"work\s+from\s+home", "wfh", r"fully\s+distributed")),
        ("part-time", (r"part[\s-]?time", "parttime")),
        ("contract", ("contractual", "contract", "freelance", "consultant", "temporary")),
        ("full-time", (r"full[\s-]?time", "fulltime", "permanent")),
    )
)

_EXPERIENCE_PATTERNS = _compile(
    (
        ("senior", ("senior", "sr", "lead", "principal", r"head\s+of", "manager", "architect")),
        ("mid", (r"mid[\s-]?level", "intermediate", "associate", "officer")),
        ("entry", ("entry", "fresher", "graduate", "junior", "jr", "interns?", "trainee", r"no\s+experience")),
    )
)

_YEARS_RE = re.compile(r"(\d+)\s*(?:\+|plus)?\s*(?:-|to)?\s*(\d+)?\s*year", re.I)

#: A two/three-letter degree abbreviation only counts when something
#: degree-shaped follows it ("BE in Civil", "BE/BSc", "SEE passed", "BE 2021").
_DEGREE_CTX = (
    r"(?=\s*(?:in\b|of\b|or\b|and\b|from\b|degree\b|level\b|pass(?:ed)?\b"
    r"|graduat|complet|[(,;:/&|–—-]|(?:19|20)\d{2}|$))"
)

#: ``(level, case-insensitive words, UPPERCASE-only abbreviations)``, highest
#: qualification first — :func:`detect_education` returns the first hit.
_EDU_LEVELS: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("phd", (r"ph\.?\s?d", "doctorate", "doctoral"), ()),
    (
        "master",
        (r"master(?:'?s)?", r"m\.?sc", "mba", "mca", r"m\.?tech", r"m\.?com", r"m\.?phil",
         r"post[\s-]?graduate"),
        (),
    ),
    (
        "bachelor",
        (r"bachelor(?:'?s)?", r"b\.?sc", r"b\.?tech", r"b\.?arch", r"b\.?com", "bba", "bbs",
         "bca", "bhm", r"under[\s-]?graduate"),
        ("BE", "BIT", "BIM"),
    ),
    (
        "diploma",
        ("diploma", r"\+2", r"plus[\s-]?two", r"higher[\s-]?secondary", "intermediate",
         r"a[\s-]?levels?"),
        (),
    ),
    (
        "slc",
        ("slc", r"school[\s-]?leaving", r"secondary\s+education\s+examination"),
        ("SEE",),
    ),
)


def _compile_education() -> tuple[tuple[str, re.Pattern[str]], ...]:
    out: list[tuple[str, re.Pattern[str]]] = []
    for level, words, abbreviations in _EDU_LEVELS:
        if words:
            out.append(
                (level, re.compile(rf"(?<![a-z0-9])(?:{'|'.join(words)})(?![a-z0-9])", re.I))
            )
        if abbreviations:
            # Case-sensitive: bare "be"/"see" in prose is not a qualification.
            out.append((level, re.compile(r"\b(?:" + "|".join(abbreviations) + r")\b" + _DEGREE_CTX)))
    return tuple(out)


_EDU_PATTERNS = _compile_education()


def clean_text(value: Any) -> str:
    """Collapse whitespace and strip; ``None`` becomes an empty string."""
    if value is None:
        return ""
    return _WHITESPACE_RE.sub(" ", str(value)).strip()


def clean_block(value: Any) -> str:
    """Like :func:`clean_text` but keeps paragraph breaks for descriptions."""
    if value is None:
        return ""
    text = str(value).replace("\r\n", "\n").replace("\r", "\n")
    lines = [_WHITESPACE_RE.sub(" ", line).strip() for line in text.split("\n")]
    out: list[str] = []
    for line in lines:
        if not line and out and not out[-1]:
            continue  # squash runs of blank lines down to one
        out.append(line)
    return "\n".join(out).strip()


def clean_apply_url(value: Any, *, source_url: str = "") -> str | None:
    """Keep only a link a jobseeker can actually submit an application through.

    ``http(s)`` and ``mailto:`` are allowed — plenty of postings say no more than
    "email your CV to hr@…". Anything else (``tel:``, a bare word, a t.me link
    that just points back at the post we scraped) becomes ``None`` so the UI can
    tell "the source named an application route" apart from "it did not".
    """
    candidate = clean_text(value)
    if not candidate or len(candidate) > 600 or not _APPLY_URL_RE.match(candidate):
        return None
    if candidate == clean_text(source_url):
        return None
    return candidate


def find_apply_link(*fragments: Any) -> str | None:
    """Dig the employer's own application destination out of free text.

    Boards bury the real route inside a "How to apply" blurb — an ``<a href>``,
    a bare ``https://…`` URL, or "email your CV to hr@…". An anchor or explicit
    URL wins; an email address is the last resort, returned as a ``mailto:``.
    Returns ``None`` when nothing application-shaped is present, so the caller
    keeps pointing at the board.
    """
    for fragment in fragments:
        if not fragment:
            continue
        for href in _HREF_RE.findall(str(fragment)):
            href = href.strip()
            if _APPLY_URL_RE.match(href):
                return href
    text = " ".join(clean_text(f) for f in fragments if f)
    if not text:
        return None
    url = _URL_IN_TEXT_RE.search(text)
    if url:
        # Trailing sentence punctuation is not part of the URL.
        return url.group(0).rstrip(".,;:)]}>\"'")
    email = _EMAIL_IN_TEXT_RE.search(text)
    if email:
        return f"mailto:{email.group(0)}"
    return None


def tidy_description(text: str) -> str:
    """Strip a posting's boilerplate chrome without touching its substance.

    Removes whole-line noise (share buttons, view counters, "apply now") and
    collapses the blank-line runs that removal leaves behind, so the description
    the reader sees is the job — not the page it was lifted from.
    """
    kept: list[str] = []
    for line in text.split("\n"):
        if _DESC_NOISE_RE.match(line.strip()):
            continue
        if not line.strip() and kept and not kept[-1].strip():
            continue
        kept.append(line)
    return "\n".join(kept).strip()


def detect_job_type(*sources: str) -> str:
    haystack = " ".join(s for s in sources if s)
    for job_type, pattern in _JOB_TYPE_PATTERNS:
        if pattern.search(haystack):
            return job_type
    return "full-time"


def detect_experience_level(*sources: str) -> str:
    haystack = " ".join(s for s in sources if s)
    match = _YEARS_RE.search(haystack)
    if match:
        low = int(match.group(1))
        if low >= 5:
            return "senior"
        if low >= 2:
            return "mid"
        return "entry"
    for level, pattern in _EXPERIENCE_PATTERNS:
        if pattern.search(haystack):
            return level
    return "unspecified"


def detect_education(*sources: str) -> str:
    # Case is preserved: the abbreviation patterns are deliberately case-sensitive.
    haystack = " ".join(s for s in sources if s)
    for level, pattern in _EDU_PATTERNS:
        if pattern.search(haystack):
            return level
    return "unspecified"


def dedupe_hash(title: str, company: str, description: str) -> str:
    """Stable SHA-256 over title + company + first 100 chars of description.

    Must stay byte-for-byte in sync with ``backend/src/utils/dedupe.js`` — the
    backend recomputes this on ingest and relies on a unique index over it.
    """

    def norm(value: str) -> str:
        return _HASH_NORMALISE_RE.sub(" ", clean_text(value).lower()).strip()

    payload = "|".join([norm(title), norm(company), norm(description)[:100]])
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _iso(value: Any) -> str | None:
    """Best-effort conversion of scraped date values to an ISO-8601 string."""
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        dt = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc).isoformat()
    text = clean_text(value)
    for fmt in ("%Y-%m-%d", "%d %b %Y", "%d %B %Y", "%b %d, %Y", "%B %d, %Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=timezone.utc).isoformat()
        except ValueError:
            continue
    try:  # ISO-ish strings, including trailing "Z"
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc).isoformat()
    except ValueError:
        return None


def _dedupe_list(values: Iterable[Any], limit: int = 40) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values or []:
        item = clean_text(value)
        if not item:
            continue
        key = item.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
        if len(out) >= limit:
            break
    return out


def normalize_job(raw: dict[str, Any], *, source_platform: str) -> dict[str, Any] | None:
    """Turn one adapter's raw dict into the canonical ingest payload.

    Returns ``None`` when the posting is unusable (no title or no source URL),
    which lets adapters stay optimistic about upstream markup.
    """
    title = clean_text(raw.get("title"))
    source_url = clean_text(raw.get("sourceUrl") or raw.get("url"))
    if not title or not source_url:
        return None

    company = clean_text(raw.get("company")) or "Not disclosed"
    description = tidy_description(clean_block(raw.get("description"))) or title
    skill_corpus = " ".join(
        [description, clean_text(raw.get("requirements")), title]
    )

    required = _dedupe_list(raw.get("requiredSkills") or extract_required_skills(skill_corpus))
    preferred = _dedupe_list(
        s for s in (raw.get("preferredSkills") or extract_preferred_skills(skill_corpus))
        if s.lower() not in {r.lower() for r in required}
    )

    job_type = clean_text(raw.get("jobType")).lower()
    if job_type not in JOB_TYPES:
        job_type = detect_job_type(title, description, clean_text(raw.get("jobTypeRaw")))

    experience = clean_text(raw.get("experienceLevel")).lower()
    if experience not in EXPERIENCE_LEVELS:
        experience = detect_experience_level(title, description, clean_text(raw.get("experienceRaw")))

    education = clean_text(raw.get("educationRequirement")).lower()
    if not education or education == "unspecified":
        education = detect_education(description, clean_text(raw.get("educationRaw")))

    return {
        "title": title,
        "company": company,
        "description": description,
        "requiredSkills": required,
        "preferredSkills": preferred,
        "experienceLevel": experience,
        "educationRequirement": education,
        "jobType": job_type,
        "location": clean_text(raw.get("location")) or "Nepal",
        "salary": clean_text(raw.get("salary")) or None,
        "deadline": _iso(raw.get("deadline")),
        "postedDate": _iso(raw.get("postedDate")) or datetime.now(timezone.utc).isoformat(),
        "sourcePlatform": source_platform,
        "sourceUrl": source_url,
        "applyUrl": clean_apply_url(raw.get("applyUrl"), source_url=source_url),
        "dedupeHash": dedupe_hash(title, company, description),
    }
