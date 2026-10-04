// Shared contract types. Pydantic models in backend/app/schemas.py must
// mirror these field-for-field; shared/contract.schema.json (generated from
// this file) is the parity anchor checked by
// backend/tests/test_schema_parity.py. See AGENTS.md rule 9.

export type JobStatus =
  | "uploaded"
  | "mapped"
  | "validated"
  | "reviewed"
  | "exported";

export type ContactField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "addressLine1"
  | "postalCode";

/** Maps a source CSV column header to a known contact field. */
export interface ColumnMapping {
  /** sourceColumn -> target contact field. Unmapped source columns are dropped. */
  columns: Record<string, ContactField>;
}

export type ValidationSeverity = "error" | "warning";

export type ValidationErrorCode =
  | "missing_required_field"
  | "invalid_email"
  | "ambiguous_phone"
  | "formula_injection_risk"
  | "empty_row";

export interface ValidationError {
  rowId: string;
  field: ContactField | null;
  code: ValidationErrorCode;
  severity: ValidationSeverity;
  message: string;
  /** The raw, unmodified cell value that triggered this finding. */
  originalValue: string | null;
}

/** One named, weighted contribution to a duplicate-pair score. */
export interface ScoreSignal {
  signal: string;
  points: number;
  reason: string;
}

export type ConfidenceBand =
  | "high_confidence_duplicate"
  | "likely_duplicate"
  | "possible_duplicate";

export interface DuplicateCandidate {
  rowIdA: string;
  rowIdB: string;
  score: number;
  confidenceBand: ConfidenceBand;
  signals: ScoreSignal[];
  /** Human-readable, assembled from signals, sorted by descending contribution. */
  reasonSummary: string;
}

export type NormalizationStatus = "pending" | "accepted" | "rejected";

export interface NormalizationSuggestion {
  rowId: string;
  field: ContactField;
  originalValue: string;
  suggestedValue: string;
  rule: string;
  status: NormalizationStatus;
}

export interface ExportResult {
  jobId: string;
  rowCount: number;
  excludedRowCount: number;
  csvContent: string;
  errorReportCsvContent: string;
  exportedAt: string;
}

export interface ImportJob {
  id: string;
  status: JobStatus;
  fileHash: string;
  rowCount: number;
  createdAt: string;
  mapping: ColumnMapping | null;
  validationErrors: ValidationError[];
  duplicates: DuplicateCandidate[];
  normalizationLog: NormalizationSuggestion[];
  excludedRowIds: string[];
  exportResult: ExportResult | null;
}
