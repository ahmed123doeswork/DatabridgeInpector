// Explicit mode selection — AGENTS.md rule 8: never auto-detect-and-swap.
// Default is "simulation" so the app works with zero setup; opting into
// live mode is a deliberate build-time choice (VITE_API_MODE=live).

import { BrowserAdapter } from "./browserAdapter";
import { LiveAdapter } from "./liveAdapter";
import type { ApiMode, DatabridgeApi } from "./types";

export type { ApiMode, DatabridgeApi } from "./types";
export { LiveApiError } from "./types";
export { BrowserAdapter, LimitExceededError, IdempotencyConflictError } from "./browserAdapter";
export { LiveAdapter } from "./liveAdapter";

export function resolveApiMode(): ApiMode {
  const configured = import.meta.env.VITE_API_MODE;
  return configured === "live" ? "live" : "simulation";
}

let singleton: DatabridgeApi | null = null;

/** The browserAdapter instance, exposed so callers can invoke reset() for "Reset Demo". */
export const browserAdapterInstance = new BrowserAdapter();

export function getApi(): DatabridgeApi {
  if (singleton) return singleton;
  singleton = resolveApiMode() === "live" ? new LiveAdapter() : browserAdapterInstance;
  return singleton;
}
