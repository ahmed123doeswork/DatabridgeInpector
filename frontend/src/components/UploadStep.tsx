import { useState } from "react";
import { getApi, LiveApiError } from "../api";
import { useJobStore } from "../state/jobStore";

export function UploadStep() {
  const { setJob, setStep, setLiveError } = useJobStore();
  const [file, setFile] = useState<File | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleFileChange(f: File | null) {
    setFile(f);
    setIdempotencyKey(crypto.randomUUID());
    setLocalError(null);
  }

  async function handleSubmit() {
    if (!file) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const job = await getApi().createJob(file, idempotencyKey);
      setJob(job);
      setStep("mapping");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed.";
      if (err instanceof LiveApiError) {
        setLiveError(message);
      } else {
        setLocalError(message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>1. Upload a CSV</h2>
      <input
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
      />
      <button onClick={handleSubmit} disabled={!file || submitting}>
        {submitting ? "Uploading…" : "Upload"}
      </button>
      {localError && <p role="alert">{localError}</p>}
    </section>
  );
}
