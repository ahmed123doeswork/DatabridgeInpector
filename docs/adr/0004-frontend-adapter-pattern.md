# ADR 0004 — Frontend adapter pattern (browser-sim vs. live, no silent fallback)

## Status

Accepted.

## Context

The project ships in two modes — a zero-setup browser simulation and a
FastAPI-backed live mode — and the UI components need to work identically
against either. The risk with any dual-mode system is silent mode-blending:
a live call fails and the app quietly serves simulated data while still
displaying itself as "live," which is actively misleading in a demo whose
whole point is to show real engineering judgment.

## Decision

A single `DatabridgeApi` interface (`frontend/src/api/types.ts`) is
implemented twice: `BrowserAdapter` (the full pipeline running in-memory in
the browser) and `LiveAdapter` (thin `fetch()` wrapper over the FastAPI
endpoints). `getApi()` resolves the mode once, explicitly, from
`VITE_API_MODE` (build/dev-time env var, default `"simulation"`) — there is
no runtime auto-detection or probing.

`LiveAdapter` never catches-and-falls-back: any failed request throws
`LiveApiError`, which propagates to the calling component. Every step
component distinguishes `LiveApiError` (routed to a shared `liveError` banner
state, rendered by `ModeBanner`) from other errors (routed to a local,
step-scoped error). The banner in live mode always says "Live mode — talking
to the FastAPI backend" or shows the explicit failure — it never silently
reverts to showing simulated data.

## Consequences

- **Two adapters to keep in sync.** `BrowserAdapter` and `LiveAdapter`
  implement the same interface, but there's no compiler-enforced guarantee
  their *behavior* matches beyond what the fixture-backed tests cover.
- **Mode is a build-time choice.** Switching modes requires restarting the
  dev server with a different `VITE_API_MODE` — there's no in-app toggle.
  This is deliberate: an in-app toggle would reintroduce the risk of
  ambiguous "which mode produced this data" states.
- **Verified by `live-mode-failure-fallback.spec.ts`.** This Playwright
  spec starts a second dev server instance in live mode with no backend
  running and asserts the UI shows an explicit error and never reaches the
  next wizard step — the behavioral guarantee this ADR exists to make.
