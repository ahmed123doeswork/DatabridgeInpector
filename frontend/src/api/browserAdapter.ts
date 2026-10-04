// In-browser simulation of the full pipeline — no backend. Mirrors
// backend/app/store.py's JobStore + route logic so the UI components work
// unmodified against either adapter (AGENTS.md rule 8).

import { parseCsv, rowIdFor } from "../lib/csvParse";
import { toCsv } from "../lib/csvExport";
import { isFormulaInjectionRiskForField, neutralizeFormulaInjectionForField } from "../lib/csvInjection";
import {
  canonicalizePhoneFormat,
  normalizeEmail,
  normalizeNameCasing,
  normalizePhone,
} from "../lib/normalize";
import { findDuplicateCandidates, type ScorableRow } from "../lib/scoring";
import { sha256Hex } from "../lib/idGen";
import type {
  ColumnMapping,
  ContactField,
  ExportResult,
  ImportJob,
  NormalizationSuggestion,
  ValidationError,
} from "../types/contract";
import type { ApiMode, DatabridgeApi } from "./types";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 2000;

export class LimitExceededError extends Error {
  readonly limit: number;
  readonly actual: number;

  constructor(message: string, limit: number, actual: number) {
    super(message);
    this.name = "LimitExceededError";
    this.limit = limit;
    this.actual = actual;
  }
}

