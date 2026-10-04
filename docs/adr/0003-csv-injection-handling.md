# ADR 0003 — CSV formula-injection handling (and the phone exception)

## Status

Accepted.

## Context

A CSV cell whose first character is `=`, `+`, `-`, or `@` can be interpreted
as a formula by Excel/Sheets/LibreOffice when the file is opened
(`=HYPERLINK(...)`, `=IMPORTXML(...)`, etc. — OWASP's CSV-injection
guidance). A contact-cleanup tool that exports attacker-controlled input
verbatim is a vector for this.

Early manual testing (uploading `fixtures/clean.csv` through the live
backend) surfaced a real conflict: every row's phone number starts with `+`
(an E.164 country code, e.g. `+1 415-555-0101`), so the naive field-agnostic
check flagged *every* international phone number as a formula-injection
risk and the export path prefixed every phone with a stray `'`, corrupting
the data. A tool that cries wolf on every phone number buries the real
signal and actively damages the thing it's supposed to clean up.

## Decision

Keep the generic check (`isFormulaInjectionRisk` / `is_formula_injection_risk`)
field-agnostic and unit-tested as-is. Layer a field-aware wrapper
(`isFormulaInjectionRiskForField` / `is_formula_injection_risk_for_field`,
and the matching `neutralize*ForField` pair) that exempts exactly one field:
`phone`. Every other field (name, email, address, postal code) is still
flagged and neutralized. Validation uses the field-aware check; so does the
export path — the generic `toCsv` serializer now does *only* CSV escaping
(quotes/commas/newlines), and injection neutralization is applied explicitly
per-field by the caller before rows are built, so the phone column is never
touched.

## Consequences

- **One documented exception, not a general carve-out.** The exemption is
  scoped to the `phone` field by name, in both languages, with the same
  rationale in `AGENTS.md` rule 5 — it is not "trust any `+`-leading value."
- **A phone number that happens to start with `-` or `@` is still exempt.**
  This is intentional (phone fields are structurally different from free
  text), but worth knowing if the mapping is ever pointed at a field that
  isn't actually a phone number.
- **Caught by manual smoke-testing, not a unit test.** The unit tests for
  `scoring.ts`/`normalize.ts` never exercised the validation+export path
  end-to-end against a realistic file; only running the full pipeline
  against `fixtures/clean.csv` surfaced it. `test_formula_injection.py`'s
  `test_phone_field_is_never_neutralized_even_with_leading_plus` now guards
  this regression directly.
