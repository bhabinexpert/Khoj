"""Dictionary/keyword CV parser — the default :class:`CvParser`.

Strategy, in order of how much we trust each signal:

1. **Sectionise.** Find "Skills", "Education", "Experience", "Certifications"
   headings and slice the document. A CV with headings is parsed well.
2. **Per-section extraction.** Skills come from list items in the skills
   section, education from degree keywords, experience from role/company/date
   lines.
3. **Whole-document fallback.** No skills section, or a heading we did not
   recognise? Scan the entire text with the alias dictionary. Lower confidence,
   but never an empty result.

Deliberately conservative: a wrong education entry is worse than a missing one,
because the user sees and edits this in the browser.
"""

from __future__ import annotations

import re

from app.parsers.base import CvParser, ParseResult
from app.parsers.skills_dictionary import (
    SECTION_HEADINGS,
    canonicalise_all,
    find_skills,
)

# ------------------------------------------------------------------ contact
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
#: Loose candidate net; :func:`_find_phone` scores the hits. Kept loose on
#: purpose — Nepali CVs write numbers as 98XXXXXXXX, +977-98XX-XXXXXX,
#: 01-4XXXXXX and every spacing in between.
PHONE_RE = re.compile(r"\+?\d[\d\s\-().]{5,16}\d")
URL_RE = re.compile(r"\b(?:https?://|www\.)\S+", re.I)

# ------------------------------------------------------------------ bullets
_BULLETS = "•▪◦‣·–—-*»>"
_LIST_SPLIT_RE = re.compile(r"[,;/|]|\s{3,}|•")

# ------------------------------------------------------------------ education
#: ``(level, case-insensitive words, UPPERCASE-only abbreviations)``, checked
#: most-specific-first so "M.Sc" is never read as "Sc".
#:
#: The split matters: "master" is safe to match anywhere, but a dotless "MS"
#: would otherwise turn "MS Excel" into a master's degree, and lowercase "bit"
#: is an English word while "BIT" is a real Nepali bachelor's. Two-letter
#: abbreviations additionally have to be followed by degree-ish context.
_DEGREE_CTX = r"(?=\s*(?:in\b|of\b|[(,;:–—-]|(?:19|20)\d{2}|$))"
EDUCATION_LEVELS: tuple[tuple[str, tuple[str, ...], tuple[str, ...]], ...] = (
    ("phd", (r"ph\.?\s?d", "doctorate", "doctoral"), ()),
    (
        "master",
        (
            r"master(?:'?s)?", r"m\.?sc", "mba", "mca", r"m\.?tech", r"m\.?com",
            r"m\.ed", "mph", "llm", r"post\s?graduate", r"m\.s", r"m\.a", r"m\.e",
            r"m\.phil",
        ),
        (r"MS" + _DEGREE_CTX, r"MA" + _DEGREE_CTX, r"ME" + _DEGREE_CTX,
         r"MEd" + _DEGREE_CTX),
    ),
    (
        "bachelor",
        (
            r"bachelor(?:'?s)?", r"b\.?sc", r"b\.?tech", "bba", "bbs", "bca", "bhm",
            "bpharm", "bsn", "llb", r"under\s?graduate", r"b\.?arch", r"b\.?com",
            r"b\.ed", r"b\.e", r"b\.a",
        ),
        (r"BIT" + _DEGREE_CTX, r"BIM" + _DEGREE_CTX, r"BE" + _DEGREE_CTX,
         r"BA" + _DEGREE_CTX, r"BS" + _DEGREE_CTX, r"BEd" + _DEGREE_CTX),
    ),
    (
        "diploma",
        (
            "diploma", "pcl", r"\+2", r"plus\s?two", r"higher\s?secondary",
            "intermediate", r"a\s?levels?", r"certificate\s+in",
        ),
        (),
    ),
    (
        # No bare "SEE": the word "see" is far too common in English prose, and
        # a false SLC entry still shows up in the UI for the user to delete.
        "slc",
        (
            "slc", r"s\.e\.e", r"s\.?l\.?c", r"school\s+leaving",
            r"secondary\s+education\s+examination", r"class\s*10(?:th)?",
        ),
        (r"SEE" + _DEGREE_CTX,),
    ),
)


