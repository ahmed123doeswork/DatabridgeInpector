import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "..", "..", "fixtures", "clean.csv");

test("Reset Demo returns to the upload step and clears in-memory job state", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("heading", { name: /Map columns/ })).toBeVisible();

  await page.getByTestId("reset-demo").click();

  await expect(page.getByRole("heading", { name: /Upload a CSV/ })).toBeVisible();

  // Re-uploading the same file after reset must work (proves job state was
  // actually cleared, not just the UI step).
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.getByRole("button", { name: "Upload" }).click();
  await expect(page.getByRole("heading", { name: /Map columns/ })).toBeVisible();
});
