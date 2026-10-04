// Live FastAPI backend adapter. Any failed call throws LiveApiError — it
// never falls back to simulated data (AGENTS.md rule 8). The UI is
// responsible for showing an explicit error/retry action on catch.

import type { ColumnMapping, ExportResult, ImportJob } from "../types/contract";
import type { ApiMode, DatabridgeApi } from "./types";
import { LiveApiError } from "./types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, init);
  } catch (err) {
    throw new LiveApiError(`Network error calling ${path}.`, err);
  }

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text().catch(() => undefined);
    }
    throw new LiveApiError(`Request to ${path} failed with status ${response.status}.`, body);
  }

  return (await response.json()) as T;
}

export class LiveAdapter implements DatabridgeApi {
  readonly mode: ApiMode = "live";

  async createJob(file: File, idempotencyKey: string): Promise<ImportJob> {
    const formData = new FormData();
    formData.append("file", file);
    return request<ImportJob>("/jobs", {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: formData,
    });
  }

  async getSourceColumns(jobId: string): Promise<string[]> {
    return request<string[]>(`/jobs/${jobId}/source-columns`, { method: "GET" });
  }

  async setMapping(jobId: string, mapping: ColumnMapping): Promise<ImportJob> {
    return request<ImportJob>(`/jobs/${jobId}/mapping`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mapping),
    });
  }

  async validate(jobId: string): Promise<ImportJob> {
    return request<ImportJob>(`/jobs/${jobId}/validate`, { method: "POST" });
  }

  async getDuplicates(jobId: string): Promise<ImportJob> {
    return request<ImportJob>(`/jobs/${jobId}/duplicates`, { method: "GET" });
  }

  async setNormalizationStatus(
    jobId: string,
    rowId: string,
    field: string,
    status: "accepted" | "rejected"
  ): Promise<ImportJob> {
    return request<ImportJob>(`/jobs/${jobId}/normalization`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId, field, status }),
    });
  }

  async setRowExcluded(jobId: string, rowId: string, excluded: boolean): Promise<ImportJob> {
    return request<ImportJob>(`/jobs/${jobId}/exclude-row`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rowId, excluded }),
    });
  }

  async exportJob(jobId: string): Promise<ExportResult> {
    return request<ExportResult>(`/jobs/${jobId}/export`, { method: "POST" });
  }
}