def _compile_education() -> tuple[tuple[str, re.Pattern[str]], ...]:
    """One case-insensitive and one uppercase-only matcher per level.

    The trailing ``(?![a-z])`` is what stops "m.ed" matching inside "medical"
    and "b.a" inside "b.arch".
    """
    out: list[tuple[str, re.Pattern[str]]] = []
    for level, words, abbreviations in EDUCATION_LEVELS:
        if words:
            joined = "|".join(words)
            out.append((level, re.compile(rf"(?<![a-z])(?:{joined})\.?(?![a-z])", re.I)))
        if abbreviations:
            out.append((level, re.compile(r"\b(?:" + "|".join(abbreviations) + r")")))
    return tuple(out)


_EDU_PATTERNS = _compile_education()
_LEVEL_RANK = {"unspecified": 0, "slc": 1, "diploma": 2, "bachelor": 3, "master": 4, "phd": 5}

_INSTITUTION_RE = re.compile(
    r"([A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*|\s+of\s+|\s+for\s+|\s+and\s+)*\s*"
    r"(?:University|College|Campus|School|Institute|Academy|Polytechnic))",
)
_YEAR_RE = re.compile(r"\b(19[5-9]\d|20[0-4]\d)\b")
#: Nepali CVs often date in Bikram Sambat (2078, 2081...).
_BS_YEAR_RE = re.compile(r"\b(20[5-9]\d|21\d\d)\b")
_FIELD_RE = re.compile(
    r"\b(?:in|of)\s+([A-Za-z][A-Za-z&/\s]{2,40}?)(?=\s*(?:[,(\-–|]|from|at|$))",
    re.I,
)

# ------------------------------------------------------------------ experience
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7,
    "aug": 8, "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}
_MONTH_ALT = "|".join(_MONTHS)
_DATE_TOKEN = rf"(?:(?:{_MONTH_ALT})[a-z]*\.?\s*,?\s*)?(?:19|20)\d{{2}}"
_PRESENT = r"present|current|till\s+date|to\s+date|now|ongoing"
DURATION_RE = re.compile(
    rf"({_DATE_TOKEN})\s*(?:-|–|—|to|until|through)\s*({_DATE_TOKEN}|{_PRESENT})",
    re.I,
)
#: "3 years 6 months", "2+ yrs", "18 months" — two patterns rather than one
#: with optional groups, which would happily match the empty string.
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b", re.I)
_MONTHS_SPAN_RE = re.compile(r"(\d{1,3})\s*(?:months?|mos?)\b", re.I)
_ROLE_HINT_RE = re.compile(
    r"\b(?:engineer|developer|programmer|analyst|designer|manager|officer|executive|"
    r"assistant|associate|intern|internship|trainee|consultant|specialist|coordinator|"
    r"administrator|architect|lead|head|director|supervisor|technician|accountant|"
    r"teacher|lecturer|nurse|pharmacist|marketer|writer|editor|scientist|tester|"
    r"recruiter|receptionist|cashier|sales|support|freelance)\b",
    re.I,
)
_AT_COMPANY_RE = re.compile(
    r"(?:\bat\b|\bwith\b|,|\||–|—|-)\s*"
    r"([A-Z][\w.&'()-]*(?:\s+[A-Z0-9][\w.&'()-]*){0,4}"
    r"(?:\s+(?:Pvt\.?|Private|Ltd\.?|Limited|Inc\.?|LLC|Technologies|Technology|Solutions|"
    r"Systems|Group|Services|Nepal|International|Company|Co\.?|Consultancy|Bank|Hospital))?)",
)
_COMPANY_SUFFIX_RE = re.compile(
    r"\b(?:Pvt\.?\s*Ltd\.?|Private\s+Limited|Ltd\.?|Limited|Inc\.?|LLC|LLP|"
    r"Technologies|Technology|Solutions|Systems|Services|Consultancy|Enterprises|"
    r"Group|Bank|Hospital|Industries|Traders|Suppliers|Nepal)\b",
    re.I,
)

