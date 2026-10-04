# DatabridgeInspector

A synthetic contact-list cleanup tool: upload a CSV, map columns, validate,
detect duplicates with explainable confidence scoring, preview normalization,
review, and export a cleaned CSV + error report.

Two things this demo takes seriously (see `AGENTS.md` for the full contract):

1. **Explainable, deterministic duplicate detection** — every duplicate pair
   gets a score built from named, weighted signals and a human-readable
   reason string, not a black-box match.
2. **Idempotent import + full audit trail** — re-submitting the same file
   under the same `Idempotency-Key` returns the same result; every
   normalization decision is logged against the original value and can be
   accepted/rejected per row before export.

Ships in two modes:

- **Browser simulation** (default) — the entire pipeline runs client-side,
  no backend required.
- **Live mode** — a FastAPI backend does the same work over HTTP.

## Prerequisites

- Node.js + npm
- Python 3.11+ (only needed for live mode / backend tests)

## Run — browser simulation (no backend)

```sh
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The banner confirms you're in "Browser
simulation — no backend" mode.

## Run — live mode (FastAPI backend)

Terminal 1 — backend:

```sh
cd backend
python -m venv .venv
source .venv/Scripts/activate   # Windows Git Bash; use .venv/bin/activate on macOS/Linux
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Terminal 2 — frontend, pointed at the live backend:

```sh
cd frontend
npm install
VITE_API_MODE=live npm run dev
```

If the backend is unreachable, the UI shows an explicit error banner with a
retry action — it never silently falls back to simulated data while still
labeled "live" (see `AGENTS.md` rule 8).

## Tests

```sh
# Backend (pytest) — from backend/, with the venv active
python -m pytest tests/ -v

# Frontend unit tests (Vitest) — from frontend/
npm test

# End-to-end (Playwright) — from frontend/, requires the port-5173 dev
# server reachable (Playwright's webServer config starts it automatically
# if not already running) and no process bound to port 8000/5174
npx playwright test
```

## Regenerating the shared contract schema

If you change `frontend/src/types/contract.ts`, regenerate
`shared/contract.schema.json` and re-run the backend's parity test:

```sh
cd frontend
npm run gen:schema
cd ../backend
python -m pytest tests/test_schema_parity.py -v
```

## Fixtures

`fixtures/*.csv` are the single source of truth for both test suites:

- `clean.csv` — fully valid data, zero validation findings.
- `ambiguous_phones.csv` — phones with no explicit country code; must be
  flagged, never auto-corrected with a guessed country code.
- `duplicates.csv` — exact, fuzzy, and below-threshold duplicate pairs with
  hand-computed expected scores in `fixtures/expected/duplicates.expected.json`.
- `formula_injection.csv` — CSV formula-injection payloads (`=`, `+`, `-`,
  `@` leading characters) across several columns.
- `oversized_generator.py` — generates an oversized file on demand for
  limit testing: `python fixtures/oversized_generator.py --rows 2500 > big.csv`.

## Docs

- `docs/adr/` — architecture decision records for the scoring engine,
  idempotency contract, CSV-injection handling, and the frontend adapter
  pattern.
- `docs/adr/case-study.md` — problem, constraints, tradeoffs, limitations.
