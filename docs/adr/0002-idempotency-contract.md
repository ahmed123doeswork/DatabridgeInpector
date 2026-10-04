# ADR 0002 — Idempotent import contract + audit trail

## Status

Accepted.

## Context

CSV imports get retried — a flaky connection, a double-click, a client
retry policy. Without an idempotency contract, a retry either reprocesses
the file (wasting work, and risking a different result if scoring weights
ever change mid-session) or silently creates a duplicate job the reviewer
doesn't know about. We also need every normalization decision to be
traceable after the fact — a reviewer must be able to see what changed from
the original value and why, and undo individual field changes before
export, without a database.

## Decision

`POST /jobs` accepts an optional `Idempotency-Key` header. The in-memory
`JobStore` keys on `(idempotency_key, sha256(file_bytes))`:

- **New key** → process the file, store the result, return `201`.
- **Same key, same file hash** → return the stored result unchanged, `200`.
  No reprocessing — verified in tests via a call-count spy
  (`job_store.process_call_count`).
- **Same key, different file hash** → `409 Conflict` with
  `{"error": "idempotency_key_reused_with_different_payload", "key": ...}`.
  The original stored job is never touched.
- **No key** → always a fresh job; this is a documented non-dedup path, not
  an oversight.

Every `ImportJob` carries an append-only `normalizationLog`: each entry
records `rowId`, `field`, `originalValue`, `suggestedValue`, `rule`, and
`status` (`pending` / `accepted` / `rejected`). Export re-applies only
`accepted` suggestions; rejected ones leave the original value in the
exported CSV. `excludedRowIds` lets a reviewer drop a row entirely from
export without deleting any underlying data — the job's full history stays
inspectable for as long as the process is alive.

## Consequences

- **No database needed.** A `dict[str, ImportJob]` plus an idempotency index
  is sufficient for the in-memory, process-lifetime scope this project
  commits to (AGENTS.md rule 6).
- **History doesn't survive a restart.** This is a deliberate scope
  boundary, not a bug — see the case study for the tradeoff.
- **The idempotency index never shrinks.** In a long-running process this
  is an unbounded-growth risk; acceptable for a demo, called out as a known
  limitation.
