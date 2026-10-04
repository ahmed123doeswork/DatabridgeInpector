from fastapi import APIRouter

from app.deps import job_store
from app.schemas import ColumnMapping, ImportJob

router = APIRouter()


@router.post("/jobs/{job_id}/mapping", response_model=ImportJob)
async def set_mapping(job_id: str, mapping: ColumnMapping):
    return job_store.set_mapping(job_id, mapping)