export class IdempotencyConflictError extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Idempotency-Key "${key}" was already used with a different file.`);
    this.name = "IdempotencyConflictError";
    this.key = key;
  }
}

interface RawJobData {
  header: string[];
  rawRows: string[][];
}

function emptyRow(): Record<ContactField, string> {
  return {
    firstName: "",
    lastName: "",
    fullName: "",
    email: "",
    phone: "",
    addressLine1: "",
    postalCode: "",
  };
}

function mapRawRow(header: string[], rawRow: string[], mapping: ColumnMapping): Record<ContactField, string> {
  const result = emptyRow();
  header.forEach((sourceColumn, colIndex) => {
    const field = mapping.columns[sourceColumn];
    if (field) {
      result[field] = rawRow[colIndex] ?? "";
    }
  });
  return result;
}

function toScorableRow(rowId: string, mapped: Record<ContactField, string>): ScorableRow {
  const [firstName, lastName] = mapped.fullName
    ? splitFullName(mapped.fullName)
    : [mapped.firstName, mapped.lastName];
  return {
    rowId,
    firstName,
    lastName,
    email: mapped.email,
    phone: mapped.phone,
    addressLine1: mapped.addressLine1,
    postalCode: mapped.postalCode,
  };
}

function splitFullName(fullName: string): [string, string] {
  const parts = fullName.trim().split(/\s+/);
  return [parts[0] ?? "", parts.slice(1).join(" ")];
}

function validateRows(
  header: string[],
  rawRows: string[][],
  mapping: ColumnMapping
): ValidationError[] {
  const errors: ValidationError[] = [];

  rawRows.forEach((rawRow, i) => {
    const rowId = rowIdFor(i);
    const mapped = mapRawRow(header, rawRow, mapping);

    if (rawRow.every((cell) => cell.trim() === "")) {
      errors.push({
        rowId,
        field: null,
        code: "empty_row",
        severity: "error",
        message: "Row is empty.",
        originalValue: null,
      });
      return;
    }

    if (!mapped.email) {
      errors.push({
        rowId,
        field: "email",
        code: "missing_required_field",
        severity: "error",
        message: "Email is required.",
        originalValue: null,
      });
    } else if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mapped.email)) {
      errors.push({
        rowId,
        field: "email",
        code: "invalid_email",
        severity: "error",
        message: `"${mapped.email}" is not a valid email address.`,
        originalValue: mapped.email,
      });
    }

    if (mapped.phone && normalizePhone(mapped.phone).ambiguous) {
      errors.push({
        rowId,
        field: "phone",
        code: "ambiguous_phone",
        severity: "warning",
        message: `"${mapped.phone}" has no explicit country code and will not be auto-corrected.`,
        originalValue: mapped.phone,
      });
    }

    for (const [field, value] of Object.entries(mapped) as Array<[ContactField, string]>) {
      if (value && isFormulaInjectionRiskForField(field, value)) {
        errors.push({
          rowId,
          field,
          code: "formula_injection_risk",
          severity: "warning",
          message: `"${value}" looks like a spreadsheet formula and will be neutralized on export.`,
          originalValue: value,
        });
      }
    }
  });

  return errors;
}

function buildNormalizationLog(
  header: string[],
  rawRows: string[][],
  mapping: ColumnMapping
): NormalizationSuggestion[] {
  const suggestions: NormalizationSuggestion[] = [];

  rawRows.forEach((rawRow, i) => {
    const rowId = rowIdFor(i);
    const mapped = mapRawRow(header, rawRow, mapping);

    if (mapped.email) {
      const suggested = normalizeEmail(mapped.email);
      if (suggested !== mapped.email) {
        suggestions.push({
          rowId,
          field: "email",
          originalValue: mapped.email,
          suggestedValue: suggested,
          rule: "lowercase_trim_email",
          status: "pending",
        });
      }
    }

    if (mapped.phone && !normalizePhone(mapped.phone).ambiguous) {
      const suggested = canonicalizePhoneFormat(mapped.phone);
      if (suggested !== mapped.phone) {
        suggestions.push({
          rowId,
          field: "phone",
          originalValue: mapped.phone,
          suggestedValue: suggested,
          rule: "canonicalize_phone_format",
          status: "pending",
        });
      }
    }

    for (const field of ["firstName", "lastName", "fullName"] as const) {
      const value = mapped[field];
      if (value) {
        const suggested = normalizeNameCasing(value);
        if (suggested !== value) {
          suggestions.push({
            rowId,
            field,
            originalValue: value,
            suggestedValue: suggested,
            rule: "normalize_name_casing",
            status: "pending",
          });
        }
      }
    }
  });

  return suggestions;
}

export class BrowserAdapter implements DatabridgeApi {
  readonly mode: ApiMode = "simulation";

  private jobs = new Map<string, ImportJob>();
  private rawData = new Map<string, RawJobData>();
  private idempotencyIndex = new Map<string, { fileHash: string; jobId: string }>();

  reset(): void {
    this.jobs.clear();
    this.rawData.clear();
    this.idempotencyIndex.clear();
  }

  async createJob(file: File, idempotencyKey: string): Promise<ImportJob> {
    if (file.size > MAX_FILE_BYTES) {
      throw new LimitExceededError("File exceeds the 2 MB size limit.", MAX_FILE_BYTES, file.size);
    }

    const buffer = await file.arrayBuffer();
    const fileHash = await sha256Hex(buffer);

    const existing = this.idempotencyIndex.get(idempotencyKey);
    if (existing) {
      if (existing.fileHash === fileHash) {
        return this.jobs.get(existing.jobId)!;
      }
      throw new IdempotencyConflictError(idempotencyKey);
    }

    const text = new TextDecoder("utf-8").decode(buffer);
    const { header, rows } = parseCsv(text);

    if (rows.length > MAX_ROWS) {
      throw new LimitExceededError(`File exceeds the ${MAX_ROWS}-row limit.`, MAX_ROWS, rows.length);
    }

    const jobId = crypto.randomUUID();
    const job: ImportJob = {
      id: jobId,
      status: "uploaded",
      fileHash,
      rowCount: rows.length,
      createdAt: new Date().toISOString(),
      mapping: null,
      validationErrors: [],
      duplicates: [],
      normalizationLog: [],
      excludedRowIds: [],
      exportResult: null,
    };

    this.jobs.set(jobId, job);
    this.rawData.set(jobId, { header, rawRows: rows });
    this.idempotencyIndex.set(idempotencyKey, { fileHash, jobId });

    return job;
  }

  async getSourceColumns(jobId: string): Promise<string[]> {
    return this.requireRaw(jobId).header;
  }

  async setMapping(jobId: string, mapping: ColumnMapping): Promise<ImportJob> {
    const job = this.requireJob(jobId);
    const updated: ImportJob = { ...job, mapping, status: "mapped" };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async validate(jobId: string): Promise<ImportJob> {
    const job = this.requireJob(jobId);
    const raw = this.requireRaw(jobId);
    if (!job.mapping) throw new Error("Job has no column mapping yet.");

    const validationErrors = validateRows(raw.header, raw.rawRows, job.mapping);
    const updated: ImportJob = { ...job, validationErrors, status: "validated" };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async getDuplicates(jobId: string): Promise<ImportJob> {
    const job = this.requireJob(jobId);
    const raw = this.requireRaw(jobId);
    if (!job.mapping) throw new Error("Job has no column mapping yet.");

    const scorableRows = raw.rawRows.map((rawRow, i) =>
      toScorableRow(rowIdFor(i), mapRawRow(raw.header, rawRow, job.mapping!))
    );
    const duplicates = findDuplicateCandidates(scorableRows);
    const normalizationLog = buildNormalizationLog(raw.header, raw.rawRows, job.mapping);

    const updated: ImportJob = { ...job, duplicates, normalizationLog, status: "reviewed" };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async setNormalizationStatus(
    jobId: string,
    rowId: string,
    field: string,
    status: "accepted" | "rejected"
  ): Promise<ImportJob> {
    const job = this.requireJob(jobId);
    const normalizationLog = job.normalizationLog.map((entry) =>
      entry.rowId === rowId && entry.field === field ? { ...entry, status } : entry
    );
    const updated: ImportJob = { ...job, normalizationLog };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async setRowExcluded(jobId: string, rowId: string, excluded: boolean): Promise<ImportJob> {
    const job = this.requireJob(jobId);
    const excludedRowIds = excluded
      ? [...new Set([...job.excludedRowIds, rowId])]
      : job.excludedRowIds.filter((id) => id !== rowId);
    const updated: ImportJob = { ...job, excludedRowIds };
    this.jobs.set(jobId, updated);
    return updated;
  }

  async exportJob(jobId: string): Promise<ExportResult> {
    const job = this.requireJob(jobId);
    const raw = this.requireRaw(jobId);
    if (!job.mapping) throw new Error("Job has no column mapping yet.");

    const outputHeader = ["rowId", "firstName", "lastName", "email", "phone", "addressLine1", "postalCode"];
    const outputRows: string[][] = [];
    let excludedCount = 0;

    raw.rawRows.forEach((rawRow, i) => {
      const rowId = rowIdFor(i);
      if (job.excludedRowIds.includes(rowId)) {
        excludedCount += 1;
        return;
      }
      const mapped = mapRawRow(raw.header, rawRow, job.mapping!);
      for (const entry of job.normalizationLog) {
        if (entry.rowId === rowId && entry.status === "accepted") {
          mapped[entry.field] = entry.suggestedValue;
        }
      }
      outputRows.push([
        rowId,
        neutralizeFormulaInjectionForField("firstName", mapped.firstName),
        neutralizeFormulaInjectionForField("lastName", mapped.lastName),
        neutralizeFormulaInjectionForField("email", mapped.email),
        mapped.phone,
        neutralizeFormulaInjectionForField("addressLine1", mapped.addressLine1),
        neutralizeFormulaInjectionForField("postalCode", mapped.postalCode),
      ]);
    });

    const errorHeader = ["rowId", "field", "code", "severity", "message"];
    const errorRows = job.validationErrors.map((e) => [
      e.rowId,
      e.field ?? "",
      e.code,
      e.severity,
      e.message,
    ]);

    const exportResult: ExportResult = {
      jobId,
      rowCount: outputRows.length,
      excludedRowCount: excludedCount,
      csvContent: toCsv(outputHeader, outputRows),
      errorReportCsvContent: toCsv(errorHeader, errorRows),
      exportedAt: new Date().toISOString(),
    };

    const updated: ImportJob = { ...job, status: "exported", exportResult };
    this.jobs.set(jobId, updated);
    return exportResult;
  }

  private requireJob(jobId: string): ImportJob {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error(`Unknown job id "${jobId}".`);
    return job;
  }

  private requireRaw(jobId: string): RawJobData {
    const raw = this.rawData.get(jobId);
    if (!raw) throw new Error(`No raw data for job id "${jobId}".`);
    return raw;
  }
}
