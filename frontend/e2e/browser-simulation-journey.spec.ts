import { expect, test } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.join(__dirname, "..", "..", "fixtures", "duplicates.csv");

test("full browser-simulation journey: upload -> map -> validate -> duplicates -> normalize -> export", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page.getByText("Browser simulation — no backend")).toBeVisible();

  // 1. Upload
  await page.setInputFiles('input[type="file"]', FIXTURE);
  await page.getByRole("button", { name: "Upload" }).click();

  // 2. Column mapping (auto-suggested from header names matching the fixture)
  await expect(page.getByRole("heading", { name: /Map columns/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 3. Validation
  await expect(page.getByRole("heading", { name: /Validation/ })).toBeVisible();
  await expect(page.getByText(/error\(s\), \d+ warning\(s\)/)).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();

  // 4. Duplicate review — the known high-confidence pair must be shown with score + reasons
  await expect(page.getByRole("heading", { name: /Duplicate review/ })).toBeVisible();
  const highConfidenceRow = page.locator("tr", { hasText: "row-1" }).filter({ hasText: "row-2" });
  await expect(highConfidenceRow).toContainText("100%");
  await expect(highConfidenceRow).toContainText("email exact match");
  await page.getByRole("button", { name: "Continue" }).click();

  // 5. Normalization preview
  await expect(page.getByRole("heading", { name: /Normalization preview/ })).toBeVisible();
  await page.getByRole("button", { name: "Continue to export" }).click();

  // 6. Export
  await expect(page.getByRole("heading", { name: /Export/ })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export cleaned CSV/ }).click();
  await downloadPromise;
  await expect(page.getByTestId("export-summary")).toContainText("Exported 8 row(s)");
});
