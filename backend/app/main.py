from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.limits import LimitExceededError
from app.routes import duplicates, export, jobs, mapping, validate
from app.store import IdempotencyConflictError, JobNotFoundError, JobNotMappedError

app = FastAPI(title="DatabridgeInspector API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(LimitExceededError)
async def limit_exceeded_handler(request: Request, exc: LimitExceededError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.message, "limit": exc.limit, "actual": exc.actual},
    )


@app.exception_handler(IdempotencyConflictError)
async def idempotency_conflict_handler(
    request: Request, exc: IdempotencyConflictError
) -> JSONResponse:
    return JSONResponse(
        status_code=409,
        content={"error": "idempotency_key_reused_with_different_payload", "key": exc.key},
    )


@app.exception_handler(JobNotFoundError)
async def job_not_found_handler(request: Request, exc: JobNotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "job_not_found"})


@app.exception_handler(JobNotMappedError)
async def job_not_mapped_handler(request: Request, exc: JobNotMappedError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"error": "job_has_no_mapping"})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(jobs.router)
app.include_router(mapping.router)
app.include_router(validate.router)
app.include_router(duplicates.router)
app.include_router(export.router)
