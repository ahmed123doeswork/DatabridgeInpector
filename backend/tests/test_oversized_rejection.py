import subprocess
import sys

from tests.conftest import REPO_ROOT


def _generate(args: list[str]) -> bytes:
    result = subprocess.run(
        [sys.executable, str(REPO_ROOT / "fixtures" / "oversized_generator.py"), *args],
        capture_output=True,
        check=True,
    )
    return result.stdout


def test_oversized_row_count_rejected_with_422(client):
    content = _generate(["--rows", "2500"])
    response = client.create_job_raw("oversized_rows.csv", "oversized-rows-key", content)
    assert response.status_code == 422
    body = response.json()
    assert body["limit"] == 2000
    assert body["actual"] == 2500


def test_oversized_byte_size_rejected_with_413(client):
    content = _generate(["--bytes", "2200000"])
    assert len(content) > 2 * 1024 * 1024
    response = client.create_job_raw("oversized_bytes.csv", "oversized-bytes-key", content)
    assert response.status_code == 413
    body = response.json()
    assert body["limit"] == 2 * 1024 * 1024


def test_within_limits_is_accepted(client):
    content = _generate(["--rows", "50"])
    response = client.create_job_raw("fifty_rows.csv", "within-limits-key", content)
    assert response.status_code == 201
