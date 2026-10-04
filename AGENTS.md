# AGENTS.md — DatabridgeInspector Engineering Contract

Binding rules for anyone (human or agent) changing this codebase. If a change
conflicts with a rule below, the rule wins — raise it instead of overriding it.

## 1. No invented data

Never guess a value the input doesn't support. Ambiguous phone numbers (no
detectable/explicit country code) are flagged with a validation warning and
left as-is — never assigned a default or guessed country code. Any rule that
fills in a value must be traceable to an explicit signal in the row.

## 2. Deterministic, explainable scoring

Duplicate-detection scoring (`frontend/src/lib/scoring.ts` and
`backend/app/scoring.py`) must be pure functions of the two input rows: no
randomness, no wall-clock, no network, no locale-dependent string comparison.
Same pair of rows → same score and same reasons, every time, on both sides of
the stack. Every score must carry a human-readable `reasons[]` list naming
each contributing signal — a bare number is a bug.

## 3. Idempotency

`POST /jobs` requires an `Idempotency-Key` header. `(key, file-hash)` is the
dedup key:

- Same key + same file (hash match) → return the stored result unchanged, do
  not reprocess.
- Same key + different file (hash mismatch) → 409 Conflict. Never silently
  overwrite a prior result under a reused key.
- No key → treated as a one-off, always processed (no dedup contract
  offered).

## 4. Audit trail, never silent mutation

Every normalization suggestion is logged against the row's original value:
field, original, suggested, rule, status (pending/accepted/rejected). A
rejected suggestion must not appear in the exported CSV's changed value.
Row-level rejection excludes the row from export entirely. The UI must let a
reviewer see this trail before export, not just a final diffed value.

## 5. CSV-injection handling (OWASP)

Any cell whose first character is `=`, `+`, `-`, or `@` is treated as a
formula-injection risk: flagged during validation, and on export, neutralized
by prefixing the raw value with a single quote (`'`) before writing — applied
identically in the browser export path and the backend export path. Never
strip/alter the value otherwise; the point is neutralization, not silent data
loss.

**Exception:** the `phone` field is exempt from this check. A leading `+` in
a phone number is a legitimate E.164 country code (e.g. `+1 415-555-0101`),
not a formula-injection attempt — flagging/neutralizing it would flood every
international phone number with false positives and corrupt the exported
data. This is implemented via `isFormulaInjectionRiskForField` /
`is_formula_injection_risk_for_field`, not by changing the generic
field-agnostic check.

## 6. In-memory only, process-lifetime

No database, no file persistence beyond the process's in-memory job dict, no
outbound network calls anywhere in `backend/`. Job data must be safely
discardable at any point (process restart = clean slate). This is a design
choice, not a shortcut to be "fixed" later.

## 7. Server-side limits are enforced, not advisory

2 MB file size / 2,000 row limits are enforced in `backend/app/limits.py`
before any parsing. A breach returns 413 (size) or 422 (rows) with a
structured JSON body (`{error, limit, actual}`), never a stack trace or 500.

## 8. No silent fallback in live mode

The frontend adapter (`frontend/src/api/`) exposes exactly one interface
(`DatabridgeApi`) with two implementations: `browserAdapter` (simulation) and
`liveAdapter` (FastAPI). Mode is selected explicitly (`VITE_API_MODE` env
var), never auto-detected-then-silently-swapped. If `liveAdapter` fails a
call, the UI must show an explicit error/fallback action (e.g. "Live request
failed — retry" banner); it must never silently re-route to `browserAdapter`
while still displaying itself as live. Mislabeling simulated data as live is
treated as a correctness bug, not a UX nit.

## 9. Fixture parity

`fixtures/*.csv` are the single source of truth for both test suites — do not
fork or duplicate them per-language. Any change to the shared TS contract
types (`frontend/src/types/contract.ts`) that affects field shape requires
regenerating `shared/contract.schema.json` and re-running
`backend/tests/test_schema_parity.py` before merging.

## 10. Case study is a deliverable, not optional

`docs/adr/case-study.md` (problem / constraints / tradeoffs / limitations)
must be kept current — it is part of the definition of done for Phase D, same
as passing tests.
