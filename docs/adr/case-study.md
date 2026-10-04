# Case study: DatabridgeInspector

## Problem

Contact-list CSVs arriving from exports, CRM dumps, or manual collection are
messy in predictable ways: inconsistent phone formatting, near-duplicate
records from repeated signups, and occasionally hostile content (a pasted
spreadsheet formula, a deliberately malformed row). A cleanup tool that
"just merges duplicates" without showing its reasoning, or that re-processes
a retried upload as a brand-new job, isn't something a data team would
actually plug into a pipeline. The brief was to build the two things an
enterprise reviewer specifically checks for in an import tool — explainable
duplicate detection and an idempotent, auditable import contract — as real,
working features, not slide-deck claims.

## Constraints

- **No database.** All state is in-memory, scoped to the process's
  lifetime. A restart is a clean slate by design.
- **No outbound network calls** anywhere in the backend.
- **2 MB / 2,000-row caps**, enforced server-side with structured errors,
  not just a UI warning.
- **Two runtimes that must agree.** Browser-simulation (TypeScript) ships
  first with no backend dependency; FastAPI (Python) mirrors it exactly once
  Python is available. Both must produce identical scores, identical
  validation findings, and identical CSV output for the same input.
- **No invented data.** An ambiguous phone number (no explicit country code)
  is flagged, never auto-corrected with a guessed country code.

## Tradeoffs

- **Hand-ported logic over a shared runtime.** There's no WASM/shared-
  language layer between the TS and Python implementations of scoring,
  normalization, and CSV-injection handling — each is a faithful manual
  port of the other. The cost is manual-sync risk on every future change;
  the mitigation is a schema-parity test (`test_schema_parity.py`, diffing
  a TS-generated JSON Schema against Pydantic's) plus fixture-driven
  behavioral tests that both suites run against the same files
  (`fixtures/*.csv`, `fixtures/expected/*.json`). A change that breaks
  parity fails a test immediately rather than silently drifting.
- **O(n²) duplicate pairing.** Every row is compared against every other
  row. Fine under the 2,000-row cap (≈2M comparisons, each a handful of
  string operations); would need blocking/bucketing (e.g. by normalized
  email prefix) to scale past that, which is explicitly out of scope here.
- **Field-level exemption over a smarter classifier.** Rather than building
  a context-aware formula-injection detector, the `phone` field is simply
  exempted from the leading-character check (see ADR 0003) — the simplest
  fix that matches how the data actually looks, at the cost of being a
  slightly ad-hoc rule a future contributor needs to know about.
- **Idempotency index never evicts.** Correct for a demo's process
  lifetime; would need a TTL or bounded LRU in anything long-running.

## Limitations

- The browser-simulation and live adapters are two independently-written
  implementations of the same contract; nothing but tests keeps them
  honest. There's no generated client or shared validation layer.
- Rounding can disagree between JS (`Math.round`, round-half-up) and Python
  (`round()`, round-half-to-even) at exact `.5` boundaries — not currently
  hit by any fixture, but a latent one-point scoring discrepancy if a future
  fuzzy-match ratio lands exactly there.
- Name-splitting for a `fullName`-mapped column is naive (first whitespace
  token = first name, rest = last name) — doesn't handle multi-part surnames
  correctly in all cultures.
- No pagination/streaming: the entire file is parsed and held in memory at
  once, which is fine at the 2,000-row cap but wouldn't scale further
  without re-architecting.

## What I'd do with more time

- Generate the Pydantic/TS contract from one source (or at least codegen the
  Pydantic models from the JSON Schema) instead of hand-keeping two files in
  sync.
- Add a blocking/bucketing pass before pairwise scoring so duplicate
  detection scales past the current row cap.
- Replace the naive full-name split with a small heuristic library or an
  explicit "this column is already split" requirement in the mapping step.
