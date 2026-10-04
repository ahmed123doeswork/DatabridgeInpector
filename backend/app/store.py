"""In-memory job store with the idempotency + audit-trail contract
(AGENTS.md rules 3, 4, 6). No database, no persistence beyond process
lifetime — see docs/adr/0002-idempotency-contract.md.
"""

from __future__ import annotations

import csv
import hashlib
import io
import re
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from app.csv_injection import is_formula_injection_risk_for_field, neutralize_formula_injection_for_field
from app.limits import check_row_count
from app.normalize import (
    canonicalize_phone_format,
    normalize_email,
    normalize_name_casing,
    normalize_phone,
)
from app.scoring import ScorableRow, find_duplicate_candidates
from app.schemas import (
    ColumnMapping,
    ContactField,
    ExportResult,
    ImportJob,
    JobStatus,
    NormalizationSuggestion,
    ValidationError,
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

CONTACT_FIELD_NAMES = [f.value for f in ContactField]


class JobNotFoundError(Exception):
    pass


class JobNotMappedError(Exception):
    pass


class IdempotencyConflictError(Exception):
    def __init__(self, key: str) -> None:
        super().__init__(f'Idempotency-Key "{key}" was already used with a different file.')
        self.key = key


def row_id_for(index0: int) -> str:
    return f"row-{index0 + 1}"


def parse_csv_text(text: str) -> tuple[list[str], list[list[str]]]:
    reader = csv.reader(io.StringIO(text))
    rows = [row for row in reader if not (len(row) == 1 and row[0] == "")]
    if not rows:
        return [], []
    header, *data_rows = rows
    return header, data_rows


def _empty_mapped_row() -> dict[str, str]:
    return {name: "" for name in CONTACT_FIELD_NAMES}


def _map_raw_row(header: list[str], raw_row: list[str], mapping: ColumnMapping) -> dict[str, str]:
    result = _empty_mapped_row()
    for col_index, source_column in enumerate(header):
        target_field = mapping.columns.get(source_column)
        if target_field is not None:
            result[target_field.value] = raw_row[col_index] if col_index < len(raw_row) else ""
    return result


def _split_full_name(full_name: str) -> tuple[str, str]:
    parts = full_name.strip().split()
    if not parts:
        return "", ""
    return parts[0], " ".join(parts[1:])


def _to_scorable_row(row_id: str, mapped: dict[str, str]) -> ScorableRow:
    if mapped.get("fullName"):
        first_name, last_name = _split_full_name(mapped["fullName"])
    else:
        first_name, last_name = mapped["firstName"], mapped["lastName"]
    return ScorableRow(
        rowId=row_id,
        firstName=first_name,
        lastName=last_name,
        email=mapped["email"],
        phone=mapped["phone"],
        addressLine1=mapped["addressLine1"],
        postalCode=mapped["postalCode"],
    )


def _validate_rows(
    header: list[str], raw_rows: list[list[str]], mapping: ColumnMapping
) -> list[ValidationError]:
    errors: list[ValidationError] = []

    for i, raw_row in enumerate(raw_rows):
        row_id = row_id_for(i)
        mapped = _map_raw_row(header, raw_row, mapping)

        if all(cell.strip() == "" for cell in raw_row):
            errors.append(
                ValidationError(
                    rowId=row_id,
                    field=None,
                    code="empty_row",
                    severity="error",
                    message="Row is empty.",
                    originalValue=None,
                )
            )
            continue

        if not mapped["email"]:
            errors.append(
                ValidationError(
                    rowId=row_id,
                    field=ContactField.email,
                    code="missing_required_field",
                    severity="error",
                    message="Email is required.",
                    originalValue=None,
                )
            )
        elif not _EMAIL_RE.match(mapped["email"]):
            errors.append(
                ValidationError(
                    rowId=row_id,
                    field=ContactField.email,
                    code="invalid_email",
                    severity="error",
                    message=f'"{mapped["email"]}" is not a valid email address.',
                    originalValue=mapped["email"],
                )
            )

        if mapped["phone"] and normalize_phone(mapped["phone"]).ambiguous:
            errors.append(
                ValidationError(
                    rowId=row_id,
                    field=ContactField.phone,
                    code="ambiguous_phone",
                    severity="warning",
                    message=f'"{mapped["phone"]}" has no explicit country code and will not be auto-corrected.',
                    originalValue=mapped["phone"],
                )
            )

        for field_name, value in mapped.items():
            if value and is_formula_injection_risk_for_field(field_name, value):
                errors.append(
                    ValidationError(
                        rowId=row_id,
                        field=ContactField(field_name),
                        code="formula_injection_risk",
                        severity="warning",
                        message=f'"{value}" looks like a spreadsheet formula and will be neutralized on export.',
                        originalValue=value,
                    )
                )

    return errors


def _build_normalization_log(
    header: list[str], raw_rows: list[list[str]], mapping: ColumnMapping
) -> list[NormalizationSuggestion]:
    suggestions: list[NormalizationSuggestion] = []

    for i, raw_row in enumerate(raw_rows):
        row_id = row_id_for(i)
        mapped = _map_raw_row(header, raw_row, mapping)

        if mapped["email"]:
            suggested = normalize_email(mapped["email"])
            if suggested != mapped["email"]:
                suggestions.append(
                    NormalizationSuggestion(
                        rowId=row_id,
                        field=ContactField.email,
                        originalValue=mapped["email"],
                        suggestedValue=suggested,
                        rule="lowercase_trim_email",
                        status="pending",
                    )
                )

        if mapped["phone"] and not normalize_phone(mapped["phone"]).ambiguous:
            suggested = canonicalize_phone_format(mapped["phone"])
            if suggested != mapped["phone"]:
                suggestions.append(
                    NormalizationSuggestion(
                        rowId=row_id,
                        field=ContactField.phone,
                        originalValue=mapped["phone"],
                        suggestedValue=suggested,
                        rule="canonicalize_phone_format",
                        status="pending",
                    )
                )

        for field_name in ("firstName", "lastName", "fullName"):
            value = mapped[field_name]
            if value:
                suggested = normalize_name_casing(value)
                if suggested != value:
                    suggestions.append(
                        NormalizationSuggestion(
                            rowId=row_id,
                            field=ContactField(field_name),
                            originalValue=value,
                            suggestedValue=suggested,
                            rule="normalize_name_casing",
                            status="pending",
                        )
                    )

    return suggestions


@dataclass
class _RawJobData:
    header: list[str]
    raw_rows: list[list[str]]


@dataclass
class _IdempotencyEntry:
    file_hash: str
    job_id: str


@dataclass
class JobStore:
    jobs: dict[str, ImportJob] = field(default_factory=dict)
    raw_data: dict[str, _RawJobData] = field(default_factory=dict)
    idempotency_index: dict[str, _IdempotencyEntry] = field(default_factory=dict)
    # Exposed only for tests asserting a reused Idempotency-Key does not reprocess.
    process_call_count: int = 0

    def reset(self) -> None:
        self.jobs.clear()
        self.raw_data.clear()
        self.idempotency_index.clear()
        self.process_call_count = 0

    def _require_job(self, job_id: str) -> ImportJob:
        job = self.jobs.get(job_id)
        if job is None:
            raise JobNotFoundError(job_id)
        return job

    def _require_raw(self, job_id: str) -> _RawJobData:
        raw = self.raw_data.get(job_id)
        if raw is None:
            raise JobNotFoundError(job_id)
        return raw

    def create_job(self, file_bytes: bytes, idempotency_key: str | None) -> tuple[ImportJob, bool]:
        """Returns (job, was_reused). was_reused=True means the stored result
        was returned unchanged — no reprocessing happened."""
        file_hash = hashlib.sha256(file_bytes).hexdigest()

        if idempotency_key:
            existing = self.idempotency_index.get(idempotency_key)
            if existing is not None:
                if existing.file_hash == file_hash:
                    return self.jobs[existing.job_id], True
                raise IdempotencyConflictError(idempotency_key)

        self.process_call_count += 1
        text = file_bytes.decode("utf-8")
        header, raw_rows = parse_csv_text(text)
        check_row_count(len(raw_rows))

        job_id = str(uuid.uuid4())
        job = ImportJob(
            id=job_id,
            status=JobStatus.uploaded,
            fileHash=file_hash,
            rowCount=len(raw_rows),
            createdAt=datetime.now(UTC).isoformat(),
            mapping=None,
            validationErrors=[],
            duplicates=[],
            normalizationLog=[],
            excludedRowIds=[],
            exportResult=None,
        )

        self.jobs[job_id] = job
        self.raw_data[job_id] = _RawJobData(header=header, raw_rows=raw_rows)
        if idempotency_key:
            self.idempotency_index[idempotency_key] = _IdempotencyEntry(file_hash, job_id)

        return job, False

    def get_source_columns(self, job_id: str) -> list[str]:
        return self._require_raw(job_id).header

    def set_mapping(self, job_id: str, mapping: ColumnMapping) -> ImportJob:
        job = self._require_job(job_id)
        updated = job.model_copy(update={"mapping": mapping, "status": JobStatus.mapped})
        self.jobs[job_id] = updated
        return updated

    def validate(self, job_id: str) -> ImportJob:
        job = self._require_job(job_id)
        raw = self._require_raw(job_id)
        if job.mapping is None:
            raise JobNotMappedError(job_id)

        validation_errors = _validate_rows(raw.header, raw.raw_rows, job.mapping)
        updated = job.model_copy(
            update={"validationErrors": validation_errors, "status": JobStatus.validated}
        )
        self.jobs[job_id] = updated
        return updated

    def get_duplicates(self, job_id: str) -> ImportJob:
        job = self._require_job(job_id)
        raw = self._require_raw(job_id)
        if job.mapping is None:
            raise JobNotMappedError(job_id)

        scorable_rows = [
            _to_scorable_row(row_id_for(i), _map_raw_row(raw.header, raw_row, job.mapping))
            for i, raw_row in enumerate(raw.raw_rows)
        ]
        duplicates = find_duplicate_candidates(scorable_rows)
        normalization_log = _build_normalization_log(raw.header, raw.raw_rows, job.mapping)

        updated = job.model_copy(
            update={
                "duplicates": duplicates,
                "normalizationLog": normalization_log,
                "status": JobStatus.reviewed,
            }
        )
        self.jobs[job_id] = updated
        return updated

    def set_normalization_status(
        self, job_id: str, row_id: str, field_name: str, status: str
    ) -> ImportJob:
        job = self._require_job(job_id)
        updated_log = [
            entry.model_copy(update={"status": status})
            if entry.rowId == row_id and entry.field.value == field_name
            else entry
            for entry in job.normalizationLog
        ]
        updated = job.model_copy(update={"normalizationLog": updated_log})
        self.jobs[job_id] = updated
        return updated

    def set_row_excluded(self, job_id: str, row_id: str, excluded: bool) -> ImportJob:
        job = self._require_job(job_id)
        if excluded:
            excluded_ids = list(dict.fromkeys([*job.excludedRowIds, row_id]))
        else:
            excluded_ids = [rid for rid in job.excludedRowIds if rid != row_id]
        updated = job.model_copy(update={"excludedRowIds": excluded_ids})
        self.jobs[job_id] = updated
        return updated

    def export_job(self, job_id: str) -> ExportResult:
        job = self._require_job(job_id)
        raw = self._require_raw(job_id)
        if job.mapping is None:
            raise JobNotMappedError(job_id)

        output_header = [
            "rowId",
            "firstName",
            "lastName",
            "email",
            "phone",
            "addressLine1",
            "postalCode",
        ]
        output_rows: list[list[str]] = []
        excluded_count = 0

        accepted_by_row_field: dict[tuple[str, str], str] = {
            (entry.rowId, entry.field.value): entry.suggestedValue
            for entry in job.normalizationLog
            if entry.status == "accepted"
        }

        for i, raw_row in enumerate(raw.raw_rows):
            row_id = row_id_for(i)
            if row_id in job.excludedRowIds:
                excluded_count += 1
                continue
            mapped = _map_raw_row(raw.header, raw_row, job.mapping)
            for field_name in CONTACT_FIELD_NAMES:
                override = accepted_by_row_field.get((row_id, field_name))
                if override is not None:
                    mapped[field_name] = override
            output_rows.append(
                [
                    row_id,
                    neutralize_formula_injection_for_field("firstName", mapped["firstName"]),
                    neutralize_formula_injection_for_field("lastName", mapped["lastName"]),
                    neutralize_formula_injection_for_field("email", mapped["email"]),
                    mapped["phone"],
                    neutralize_formula_injection_for_field("addressLine1", mapped["addressLine1"]),
                    neutralize_formula_injection_for_field("postalCode", mapped["postalCode"]),
                ]
            )

        error_header = ["rowId", "field", "code", "severity", "message"]
        error_rows = [
            [e.rowId, e.field.value if e.field else "", e.code, e.severity, e.message]
            for e in job.validationErrors
        ]

        export_result = ExportResult(
            jobId=job_id,
            rowCount=len(output_rows),
            excludedRowCount=excluded_count,
            csvContent=_to_csv(output_header, output_rows),
            errorReportCsvContent=_to_csv(error_header, error_rows),
            exportedAt=datetime.now(UTC).isoformat(),
        )

        updated = job.model_copy(update={"status": JobStatus.exported, "exportResult": export_result})
        self.jobs[job_id] = updated
        return export_result


def _escape_csv_field(raw: str) -> str:
    if any(c in raw for c in (',', '"', '\n')):
        return '"' + raw.replace('"', '""') + '"'
    return raw


def _to_csv(header: list[str], rows: list[list[str]]) -> str:
    lines = [",".join(_escape_csv_field(c) for c in row) for row in [header, *rows]]
    return "\n".join(lines) + "\n"
