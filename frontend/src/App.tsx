import { useCallback, useState } from "react";
import { browserAdapterInstance } from "./api";
import { ColumnMappingStep } from "./components/ColumnMappingStep";
import { DuplicateReviewStep } from "./components/DuplicateReviewStep";
import { ExportStep } from "./components/ExportStep";
import { ModeBanner } from "./components/ModeBanner";
import { NormalizationPreviewStep } from "./components/NormalizationPreviewStep";
import { ResetDemoButton } from "./components/ResetDemoButton";
import { UploadStep } from "./components/UploadStep";
import { ValidationStep } from "./components/ValidationStep";
import { INITIAL_STATE, JobStoreContext, type JobStoreState, type WizardStep } from "./state/jobStore";
import type { ImportJob } from "./types/contract";

const STEP_LABELS: Record<WizardStep, string> = {
  upload: "Upload",
  mapping: "Map columns",
  validation: "Validate",
  duplicates: "Duplicates",
  normalization: "Normalize",
  export: "Export",
};

function App() {
  const [state, setState] = useState<JobStoreState>(INITIAL_STATE);

  const setJob = useCallback((job: ImportJob) => setState((s) => ({ ...s, job })), []);
  const setStep = useCallback((step: WizardStep) => setState((s) => ({ ...s, step })), []);
  const setLiveError = useCallback(
    (liveError: string | null) => setState((s) => ({ ...s, liveError })),
    []
  );
  const resetDemo = useCallback(() => {
    browserAdapterInstance.reset();
    setState(INITIAL_STATE);
  }, []);

  const store = { ...state, setJob, setStep, setLiveError, resetDemo };

  return (
    <JobStoreContext.Provider value={store}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16 }}>
        <h1>DatabridgeInspector</h1>
        <ResetDemoButton />
      </header>
      <ModeBanner />
      <nav style={{ display: "flex", gap: 8, padding: "8px 16px" }}>
        {(Object.keys(STEP_LABELS) as WizardStep[]).map((step) => (
          <span key={step} style={{ fontWeight: state.step === step ? "bold" : "normal" }}>
            {STEP_LABELS[step]}
          </span>
        ))}
      </nav>
      <main style={{ padding: 16 }}>
        {state.step === "upload" && <UploadStep />}
        {state.step === "mapping" && <ColumnMappingStep />}
        {state.step === "validation" && <ValidationStep />}
        {state.step === "duplicates" && <DuplicateReviewStep />}
        {state.step === "normalization" && <NormalizationPreviewStep />}
        {state.step === "export" && <ExportStep />}
      </main>
    </JobStoreContext.Provider>
  );
}

export default App;
