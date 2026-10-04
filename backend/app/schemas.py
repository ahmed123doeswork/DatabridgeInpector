"""Pydantic models mirroring frontend/src/types/contract.ts field-for-field.

backend/tests/test_schema_parity.py diffs these against
shared/contract.schema.json (generated from the TS file) so the two sides
cannot silently drift. See AGENTS.md rule 9.
"""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class JobStatus(str, Enum):
    uploaded = "uploaded"
    mapped = "mapped"
    validated = "validated"
    reviewed = "reviewed"
    exported = "exported"


class ContactField(str, Enum):
    firstName = "firstName"
    lastName = "lastName"
    fullName = "fullName"
    email = "email"
    phone = "phone"
    addressLine1 = "addressLine1"
    postalCode = "postalCode"


class ColumnMapping(_Strict):
    columns: dict[str, ContactField]


ValidationSeverity = Literal["error", "warning"]

ValidationErrorCode = Literal[
    "missing_required_field",
    "invalid_email",
    "ambiguous_phone",
    "formula_injection_risk",
    "empty_row",
]


class ValidationError(_Strict):
    rowId: str
    field: ContactField | None
    code: ValidationErrorCode
    severity: ValidationSeverity
    message: str
    originalValue: str | None


class ScoreSignal(_Strict):
    signal: str
    points: float
    reason: str


class ConfidenceBand(str, Enum):
    high_confidence_duplicate = "high_confidence_duplicate"
    likely_duplicate = "likely_duplicate"
    possible_duplicate = "possible_duplicate"


class DuplicateCandidate(_Strict):
    rowIdA: str
    rowIdB: str
    score: float
    confidenceBand: ConfidenceBand
    signals: list[ScoreSignal]
    reasonSummary: str


NormalizationStatus = Literal["pending", "accepted", "rejected"]


class NormalizationSuggestion(_Strict):
    rowId: str
    field: ContactField
    originalValue: str
    suggestedValue: str
    rule: str
    status: NormalizationStatus


class ExportResult(_Strict):
    jobId: str
    rowCount: int
    excludedRowCount: int
    csvContent: str
    errorReportCsvContent: str
    exportedAt: str


class ImportJob(_Strict):
    id: str
    status: JobStatus
    fileHash: str
    rowCount: int
    createdAt: str
    mapping: ColumnMapping | None
    validationErrors: list[ValidationError]
    duplicates: list[DuplicateCandidate]
    normalizationLog: list[NormalizationSuggestion]
    excludedRowIds: list[str]
    exportResult: ExportResult | None
