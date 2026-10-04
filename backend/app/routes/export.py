from fastapi import APIRouter

from app.deps import job_store
from app.schemas import ExportResult

router = APIRouter()


@router.post("/jobs/{job_id}/export", response_model=ExportResult)
async def export_job(job_id: str):
    return job_store.export_job(job_id)
