# DatabridgeInspector — Plan

A synthetic contact-list cleanup tool: upload CSV, map columns, validate, detect
duplicates with explainable reasoning, preview normalization, review, export a
cleaned CSV + error report. Portfolio-grade demo of two enterprise patterns:
deterministic explainable duplicate scoring, and an idempotent import contract
with a full audit/undo trail. Browser-simulation mode ships first; FastAPI
live mode follows (Python now installed).

## §A — Scope

**In scope**
- CSV upload → column mapping → validation → duplicate review → normalization
  preview → export, in both browser-simulation and FastAPI live mode.
- Deterministic, explainable duplicate scoring (named signals, weights, reason
  strings) — see `docs/adr/0001-duplicate-scoring-design.md`.
- Idempotent job submission keyed on (Idempotency-Key, file hash) + full
  per-field normalization audit trail with per-row accept/reject — see
  `docs/adr/0002-idempotency-contract.md`.
- CSV-injection neutralization on export (OWASP leading-char guidance) — see
  `docs/adr/0003-csv-injection-handling.md`.
- In-memory-only state (no DB), process-lifetime job dict, bounded demo state.
- Typed frontend adapter: simulation vs live, no silent fallback — see
  `docs/adr/0004-frontend-adapter-pattern.md`.
- Server-side row/size limits (2 MB / 2,000 rows), structured 413/422 on breach.

**Out of scope**
- Persistence beyond process lifetime, real PII, outbound network calls, auth/
  multi-tenancy, ML-based matching, any invented/guessed data (e.g. country
  codes for ambiguous phones).

## §B — Acceptance criteria

1. **Explainable duplicate detection**
   - AC1: For any duplicate pair, the system returns a numeric score (0–100),
     a confidence band, and a non-empty list of named reason strings.
   - AC2: Given the same two input rows, the score and reasons are identical
     across repeated runs, across TS and Python implementations, and before/
     after process restart (no hidden randomness, no wall-clock/locale
     dependence).
   - AC3: Each reason string names the signal and its contribution in plain
     language (e.g. "email exact match (+40)"), not just the final number.

2. **Idempotent import + audit trail**
   - AC4: POST /jobs with the same `Idempotency-Key` header and same file
     bytes returns the *same* job id and result, and does not re-run
     validation/scoring (verified via a counter/spy in tests).
   - AC5: POST /jobs with a reused `Idempotency-Key` but a *different* file
     (different content hash) returns a 409 Conflict, never a silent
     overwrite.
   - AC6: Every normalization suggestion records: field, original value,
     suggested value, rule applied, and accepted/rejected/pending status.
     Rejecting a row's suggestion excludes that field's change from export
     while preserving the row itself unless the row is excluded outright.

3. **Safety limits**
   - AC7: A file >2 MB or >2,000 rows is rejected with 413 (size) or 422
     (rows) and a structured JSON error body (`{error, limit, actual}`),
     never a 500.
   - AC8: A formula-injection cell (`=...`, `+...`, `-...`, `@...` leading
     char) is detected, flagged in the validation report, and neutralized on
     export by prefixing with `'`. Ambiguous phone numbers are flagged, never
     assigned a guessed country code.

4. **No-silent-fallback**
   - AC9: If live mode's API call fails, the UI shows an explicit error state
     with a retry/fallback action; it never silently serves simulated/fixture
     data while still labeled "live."

## Phases

1. **Phase A — Contracts & fixtures** (~2–3h) — Shared TS types, fixtures
   (clean / ambiguous-phones / duplicates / formula-injection / oversized
   generator), JSON-schema parity mechanism.
2. **Phase B — Browser simulation** (~1 day) — Full client-side pipeline:
   upload → mapping → validate → duplicate review → normalization preview →
   export. Reset Demo control. "Browser simulation" banner.
3. **Phase C — FastAPI live backend** (~1 day) — 5 endpoints, Pydantic
   schemas mirroring contracts, in-memory JobStore with idempotency, size/row
   limits, typed live adapter wired into the frontend.
4. **Phase D — Tests & evidence pack** (~1 day) — Pytest (5 required cases),
   Playwright (3 required journeys), README run commands, case-study doc +
   ADRs.

Each phase ends with passing tests before moving to the next.

## Status

- [x] Phase A — Contracts & fixtures
- [x] Phase B — Browser simulation
- [x] Phase C — FastAPI live backend
- [x] Phase D — Tests & evidence pack
