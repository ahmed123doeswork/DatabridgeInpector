import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.deps import job_store
from app.main import app
from tests.helpers import DEFAULT_MAPPING

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES_DIR = REPO_ROOT / "fixtures"
EXPECTED_DIR = FIXTURES_DIR / "expected"
SHARED_DIR = REPO_ROOT / "shared"


@pytest.fixture
def fixtures_dir() -> Path:
    return FIXTURES_DIR


def load_fixture_csv(name: str) -> str:
    return (FIXTURES_DIR / name).read_text(encoding="utf-8")


def load_expected_json(name: str) -> dict:
    return json.loads((EXPECTED_DIR / name).read_text(encoding="utf-8"))


def load_contract_schema() -> dict:
    return json.loads((SHARED_DIR / "contract.schema.json").read_text(encoding="utf-8"))


class ApiTestClient:
    """Thin wrapper over FastAPI's TestClient with fixture-aware helpers."""

    def __init__(self) -> None:
        self.http = TestClient(app)

    def create_job_raw(
        self, fixture_name: str, idempotency_key: str | None, fixture_bytes: bytes | None = None
    ):
        content = fixture_bytes if fixture_bytes is not None else (FIXTURES_DIR / fixture_name).read_bytes()
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else {}
        return self.http.post(
            "/jobs",
            headers=headers,
            files={"file": (fixture_name, content, "text/csv")},
        )

    def create_job_from_fixture(
        self, fixture_name: str, idempotency_key: str | None, fixture_bytes: bytes | None = None
    ) -> str:
        response = self.create_job_raw(fixture_name, idempotency_key, fixture_bytes)
        response.raise_for_status()
        return response.json()["id"]

    def set_default_mapping(self, job_id: str) -> dict:
        response = self.http.post(f"/jobs/{job_id}/mapping", json=DEFAULT_MAPPING)
        response.raise_for_status()
        return response.json()

    def validate(self, job_id: str) -> dict:
        response = self.http.post(f"/jobs/{job_id}/validate")
        response.raise_for_status()
        return response.json()

    def get_duplicates(self, job_id: str) -> dict:
        response = self.http.get(f"/jobs/{job_id}/duplicates")
        response.raise_for_status()
        return response.json()

    def export(self, job_id: str) -> dict:
        response = self.http.post(f"/jobs/{job_id}/export")
        response.raise_for_status()
        return response.json()


@pytest.fixture(autouse=True)
def _reset_job_store():
    job_store.reset()
    yield
    job_store.reset()


@pytest.fixture
def client() -> ApiTestClient:
    return ApiTestClient()
