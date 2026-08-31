"""Tests for text extraction, the keyword parser, and ``POST /parse-cv``."""

from __future__ import annotations

import io

import pytest

from app.parsers.keyword_parser import (
    KeywordCvParser,
    duration_to_months,
    sectionise,
)
from app.parsers.skills_dictionary import canonical_skill, find_skills
from app.parsers.text_extract import ExtractionError, detect_file_type, extract_text
from tests.conftest import SAMPLE_CV


# ------------------------------------------------------------------ dictionary
def test_aliases_resolve_to_canonical_names():
    assert canonical_skill("ReactJS") == "React"
    assert canonical_skill("react.js") == "React"
    assert canonical_skill("  NODEJS ") == "Node.js"
    assert canonical_skill("postgres") == "PostgreSQL"
    assert canonical_skill("React (advanced)") == "React"
    assert canonical_skill("Underwater Basket Weaving") is None


def test_longer_skill_names_win_over_shorter_ones():
    found = find_skills("Built mobile apps with React Native and web apps with React.")
    assert "React Native" in found
    assert "React" in found


@pytest.mark.parametrize(
    "text",
    [
        "Worked in R&D for 8 hr shifts measuring 100 ml samples",
        "Spring 2023 semester, 5th sem, project with Maya",
        "Wrote a lambda function to filter the list",
    ],
)
def test_ambiguous_words_are_not_treated_as_skills(text):
    assert find_skills(text) == []


# ----------------------------------------------------------------- extraction
def test_detect_file_type_prefers_magic_bytes_over_extension():
    assert detect_file_type("cv.docx", b"%PDF-1.7 ...") == "pdf"
    assert detect_file_type("cv.docx", b"PK\x03\x04rest") == "docx"
    assert detect_file_type("cv.pdf", b"garbage") == "pdf"
    assert detect_file_type("cv.txt", b"garbage") == "unknown"


def test_extract_text_rejects_empty_and_unsupported_files():
    with pytest.raises(ExtractionError, match="empty"):
        extract_text("cv.pdf", b"")
    with pytest.raises(ExtractionError, match="Unsupported"):
        extract_text("cv.txt", b"hello")


def test_extract_pdf_reports_a_scanned_document_clearly(sample_pdf):
    text = extract_text("cv.pdf", sample_pdf)
    assert text.file_type == "pdf"
    assert "Sabin Shrestha" in text.text
    assert text.pages >= 1


def test_extract_docx_includes_table_cells(sample_docx):
    text = extract_text("cv.docx", sample_docx)
    assert text.file_type == "docx"
    # The skills only exist inside a table in this fixture.
    assert "TypeScript" in text.text


def test_corrupt_pdf_raises_extraction_error():
    with pytest.raises(ExtractionError):
        extract_text("cv.pdf", b"%PDF-1.4 this is not really a pdf")


# --------------------------------------------------------------------- parser
def test_sectionise_finds_headings_and_header_block():
    sections = sectionise(SAMPLE_CV)
    assert "skills" in sections
    assert "experience" in sections
    assert "education" in sections
    assert "Sabin Shrestha" in sections["_header"]
    assert "ReactJS" in sections["skills"]


def test_keyword_parser_extracts_the_whole_cv():
    result = KeywordCvParser().parse(SAMPLE_CV)

    assert result.name == "Sabin Shrestha"
    assert result.email == "sabin.shrestha@example.com"
    assert "9801234567" in result.phone.replace("-", "").replace(" ", "")

    assert "React" in result.skills          # from "ReactJS"
    assert "Tailwind CSS" in result.skills
    assert "MongoDB" in result.skills
    assert "Node.js" in result.skills

    assert result.highest_education == "bachelor"
    levels = {entry["level"] for entry in result.education}
    assert {"bachelor", "diploma"} <= levels

    roles = [entry["role"] for entry in result.experience]
    assert any("Frontend Developer" in role for role in roles)
    assert any("Intern" in role for role in roles)
    # Jan 2022 - Dec 2024 (35) + Jun 2021 - Dec 2021 (6)
    assert result.total_experience_months == 41

    assert result.certifications
    assert result.confidence > 0.5


def test_parser_never_raises_on_junk_input():
    for junk in ["", "   ", "!!!", "\n\n\n", "a" * 5000]:
        result = KeywordCvParser().parse(junk)
        assert isinstance(result.skills, list)


def test_parser_warns_when_there_is_no_skills_section():
    result = KeywordCvParser().parse("I have used React and Django at work.")
    assert "React" in result.skills
    assert any("skills section" in warning for warning in result.warnings)


@pytest.mark.parametrize(
    ("duration", "expected"),
    [
        ("Jan 2022 - Dec 2024", 35),
        ("2019 - 2023", 48),
        ("3 years 6 months", 42),
        ("18 months", 18),
        ("2+ years", 24),
        ("no dates here", 0),
        ("", 0),
    ],
)
def test_duration_to_months(duration, expected):
    assert duration_to_months(duration, today=(2026, 8)) == expected


def test_open_ended_duration_is_measured_against_today():
    assert duration_to_months("Jan 2024 - Present", today=(2026, 8)) == 31
    assert duration_to_months("Jan 2024 - till date", today=(2025, 1)) == 12


# ------------------------------------------------------------------- endpoint
def test_parse_cv_endpoint_returns_structured_cv(client, sample_pdf):
    response = client.post(
        "/parse-cv", files={"file": ("cv.pdf", sample_pdf, "application/pdf")}
    )
    assert response.status_code == 200
    body = response.json()

    assert "React" in body["cv"]["skills"]
    assert body["cv"]["highestEducation"] == "bachelor"
    assert body["cv"]["email"] == "sabin.shrestha@example.com"
    assert body["meta"]["fileType"] == "pdf"
    assert body["meta"]["parser"] == "keyword-v1"
    assert body["meta"]["characters"] > 0
    # The privacy contract is restated in the payload itself.
    assert body["meta"]["persisted"] is False


def test_parse_cv_endpoint_accepts_docx(client, sample_docx):
    response = client.post(
        "/parse-cv",
        files={
            "file": (
                "cv.docx",
                sample_docx,
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )
    assert response.status_code == 200
    assert "TypeScript" in response.json()["cv"]["skills"]


def test_parse_cv_endpoint_rejects_unreadable_uploads(client):
    response = client.post(
        "/parse-cv", files={"file": ("notes.txt", b"just some text", "text/plain")}
    )
    assert response.status_code == 422
    assert response.json()["error"] == "UnreadableDocument"


def test_parse_cv_endpoint_requires_a_file(client):
    assert client.post("/parse-cv").status_code == 422


def test_health_does_not_load_the_model(client):
    body = client.get("/health").json()
    assert body["status"] == "ok"
    assert body["engine"] == "not-loaded"
    assert body["persistence"] == "none"
    assert body["parser"] == "keyword-v1"
