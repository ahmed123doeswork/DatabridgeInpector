from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

from app.deps import job_store
from app.schemas import ImportJob

router = APIRouter()


@router.get("/jobs/{job_id}/duplicates", response_model=ImportJob)
async def get_duplicates(job_id: str):
    return job_store.get_duplicates(job_id)


class NormalizationDecision(BaseModel):
    rowId: str
    field: str
    status: Literal["accepted", "rejected"]


@router.post("/jobs/{job_id}/normalization", response_model=ImportJob)
async def set_normalization_status(job_id: str, decision: NormalizationDecision):
    return job_store.set_normalization_status(
        job_id, decision.rowId, decision.field, decision.status
    )


class ExcludeRowRequest(BaseModel):
    rowId: str
    excluded: bool


@router.post("/jobs/{job_id}/exclude-row", response_model=ImportJob)
async def set_row_excluded(job_id: str, body: ExcludeRowRequest):
    return job_store.set_row_excluded(job_id, body.rowId, body.excluded)
