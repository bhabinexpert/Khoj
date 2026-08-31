"""Adapter registry.

``python run_scrapers.py --sources merojob,jobaxle`` resolves names through
:data:`ADAPTERS`, so registering a new source is a one-line change here.
"""

from adapters.base import SourceAdapter
from adapters.api import ArbeitnowAdapter, HimalayasAdapter
from adapters.jobaxle import JobaxleAdapter
from adapters.jsonld import (
    FroxjobAdapter,
    JobsNepalAdapter,
    KumariJobAdapter,
    MerorojgariAdapter,
    NepaliJobAdapter,
    RojgariAdapter,
)
from adapters.merojob import MerojobAdapter

ADAPTERS: dict[str, type[SourceAdapter]] = {
    MerojobAdapter.platform: MerojobAdapter,
    JobaxleAdapter.platform: JobaxleAdapter,
    KumariJobAdapter.platform: KumariJobAdapter,
    FroxjobAdapter.platform: FroxjobAdapter,
    MerorojgariAdapter.platform: MerorojgariAdapter,
    JobsNepalAdapter.platform: JobsNepalAdapter,
    RojgariAdapter.platform: RojgariAdapter,
    NepaliJobAdapter.platform: NepaliJobAdapter,
    HimalayasAdapter.platform: HimalayasAdapter,
    ArbeitnowAdapter.platform: ArbeitnowAdapter,
}

#: Sources that run when ``--sources`` is not given.
DEFAULT_SOURCES: tuple[str, ...] = tuple(ADAPTERS)

__all__ = [
    "ADAPTERS",
    "DEFAULT_SOURCES",
    "SourceAdapter",
    "MerojobAdapter",
    "JobaxleAdapter",
    "KumariJobAdapter",
    "FroxjobAdapter",
    "MerorojgariAdapter",
    "JobsNepalAdapter",
    "RojgariAdapter",
    "NepaliJobAdapter",
    "HimalayasAdapter",
    "ArbeitnowAdapter",
]