_CERT_HINT_RE = re.compile(
    r"\b(?:certified|certificate|certification|training|workshop|bootcamp|course|"
    r"diploma\s+in|nanodegree|licensed?|aws\s+certified|microsoft\s+certified|"
    r"google\s+certified|cisco|ccna|comptia|pmp|scrum\s+master|ielts|toefl|jlpt)\b",
    re.I,
)

#: heading text -> section key, longest first so "work experience" wins.
_HEADING_LOOKUP: list[tuple[str, str]] = sorted(
    ((phrase, key) for key, phrases in SECTION_HEADINGS.items() for phrase in phrases),
    key=lambda pair: -len(pair[0]),
)


def _heading_key(line: str) -> str | None:
    """Return the section a line is a heading for, or ``None``.

    Headings are short, mostly free of sentence punctuation, and often
    decorated ("• TECHNICAL SKILLS :", "--- Education ---").
    """
    stripped = line.strip().strip(_BULLETS + " ").strip()
    if not stripped or len(stripped) > 60:
        return None
    core = re.sub(r"[^a-z& ]+", " ", stripped.lower())
    core = re.sub(r"\s+", " ", core).strip()
    if not core:
        return None
    for phrase, key in _HEADING_LOOKUP:
        if core == phrase or core == phrase + " " or core.rstrip(":") == phrase:
            return key
    # "Skills & Tools", "Work Experience (5 years)" — heading plus a qualifier.
    for phrase, key in _HEADING_LOOKUP:
        if core.startswith(phrase) and len(core) <= len(phrase) + 14:
            return key
    return None


def sectionise(text: str) -> dict[str, str]:
    """Split CV text into ``{section_key: body}``.

    Text before the first recognised heading lands in ``"_header"``, which is
    where the name and contact details almost always live.
    """
    sections: dict[str, list[str]] = {"_header": []}
    current = "_header"
    for line in text.split("\n"):
        key = _heading_key(line)
        if key:
            current = key
            sections.setdefault(current, [])
            continue
        sections.setdefault(current, []).append(line)
    return {key: "\n".join(lines).strip() for key, lines in sections.items()}


# ------------------------------------------------------------------- contact
def _find_email(text: str) -> str:
    match = EMAIL_RE.search(text)
    return match.group(0).strip(".,;") if match else ""


def _find_phone(text: str) -> str:
    """Best phone-shaped run of digits, preferring Nepali mobile numbers."""
    best = ""
    best_score = -1
    for raw in PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", raw)
        if not 7 <= len(digits) <= 15:
            continue
        score = 0
        if digits.startswith("977") and len(digits) >= 12:
            score += 3
        national = digits[3:] if digits.startswith("977") else digits
        if len(national) == 10 and national[:2] in ("98", "97", "96"):
            score += 3
        elif len(national) in (7, 8) and national.startswith(("1", "01")):
            score += 1  # Kathmandu landline
        if len(digits) == 4:
            continue  # a year
        if score > best_score:
            best_score, best = score, raw.strip(" -().")
    return re.sub(r"\s{2,}", " ", best)


def _find_name(header: str, email: str) -> str:
    """First plausible person-name line in the header block."""
    for line in header.split("\n")[:8]:
        candidate = line.strip().strip(_BULLETS + " ")
        if not candidate or len(candidate) > 45:
            continue
        if EMAIL_RE.search(candidate) or URL_RE.search(candidate):
            continue
        if re.search(r"\d", candidate) or ":" in candidate:
            continue
        words = candidate.split()
        if not 1 < len(words) <= 5:
            continue
        # "CURRICULUM VITAE", "RESUME" and job titles are not names.
        if re.search(r"\b(?:curriculum|vitae|resume|cv|profile|address)\b", candidate, re.I):
            continue
        if _ROLE_HINT_RE.search(candidate):
            continue
        if all(re.fullmatch(r"[A-Z][a-z.'-]+|[A-Z.'-]{2,}", w) for w in words):
            return " ".join(w if not w.isupper() or len(w) < 4 else w.title() for w in words)
    # Some CVs put "Name: Ram Bahadur" instead.
    labelled = re.search(r"^\s*name\s*[:\-]\s*(.{2,45})$", header, re.I | re.M)
    if labelled:
        return labelled.group(1).strip()
    if email:
        local = re.split(r"[._\d]+", email.split("@")[0])
        parts = [p.title() for p in local if len(p) > 1]
        if len(parts) >= 2:
            return " ".join(parts[:3])
    return ""


