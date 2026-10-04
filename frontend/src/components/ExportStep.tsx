import { useState } from "react";
import { getApi, LiveApiError } from "../api";
import { useJobStore } from "../state/jobStore";

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ExportStep() {
  const { job, setJob, setLiveError } = useJobStore();
  const [exporting, setExporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  if (!job) return null;

  async function handleExport() {
    setExporting(true);
    setLocalError(null);
    try {
      const result = await getApi().exportJob(job!.id);
      setJob({ ...job!, status: "exported", exportResult: result });
      downloadCsv(`cleaned-${job!.id}.csv`, result.csvContent);
      downloadCsv(`errors-${job!.id}.csv`, result.errorReportCsvContent);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed.";
      if (err instanceof LiveApiError) setLiveError(message);
      else setLocalError(message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section>
      <h2>6. Export</h2>
      {localError && <p role="alert">{localError}</p>}
      <button onClick={handleExport} disabled={exporting}>
        {exporting ? "Exporting…" : "Export cleaned CSV + error report"}
      </button>
      {job.exportResult && (
        <p data-testid="export-summary">
          Exported {job.exportResult.rowCount} row(s), excluded {job.exportResult.excludedRowCount}.
        </p>
      )}
    </section>
  );
}
