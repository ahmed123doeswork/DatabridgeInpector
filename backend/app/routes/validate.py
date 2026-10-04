from fastapi import APIRouter

from app.deps import job_store
from app.schemas import ImportJob

router = APIRouter()


@router.post("/jobs/{job_id}/validate", response_model=ImportJob)
async def validate_job(job_id: str):
    return job_store.validate(job_id)