# -------------------------------------------------------------------- skills
def _list_items(block: str) -> list[str]:
    """Split a skills block into candidate items.

    Handles the three layouts that cover almost every CV: one skill per line,
    comma/slash separated runs, and "Frontend: React, Redux, Tailwind" labels.
    """
    items: list[str] = []
    for line in block.split("\n"):
        line = line.strip().strip(_BULLETS + " ").strip()
        if not line:
            continue
        # Drop a leading category label ("Frontend:", "Tools & Platforms:"),
        # keeping it only when the label is itself a known skill ("Excel: adv").
        label = re.match(r"^([A-Za-z][A-Za-z /&+.#-]{1,28})\s*[:\-]\s+(.*\S)$", line)
        if label and (_LIST_SPLIT_RE.search(label.group(2)) or len(label.group(2)) < 40):
            if find_skills(label.group(1)):
                items.append(label.group(1))
            line = label.group(2)
        for piece in _LIST_SPLIT_RE.split(line):
            piece = piece.strip(" .;:-–—•\t")
            if 1 < len(piece) <= 60:
                items.append(piece)
    return items


def _extract_skills(sections: dict[str, str], full_text: str) -> tuple[list[str], bool]:
    """Canonical skills plus a flag for "did we have a real skills section?"."""
    from_section: list[str] = []
    blocks = [sections.get("skills", ""), sections.get("languages", "")]
    for block in blocks:
        if not block:
            continue
        for item in _list_items(block):
            # An item may itself be a phrase containing a known skill
            # ("Proficient in Microsoft Excel").
            hits = find_skills(item)
            if hits:
                from_section.extend(hits)
                continue
            # Unrecognised: keep it verbatim when it reads like a skill name
            # rather than a sentence, so niche skills still reach the scorer.
            if len(item.split()) <= 4 and not item.endswith(".") and len(item) >= 2:
                from_section.append(item)

    had_section = bool(sections.get("skills"))
    # Always sweep the whole document too: projects and experience bullets are
    # where the real evidence of a skill lives.
    swept = find_skills(full_text)
    merged = canonicalise_all([*from_section, *swept])
    return merged, had_section


# ----------------------------------------------------------------- education
def _education_level(text: str) -> str:
    for level, pattern in _EDU_PATTERNS:
        if pattern.search(text):
            return level
    return "unspecified"


def _clean_degree(line: str) -> str:
    degree = re.split(r"\s*[|(]|\s{3,}", line)[0]
    degree = re.sub(r"\s*[,–—-]\s*(?:19|20)\d{2}.*$", "", degree)
    return degree.strip(" .,;:-–—•\t")[:120]


def _extract_education(block: str, full_text: str) -> list[dict]:
    """One entry per line that names a qualification."""
    source = block or full_text
    entries: list[dict] = []
    seen: set[str] = set()
    for raw in source.split("\n"):
        line = raw.strip().strip(_BULLETS + " ").strip()
        if len(line) < 4 or len(line) > 200:
            continue
        level = _education_level(line)
        if level == "unspecified":
            continue
        institution = ""
        inst_match = _INSTITUTION_RE.search(line)
        if inst_match:
            institution = inst_match.group(1).strip(" ,")
        year_match = _YEAR_RE.findall(line) or _BS_YEAR_RE.findall(line)
        field_match = _FIELD_RE.search(line)
        entry = {
            "degree": _clean_degree(line),
            "field": (field_match.group(1).strip(" ,.").title() if field_match else ""),
            "institution": institution[:120],
            "year": (year_match[-1] if year_match else ""),
            "level": level,
        }
        key = f"{entry['degree'].lower()}|{entry['year']}"
        if key in seen:
            continue
        seen.add(key)
        entries.append(entry)
        if len(entries) >= 8:
            break
    return entries


