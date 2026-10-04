import { resolveApiMode } from "../api";
import { useJobStore } from "../state/jobStore";

export function ModeBanner() {
  const { liveError, setLiveError } = useJobStore();
  const mode = resolveApiMode();

  if (mode === "simulation") {
    return (
      <div role="status" style={{ background: "#fef3c7", padding: "8px 12px", fontSize: 14 }}>
        Browser simulation — no backend. All processing happens in your browser; nothing is sent
        anywhere.
      </div>
    );
  }

  if (liveError) {
    return (
      <div
        role="alert"
        style={{ background: "#fee2e2", padding: "8px 12px", fontSize: 14, display: "flex", gap: 12, alignItems: "center" }}
      >
        <span>Live request failed: {liveError}</span>
        <button onClick={() => setLiveError(null)}>Dismiss</button>
      </div>
    );
  }

  return (
    <div role="status" style={{ background: "#dbeafe", padding: "8px 12px", fontSize: 14 }}>
      Live mode — talking to the FastAPI backend.
    </div>
  );
}
