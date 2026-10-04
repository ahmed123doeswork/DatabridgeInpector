import type {
  ColumnMapping,
  ExportResult,
  ImportJob,
} from "../types/contract";

export type ApiMode = "simulation" | "live";

export class LiveApiError extends Error {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LiveApiError";
    this.cause = cause;
  }
}

/**
 * The single interface both adapters implement. AGENTS.md rule 8: the UI
 * must pick an adapter explicitly and never silently swap between them —
 * a liveAdapter call that fails throws LiveApiError, it does not fall back
 * to browserAdapter's simulated data.
 */
export interface DatabridgeApi {
  readonly mode: ApiMode;
  createJob(file: File, idempotencyKey: string): Promise<ImportJob>;
  /** The uploaded file's raw CSV header, for the column-mapping UI to offer choices against. */
  getSourceColumns(jobId: string): Promise<string[]>;
  setMapping(jobId: string, mapping: ColumnMapping): Promise<ImportJob>;
  validate(jobId: string): Promise<ImportJob>;
  getDuplicates(jobId: string): Promise<ImportJob>;
  setNormalizationStatus(
    jobId: string,
    rowId: string,
    field: string,
    status: "accepted" | "rejected"
  ): Promise<ImportJob>;
  setRowExcluded(jobId: string, rowId: string, excluded: boolean): Promise<ImportJob>;
  exportJob(jobId: string): Promise<ExportResult>;
}
