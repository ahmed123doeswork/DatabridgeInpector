import { type ChildProcess, spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This spec needs its own dev-server instance with VITE_API_MODE=live (the
// shared webServer in playwright.config.ts runs in the default simulation
// mode). No backend is started, so every live call must fail — proving
// AGENTS.md rule 8: the UI shows an explicit error, it never silently
// serves simulated data while still labeled "live".

const LIVE_PORT = 5174;
const FIXTURE = path.join(__dirname, "..", "..", "fixtures", "clean.csv");

let devServer: ChildProcess;

test.beforeAll(async () => {
  devServer = spawn(`npx vite --port ${LIVE_PORT} --strictPort`, {
    cwd: path.join(__dirname, ".."),
    env: {
      ...process.env,
      VITE_API_MODE: "live",
      VITE_API_BASE_URL: "http://localhost:8000",
    },
    shell: true,
  });

  let stderr = "";
  devServer.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://localhost:${LIVE_PORT}/`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    if (devServer.exitCode !== null) {
      throw new Error(`live dev server exited early (code ${devServer.exitCode}): ${stderr}`);
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`live dev server did not start in time: ${stderr}`);
});

test.afterAll(() => {
  if (devServer?.pid) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(devServer.pid), "/T", "/F"]);
    } else {
      devServer.kill();
    }
  }
});

test("live-mode failure shows an explicit error banner, never silent fixture data", async ({ page }) => {
  await page.goto(`http://localhost:${LIVE_PORT}/`);

  await expect(page.getByText("Live mode — talking to the FastAPI backend.")).toBeVisible();

  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.getByRole("button", { name: "Upload" }).click();

  // The backend isn't running, so this must surface an explicit error —
  // never silently advance to the mapping step with simulated data.
  await expect(page.getByRole("alert")).toContainText(/failed/i);
  await expect(page.getByRole("heading", { name: /Map columns/ })).not.toBeVisible();
});
