import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCsv, rowIdFor } from "../src/lib/csvParse";
import type { ScorableRow } from "../src/lib/scoring";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXTURES_DIR = join(REPO_ROOT, "fixtures");
const EXPECTED_DIR = join(FIXTURES_DIR, "expected");

export function loadFixtureCsv(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf-8");
}

export function loadExpectedJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(EXPECTED_DIR, name), "utf-8")) as T;
}

/** All fixture CSVs share this header: first_name,last_name,email,phone,address,postal_code */
export function fixtureRowsFromCsv(csvContent: string): ScorableRow[] {
  const { header, rows } = parseCsv(csvContent);
  const idx = {
    firstName: header.indexOf("first_name"),
    lastName: header.indexOf("last_name"),
    email: header.indexOf("email"),
    phone: header.indexOf("phone"),
    addressLine1: header.indexOf("address"),
    postalCode: header.indexOf("postal_code"),
  };
  return rows.map((row, i) => ({
    rowId: rowIdFor(i),
    firstName: row[idx.firstName] ?? "",
    lastName: row[idx.lastName] ?? "",
    email: row[idx.email] ?? "",
    phone: row[idx.phone] ?? "",
    addressLine1: row[idx.addressLine1] ?? "",
    postalCode: row[idx.postalCode] ?? "",
  }));
}
