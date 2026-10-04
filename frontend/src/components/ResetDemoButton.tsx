import { useJobStore } from "../state/jobStore";

export function ResetDemoButton() {
  const { resetDemo } = useJobStore();
  return (
    <button data-testid="reset-demo" onClick={resetDemo}>
      Reset Demo
    </button>
  );
}
