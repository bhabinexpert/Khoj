"""ml-service HTTP surface.

Endpoints
---------
``GET  /health``             liveness + which matcher is loaded
``POST /parse-cv``           PDF/DOCX -> structured CV JSON (nothing stored)
``POST /match-score``        one CV + one job -> explainable score
``POST /match-score/batch``  one CV + many jobs -> one score each

Privacy contract: uploads are read from memory, parsed, and returned. Nothing
is written to disk or to a database, and there is no user identity anywhere in
this service. ``meta.persisted`` says so in every parse response.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.matching.embedder import current_matcher, get_matcher
from app.matching.scorer import score_many, score_match
from app.parsers import get_parser
from app.parsers.text_extract import ExtractionError, extract_text
from app.schemas import (
    BatchMatchRequest,
    BatchMatchScoreResponse,
    MatchRequest,
    MatchScoreResponse,
    ParseCvResponse,
    ParsedCv,
    ParseMeta,
)

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("ml-service")


@asynccontextmanager
async def lifespan(_: FastAPI):
    logger.info(
        "%s v%s starting (embeddings_enabled=%s, threshold=%.2f)",
        settings.service_name, settings.version,
        settings.embeddings_enabled, settings.similarity_threshold,
    )
    if settings.preload_model:
        # Trades a slow boot for a fast first request.
        logger.info("preloaded matcher: %s", get_matcher().engine)
    yield


app = FastAPI(
    title="Khoj ML Service",
    version=settings.version,
    description=(
        "CV parsing and CV-to-job match scoring. Stateless: no database, no "
        "accounts, and uploaded files are never written to disk."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.exception_handler(ExtractionError)
async def _extraction_error_handler(_: Request, exc: ExtractionError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "UnreadableDocument", "message": str(exc)})


@app.get("/health")
def health() -> dict:
    """Liveness plus enough detail to debug a wrong-looking score.

    Deliberately does *not* force the embedding model to load — a liveness probe
    should not trigger a 2.5 GB download. ``engine`` reads ``not-loaded`` until
    the first scoring request (or a ``PRELOAD_MODEL=true`` boot).
    """
    matcher = current_matcher()
    engine = matcher.engine if matcher else "not-loaded"
    return {
        "status": "ok",
        "service": settings.service_name,
        "version": settings.version,
        "engine": engine,
        "embeddingModel": settings.embedding_model if settings.embeddings_enabled else None,
        "similarityThreshold": settings.similarity_threshold,
        "parser": get_parser().name,
        "weights": settings.weights,
        "persistence": "none",
    }


@app.post("/parse-cv", response_model=ParseCvResponse)
async def parse_cv(file: UploadFile = File(...)) -> ParseCvResponse:
    """Extract text from a PDF/DOCX upload and parse it into structured JSON.

    The response is the *only* copy: this service keeps nothing.
    """
    filename = file.filename or "upload"
    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=(
                f"File is too large ({len(content) / 1_048_576:.1f} MB). "
                f"Maximum is {settings.max_upload_bytes / 1_048_576:.0f} MB."
            ),
        )

    extracted = extract_text(filename, content)  # ExtractionError -> 422
    parser = get_parser()
    try:
        parsed = parser.parse(extracted.text)
    except Exception:  # noqa: BLE001 - a parser bug must not lose the upload
        logger.exception("parser %s failed on %s", parser.name, filename)
        raise HTTPException(
            status_code=500,
            detail="The CV could not be parsed. You can still enter your skills manually.",
        )

    cv = ParsedCv(
        skills=parsed.skills,
        education=parsed.education,
        experience=parsed.experience,
        certifications=parsed.certifications,
        name=parsed.name,
        email=parsed.email,
        phone=parsed.phone,
        totalExperienceMonths=parsed.total_experience_months,
        highestEducation=parsed.highest_education,
    )
    meta = ParseMeta(
        filename=filename,
        fileType=extracted.file_type,
        characters=len(extracted.text),
        pages=extracted.pages,
        parser=parser.name,
        confidence=parsed.confidence,
        warnings=[*extracted.warnings, *parsed.warnings],
    )
    logger.info(
        "parsed %s: %d skills, %d education, %d experience (confidence %.2f)",
        filename, len(cv.skills), len(cv.education), len(cv.experience), meta.confidence,
    )
    return ParseCvResponse(cv=cv, meta=meta)


@app.post("/match-score", response_model=MatchScoreResponse)
def match_score(payload: MatchRequest) -> MatchScoreResponse:
    """Score one parsed CV against one job's requirements."""
    return score_match(payload.cv, payload.job)


@app.post("/match-score/batch", response_model=BatchMatchScoreResponse)
def match_score_batch(payload: BatchMatchRequest) -> BatchMatchScoreResponse:
    """Score one CV against many jobs in a single pass.

    The job feed needs a badge per card; doing that as N single calls would
    re-encode the same CV skills N times.
    """
    if len(payload.jobs) > settings.max_batch_jobs:
        raise HTTPException(
            status_code=400,
            detail=f"Too many jobs in one request (max {settings.max_batch_jobs}).",
        )
    results = score_many(payload.cv, payload.jobs)
    engine = results[0].engine if results else get_matcher().engine
    return BatchMatchScoreResponse(results=results, engine=engine)
