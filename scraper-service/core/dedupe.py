"""Cross-platform duplicate merging.

The same vacancy is routinely posted to Merojob *and* JobAxle. Postings are grouped by :func:`core.normalize.dedupe_hash` — a stable
hash of ``title + company + first 100 chars of description`` — and each group
collapses into one listing that carries **every** source link, so the UI can
offer "Apply on Merojob" *or* "Apply on JobAxle" for one row in the feed.

The backend performs the authoritative merge on ingest (it also has to merge
against jobs already in MongoDB); doing it here first keeps payloads small and
makes a run's real yield visible in the logs.
"""

from __future__ import annotations

import logging
from typing import Any, Iterable

logger = logging.getLogger(__name__)


def _source_entry(job: dict[str, Any]) -> dict[str, str]:
    return {"platform": job.get("sourcePlatform", ""), "url": job.get("sourceUrl", "")}


def _richer(candidate: dict[str, Any], incumbent: dict[str, Any]) -> bool:
    """Prefer whichever copy carries more usable detail."""
    def score(job: dict[str, Any]) -> tuple[int, int, int, int]:
        return (
            len(job.get("description") or ""),
            len(job.get("requiredSkills") or []),
            1 if job.get("salary") else 0,
            1 if job.get("deadline") else 0,
        )

    return score(candidate) > score(incumbent)


def merge_duplicates(jobs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse postings sharing a dedupe hash into single multi-source jobs.

    The winning copy (richest description) supplies the displayed fields; every
    copy contributes an entry to ``sources[]``. Skill lists are unioned so a
    thin posting on one board still benefits from a detailed one on another.
    """
    merged: dict[str, dict[str, Any]] = {}

    for job in jobs:
        key = job.get("dedupeHash")
        if not key:
            logger.warning("dropping job without dedupeHash: %r", job.get("title"))
            continue

        existing = merged.get(key)
        if existing is None:
            job = dict(job)
            job["sources"] = [_source_entry(job)]
            merged[key] = job
            continue

        sources = existing["sources"]
        entry = _source_entry(job)
        if not any(s["url"] == entry["url"] for s in sources):
            sources.append(entry)

        union_required = _union(existing.get("requiredSkills"), job.get("requiredSkills"))
        union_preferred = [
            s for s in _union(existing.get("preferredSkills"), job.get("preferredSkills"))
            if s.lower() not in {r.lower() for r in union_required}
        ]

        if _richer(job, existing):
            winner = dict(job)
            winner["sources"] = sources
            merged[key] = winner
            target = winner
        else:
            target = existing

        target["requiredSkills"] = union_required
        target["preferredSkills"] = union_preferred
        target["salary"] = target.get("salary") or job.get("salary") or existing.get("salary")
        target["deadline"] = target.get("deadline") or job.get("deadline") or existing.get("deadline")

    duplicates = 0
    for job in merged.values():
        duplicates += max(0, len(job["sources"]) - 1)
    if duplicates:
        logger.info("merged %s duplicate posting(s) across platforms", duplicates)

    return list(merged.values())


def _union(*lists: list[str] | None) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for values in lists:
        for value in values or []:
            key = str(value).strip().lower()
            if key and key not in seen:
                seen.add(key)
                out.append(str(value).strip())
    return out