def _highest_education(entries: list[dict]) -> str:
    best = "unspecified"
    for entry in entries:
        if _LEVEL_RANK.get(entry.get("level", ""), 0) > _LEVEL_RANK[best]:
            best = entry["level"]
    return best


# ---------------------------------------------------------------- experience
def _parse_date(token: str) -> tuple[int, int] | None:
    """``"Jan 2021"`` / ``"2021"`` -> ``(year, month)``."""
    year_match = re.search(r"(19|20)\d{2}", token)
    if not year_match:
        return None
    year = int(year_match.group(0))
    month = 1
    name = re.search(r"[A-Za-z]{3,}", token)
    if name:
        month = _MONTHS.get(name.group(0)[:3].lower(), 1)
        if name.group(0)[:4].lower() == "sept":
            month = 9
    return year, month


def duration_to_months(duration: str, *, today: tuple[int, int] | None = None) -> int:
    """Months spanned by a duration string. 0 when it cannot be read.

    Handles both "Jan 2021 - Present" and "3 years 6 months"; an open-ended
    range is measured against ``today`` so the number ages correctly.
    """
    if not duration:
        return 0
    now = today or _today()
    match = DURATION_RE.search(duration)
    if match:
        start = _parse_date(match.group(1))
        end_token = match.group(2)
        if start:
            if re.fullmatch(rf"\s*(?:{_PRESENT})\s*", end_token, re.I):
                end = now
            else:
                end = _parse_date(end_token) or now
            months = (end[0] - start[0]) * 12 + (end[1] - start[1])
            # A "2021 - 2023" range means two full years of work, and a single
            # month should never round to zero.
            return max(1, months)
    years = _YEARS_RE.search(duration)
    months = _MONTHS_SPAN_RE.search(duration)
    if years or months:
        total = (int(years.group(1)) * 12 if years else 0)
        total += (int(months.group(1)) if months else 0)
        return total
    return 0


def _today() -> tuple[int, int]:
    from datetime import date

    now = date.today()
    return now.year, now.month


def _split_role_company(line: str) -> tuple[str, str]:
    """Best-effort "Frontend Developer at Leapfrog Pvt. Ltd." -> (role, company)."""
    head = DURATION_RE.sub("", line)
    head = re.sub(r"\(\s*\)", "", head).strip(" .,;:|–—-\t")
    company = ""
    at_match = re.search(r"\b(?:at|for|with)\s+(.{2,60})$", head, re.I)
    if at_match:
        role = head[: at_match.start()].strip(" .,;:|–—-")
        company = at_match.group(1).strip(" .,;:|–—-")
    else:
        parts = [p.strip(" .,;:\t") for p in re.split(r"\s*[|–—]\s*|\s*,\s*|\s{3,}", head) if p.strip()]
        role = parts[0] if parts else head
        for part in parts[1:]:
            if _COMPANY_SUFFIX_RE.search(part) or (part[:1].isupper() and not _ROLE_HINT_RE.search(part)):
                company = part
                break
    return role[:120].strip(), company[:120].strip()


