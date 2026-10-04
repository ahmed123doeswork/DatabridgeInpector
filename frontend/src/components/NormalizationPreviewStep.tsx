import { useState } from "react";
import { getApi, LiveApiError } from "../api";
import { useJobStore } from "../state/jobStore";

export function NormalizationPreviewStep() {
  const { job, setJob, setStep, setLiveError } = useJobStore();
  const [localError, setLocalError] = useState<string | null>(null);

  if (!job) return null;

  async function decide(rowId: string, field: string, status: "accepted" | "rejected") {
    try {
      const updated = await getApi().setNormalizationStatus(job!.id, rowId, field, status);
      setJob(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update suggestion.";
      if (err instanceof LiveApiError) setLiveError(message);
      else setLocalError(message);
    }
  }

  return (
    <section>
      <h2>5. Normalization preview</h2>
      {localError && <p role="alert">{localError}</p>}
      {job.normalizationLog.length === 0 && <p>No normalization suggestions.</p>}
      <table>
        <thead>
          <tr>
            <th>Row</th>
            <th>Field</th>
            <th>Original</th>
            <th>Suggested</th>
            <th>Rule</th>
            <th>Status</th>
            <th>Decision</th>
          </tr>
        </thead>
        <tbody>
          {job.normalizationLog.map((entry, i) => (
            <tr key={`${entry.rowId}-${entry.field}-${i}`}>
              <td>{entry.rowId}</td>
              <td>{entry.field}</td>
              <td>{entry.originalValue}</td>
              <td>{entry.suggestedValue}</td>
              <td>{entry.rule}</td>
              <td>{entry.status}</td>
              <td>
                <button onClick={() => decide(entry.rowId, entry.field, "accepted")}>Accept</button>
                <button onClick={() => decide(entry.rowId, entry.field, "rejected")}>Reject</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={() => setStep("export")}>Continue to export</button>
    </section>
  );
}
