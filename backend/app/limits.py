"""Server-side limits are enforced, not advisory (AGENTS.md rule 7)."""

MAX_FILE_BYTES = 2 * 1024 * 1024
MAX_ROWS = 2000


class LimitExceededError(Exception):
    def __init__(self, message: str, limit: int, actual: int, status_code: int) -> None:
        super().__init__(message)
        self.message = message
        self.limit = limit
        self.actual = actual
        self.status_code = status_code


def check_file_size(size_bytes: int) -> None:
    if size_bytes > MAX_FILE_BYTES:
        raise LimitExceededError(
            "File exceeds the 2 MB size limit.", MAX_FILE_BYTES, size_bytes, status_code=413
        )


def check_row_count(row_count: int) -> None:
    if row_count > MAX_ROWS:
        raise LimitExceededError(
            f"File exceeds the {MAX_ROWS}-row limit.", MAX_ROWS, row_count, status_code=422
        )