def _extract_experience(block: str, full_text: str) -> list[dict]:
    """Group the experience section into entries.

    An entry starts on a line that has *both* a role-ish word and a date range,
    or on a role-ish line immediately followed by a date line — the two layouts
    that cover most CVs. Everything else is treated as detail and skipped,
    which is safer than inventing entries.
    """
    source = block or ""
    if not source:
        # No recognised heading: only trust lines that carry a date range.
        source = "\n".join(
            line for line in full_text.split("\n")
            if DURATION_RE.search(line) and _ROLE_HINT_RE.search(line)
        )
    lines = [line.strip().strip(_BULLETS + " ") for line in source.split("\n")]
    lines = [line for line in lines if line]

    entries: list[dict] = []
    index = 0
    while index < len(lines) and len(entries) < 12:
        line = lines[index]
        duration_match = DURATION_RE.search(line)
        dates_on_next_line = False
        if not duration_match and index + 1 < len(lines):
            # Role on one line, "Company | Jan 2021 - Present" on the next.
            nxt = lines[index + 1]
            if DURATION_RE.search(nxt) and len(nxt) <= 80:
                duration_match = DURATION_RE.search(nxt)
                dates_on_next_line = True
        if not duration_match or not (_ROLE_HINT_RE.search(line) or _COMPANY_SUFFIX_RE.search(line)):
            index += 1
            continue
        role, company = _split_role_company(line)
        if dates_on_next_line and not company:
            _, company = _split_role_company(lines[index + 1])
            if not company:
                company = _split_role_company(lines[index + 1])[0]
        duration = duration_match.group(0).strip()
        entries.append({
            "role": role,
            "company": company,
            "duration": duration,
            "months": duration_to_months(duration),
        })
        index += 2 if dates_on_next_line else 1
    return entries


# ------------------------------------------------------------ certifications
def _extract_certifications(sections: dict[str, str]) -> list[str]:
    block = sections.get("certifications", "")
    out: list[str] = []
    seen: set[str] = set()
    source = block or ""
    if not source:
        # Without a heading, only take lines that announce themselves.
        source = "\n".join(
            line for line in sections.get("_header", "").split("\n")
            if _CERT_HINT_RE.search(line)
        )
    for raw in source.split("\n"):
        line = raw.strip().strip(_BULLETS + " ").strip(" .;")
        if not 3 < len(line) <= 160:
            continue
        if _heading_key(line):
            continue
        key = line.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
        if len(out) >= 20:
            break
    return out


# -------------------------------------------------------------------- parser
class KeywordCvParser(CvParser):
    """Dictionary-driven parser. No model weights, no network, deterministic."""

    name = "keyword-v1"

    def parse(self, text: str) -> ParseResult:
        result = ParseResult()
        if not text or not text.strip():
            result.warnings.append("The document contained no readable text.")
            return result

        sections = sectionise(text)
        header = sections.get("_header", "") or text[:600]

        result.email = _find_email(text)
        result.phone = _find_phone(header) or _find_phone(text)
        result.name = _find_name(header, result.email)

        skills, had_skills_section = _extract_skills(sections, text)
        result.skills = skills

        result.education = _extract_education(sections.get("education", ""), text)
        result.highest_education = _highest_education(result.education)

        result.experience = _extract_experience(sections.get("experience", ""), text)
        result.total_experience_months = sum(int(e.get("months") or 0) for e in result.experience)

        result.certifications = _extract_certifications(sections)

        result.confidence = self._confidence(sections, result, had_skills_section)
        result.warnings.extend(self._warnings(sections, result, had_skills_section))
        return result

    # -- explainability -----------------------------------------------------
    @staticmethod
    def _confidence(sections: dict[str, str], result: ParseResult, had_skills_section: bool) -> float:
        """Rough "how much of this did we understand?" signal, 0-1.

        Weighted towards the things a wrong answer would hurt most: skills and
        the presence of real section headings.
        """
        score = 0.0
        if had_skills_section:
            score += 0.25
        if result.skills:
            score += min(0.25, 0.05 * len(result.skills))
        if result.education:
            score += 0.15
        if result.experience:
            score += 0.15
        if sections.get("experience") or sections.get("education"):
            score += 0.1
        if result.email or result.phone:
            score += 0.05
        if result.name:
            score += 0.05
        return round(min(1.0, score), 2)

    @staticmethod
    def _warnings(sections: dict[str, str], result: ParseResult, had_skills_section: bool) -> list[str]:
        warnings: list[str] = []
        if not had_skills_section:
            warnings.append(
                "No skills section was found, so skills were inferred from the whole "
                "document. Please check the list below."
            )
        if not result.skills:
            warnings.append("No known skills were recognised — add them manually to get match scores.")
        if not result.experience and sections.get("experience"):
            warnings.append(
                "An experience section was found but no dated entries could be read from it."
            )
        if not result.education:
            warnings.append("No education entries were recognised.")
        return warnings







