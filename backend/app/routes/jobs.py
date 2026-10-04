from fastapi import APIRouter, Header, UploadFile
from fastapi.responses import JSONResponse

from app.deps import job_store
from app.limits import check_file_size

router = APIRouter()


@router.post("/jobs")
async def create_job(
    file: UploadFile,
    idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
):
    file_bytes = await file.read()
    check_file_size(len(file_bytes))

    job, was_reused = job_store.create_job(file_bytes, idempotency_key)
    status_code = 200 if was_reused else 201
    return JSONResponse(status_code=status_code, content=job.model_dump(mode="json"))


@router.get("/jobs/{job_id}/source-columns")
async def get_source_columns(job_id: str):
    return job_store.get_source_columns(job_id)
