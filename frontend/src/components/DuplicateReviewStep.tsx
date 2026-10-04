import { useEffect, useState } from "react";
import { getApi, LiveApiError } from "../api";
import { useJobStore } from "../state/jobStore";

export function DuplicateReviewStep() {
  const { job, setJob, setStep, setLiveError } = useJobStore();
  const [running, setRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || job.status !== "validated") return;
    setRunning(true);
    getApi()
      .getDuplicates(job.id)
      .then(setJob)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Duplicate detection failed.";
        if (err instanceof LiveApiError) setLiveError(message);
        else setLocalError(message);
      })
      .finally(() => setRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) return null;

  async function toggleExclude(rowId: string, currentlyExcluded: boolean) {
    try {
      const updated = await getApi().setRowExcluded(job!.id, rowId, !currentlyExcluded);
      setJob(updated);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update row.";
      if (err instanceof LiveApiError) setLiveError(message);
      else setLocalError(message);
    }
  }

  return (
    <section>
      <h2>4. Duplicate review</h2>
      {running && <p>Scoring candidate pairs…</p>}
      {localError && <p role="alert">{localError}</p>}
      {!running && (
        <>
          {job.duplicates.length === 0 && <p>No duplicate candidates found.</p>}
          <table>
            <thead>
              <tr>
                <th>Row A</th>
                <th>Row B</th>
                <th>Score</th>
                <th>Confidence</th>
                <th>Reasons</th>
                <th>Exclude</th>
              </tr>
            </thead>
            <tbody>
              {job.duplicates.map((d) => (
                <tr key={`${d.rowIdA}-${d.rowIdB}`}>
                  <td>{d.rowIdA}</td>
                  <td>{d.rowIdB}</td>
                  <td>{d.score}%</td>
                  <td>{d.confidenceBand.replace(/_/g, " ")}</td>
                  <td title={d.reasonSummary}>
                    {d.signals.map((s) => s.reason).join("; ")}
                  </td>
                  <td>
                    <label>
                      <input
                        type="checkbox"
                        checked={job.excludedRowIds.includes(d.rowIdB)}
                        onChange={() => toggleExclude(d.rowIdB, job.excludedRowIds.includes(d.rowIdB))}
                      />
                      exclude {d.rowIdB}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setStep("normalization")}>Continue</button>
        </>
      )}
    </section>
  );
}
