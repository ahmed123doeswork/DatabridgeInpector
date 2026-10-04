import { useEffect, useState } from "react";
import { getApi, LiveApiError } from "../api";
import type { ContactField } from "../types/contract";
import { useJobStore } from "../state/jobStore";

const CONTACT_FIELDS: ContactField[] = [
  "firstName",
  "lastName",
  "fullName",
  "email",
  "phone",
  "addressLine1",
  "postalCode",
];

const AUTO_MAP_HINTS: Record<string, ContactField> = {
  first_name: "firstName",
  last_name: "lastName",
  full_name: "fullName",
  name: "fullName",
  email: "email",
  phone: "phone",
  phone_number: "phone",
  address: "addressLine1",
  address_line_1: "addressLine1",
  postal_code: "postalCode",
  zip: "postalCode",
};

export function ColumnMappingStep() {
  const { job, setJob, setStep, setLiveError } = useJobStore();
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, ContactField | "">>({});
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    getApi()
      .getSourceColumns(job.id)
      .then((columns) => {
        setSourceColumns(columns);
        const initial: Record<string, ContactField | ""> = {};
        for (const col of columns) {
          initial[col] = AUTO_MAP_HINTS[col.toLowerCase()] ?? "";
        }
        setMapping(initial);
      })
      .catch((err) => setLocalError(err instanceof Error ? err.message : "Failed to load columns."));
  }, [job]);

  if (!job) return null;

  async function handleSubmit() {
    setSubmitting(true);
    setLocalError(null);
    try {
      const columns: Record<string, ContactField> = {};
      for (const [source, field] of Object.entries(mapping)) {
        if (field) columns[source] = field;
      }
      const updated = await getApi().setMapping(job!.id, { columns });
      setJob(updated);
      setStep("validation");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Mapping failed.";
      if (err instanceof LiveApiError) setLiveError(message);
      else setLocalError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section>
      <h2>2. Map columns</h2>
      <table>
        <thead>
          <tr>
            <th>Source column</th>
            <th>Maps to</th>
          </tr>
        </thead>
        <tbody>
          {sourceColumns.map((col) => (
            <tr key={col}>
              <td>{col}</td>
              <td>
                <select
                  value={mapping[col] ?? ""}
                  onChange={(e) =>
                    setMapping((m) => ({ ...m, [col]: e.target.value as ContactField | "" }))
                  }
                >
                  <option value="">(ignore)</option>
                  {CONTACT_FIELDS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "Saving…" : "Continue"}
      </button>
      {localError && <p role="alert">{localError}</p>}
    </section>
  );
}
