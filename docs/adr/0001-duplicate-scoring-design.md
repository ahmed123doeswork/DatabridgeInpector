# ADR 0001 — Deterministic, explainable duplicate-detection scoring

## Status

Accepted.

## Context

A contact-cleanup tool that silently merges or flags "duplicates" using an
opaque similarity model is not trustworthy for a reviewer to act on. We need
every duplicate decision to be inspectable: what signals fired, how much
each contributed, and why. We also need the same input to always produce
the same output, on both the browser-simulation (TypeScript) and live
(Python/FastAPI) code paths, so a reviewer never sees two different answers
for the same data depending on which mode they're in.

## Decision

Score every row pair with a fixed, ordered list of pure signal functions:

| Signal | Weight | Trigger |
|---|---|---|
| `email_exact` | 40 | normalized emails equal |
| `email_local_part_match` | 15 | only if `email_exact` didn't fire; local-part (before `@`) equal |
| `phone_normalized_exact` | 30 | neither phone ambiguous; normalized digits equal |
| `phone_last7_match` | 15 | only if `phone_normalized_exact` didn't fire; neither ambiguous; last 7 digits equal |
| `name_exact` | 20 | normalized full name equal |
| `name_fuzzy` | up to 15 | only if `name_exact` didn't fire; Levenshtein ratio ≥ 0.82 |
| `address_fuzzy` | up to 10 | Levenshtein ratio (street+postal) ≥ 0.82 |

Signals are summed, capped at 100, and mapped to a confidence band:
`≥85` high confidence, `60–84` likely, `35–59` possible, `<35` pruned
(never surfaced — this bounds output size and keeps weak coincidences out of
the reviewer's queue). The `reasonSummary` string is built by sorting
triggered signals by descending points (ties broken by evaluation order) and
joining `"{reason} (+{points})"`.

`frontend/src/lib/scoring.ts` and `backend/app/scoring.py` are hand-kept in
lockstep — same order, same weights, same rounding — and both are checked
against the same hand-computed fixture
(`fixtures/duplicates.csv` / `fixtures/expected/duplicates.expected.json`)
so drift between the two implementations fails a test immediately.

## Consequences

- **No ML, no opacity.** Every score is an auditable sum of named,
  independently-testable functions.
- **O(n²) pairing.** Every pair of rows is scored; acceptable given the
  2,000-row cap, but would need bucketing/blocking at larger scale — noted
  as a known limitation in `docs/adr/case-study.md`.
- **Two hand-maintained implementations.** There is no shared runtime
  between TS and Python, so a future change must be ported manually to
  both files. The fixture-based cross-language test is the guardrail against
  silent drift, not a build-time code-sharing mechanism.
- **Rounding.** JS `Math.round` and Python `round()` disagree on exact `.5`
  boundaries (round-half-up vs. round-half-to-even). None of the current
  fixtures hit that boundary, but a future fuzzy-match ratio that lands
  exactly on `.5` could produce a one-point difference between the two
  implementations. Worth a shared rounding helper if this matters later.
