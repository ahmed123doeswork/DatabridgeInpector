import { useEffect, useState } from "react";
import { getApi, LiveApiError } from "../api";
import { useJobStore } from "../state/jobStore";

export function ValidationStep() {
  const { job, setJob, setStep, setLiveError } = useJobStore();
  const [running, setRunning] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!job || job.status !== "mapped") return;
    setRunning(true);
    getApi()
      .validate(job.id)
      .then(setJob)
      .catch((err) => {
        const message = err instanceof Error ? err.message : "Validation failed.";
        if (err instanceof LiveApiError) setLiveError(message);
        else setLocalError(message);
      })
      .finally(() => setRunning(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  if (!job) return null;

  const errors = job.validationErrors.filter((e) => e.severity === "error");
  const warnings = job.validationErrors.filter((e) => e.severity === "warning");

  return (
    <section>
      <h2>3. Validation</h2>
      {running && <p>Validating…</p>}
      {localError && <p role="alert">{localError}</p>}
      {!running && (
        <>
          <p>
            {errors.length} error(s), {warnings.length} warning(s).
          </p>
          <table>
            <thead>
              <tr>
                <th>Row</th>
                <th>Field</th>
                <th>Severity</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {job.validationErrors.map((e, i) => (
                <tr key={`${e.rowId}-${e.field}-${i}`}>
                  <td>{e.rowId}</td>
                  <td>{e.field ?? "—"}</td>
                  <td>{e.severity}</td>
                  <td>{e.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setStep("duplicates")}>Continue</button>
        </>
      )}
    </section>
  );
}
