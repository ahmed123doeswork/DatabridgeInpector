import { createContext, useContext } from "react";
import type { ImportJob } from "../types/contract";

export type WizardStep =
  | "upload"
  | "mapping"
  | "validation"
  | "duplicates"
  | "normalization"
  | "export";

export interface JobStoreState {
  job: ImportJob | null;
  step: WizardStep;
  liveError: string | null;
}

export interface JobStoreActions {
  setJob(job: ImportJob): void;
  setStep(step: WizardStep): void;
  setLiveError(message: string | null): void;
  resetDemo(): void;
}

export type JobStoreValue = JobStoreState & JobStoreActions;

export const JobStoreContext = createContext<JobStoreValue | null>(null);

export function useJobStore(): JobStoreValue {
  const ctx = useContext(JobStoreContext);
  if (!ctx) throw new Error("useJobStore must be used within a JobStoreContext.Provider");
  return ctx;
}

export const INITIAL_STATE: JobStoreState = {
  job: null,
  step: "upload",
  liveError: null,
};
