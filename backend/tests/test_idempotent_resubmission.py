from app.deps import job_store
from tests.conftest import FIXTURES_DIR


def test_same_key_same_file_returns_same_job_without_reprocessing(client):
    content = (FIXTURES_DIR / "clean.csv").read_bytes()

    first = client.create_job_raw("clean.csv", "resubmit-key", content)
    assert first.status_code == 201
    first_job = first.json()
    calls_after_first = job_store.process_call_count

    second = client.create_job_raw("clean.csv", "resubmit-key", content)
    assert second.status_code == 200
    second_job = second.json()

    assert second_job["id"] == first_job["id"]
    assert second_job == first_job
    # No reprocessing happened: the parse/process path was not invoked again.
    assert job_store.process_call_count == calls_after_first


def test_same_key_different_file_returns_409_and_does_not_overwrite(client):
    clean_bytes = (FIXTURES_DIR / "clean.csv").read_bytes()
    dup_bytes = (FIXTURES_DIR / "duplicates.csv").read_bytes()

    first = client.create_job_raw("clean.csv", "conflict-key", clean_bytes)
    assert first.status_code == 201
    first_job = first.json()

    conflict = client.create_job_raw("duplicates.csv", "conflict-key", dup_bytes)
    assert conflict.status_code == 409
    body = conflict.json()
    assert body["error"] == "idempotency_key_reused_with_different_payload"
    assert body["key"] == "conflict-key"

    # The original job under that key must be untouched.
    again = client.create_job_raw("clean.csv", "conflict-key", clean_bytes)
    assert again.status_code == 200
    assert again.json() == first_job


def test_no_idempotency_key_always_creates_a_new_job(client):
    content = (FIXTURES_DIR / "clean.csv").read_bytes()
    first = client.create_job_raw("clean.csv", None, content)
    second = client.create_job_raw("clean.csv", None, content)
    assert first.status_code == 201
    assert second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
