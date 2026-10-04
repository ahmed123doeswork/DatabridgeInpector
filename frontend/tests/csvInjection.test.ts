import { describe, expect, it } from "vitest";
import {
  isFormulaInjectionRisk,
  isFormulaInjectionRiskForField,
  neutralizeFormulaInjection,
  neutralizeFormulaInjectionForField,
} from "../src/lib/csvInjection";
import { fixtureRowsFromCsv, loadExpectedJson, loadFixtureCsv } from "./helpers";

interface ValidationExpectedFile {
  "formula_injection.csv": {
    expectedFindings: Array<{ rowId: string; field: string }>;
    expectedCleanRowIds: string[];
  };
}

describe("isFormulaInjectionRisk", () => {
  it.each(["=HYPERLINK(x)", "+CMD(calc)", "-2+3", "@SUM(A1)"])("flags %s", (value) => {
    expect(isFormulaInjectionRisk(value)).toBe(true);
  });

  it.each(["normal text", "", "user@example.com"])("does not flag %s", (value) => {
    expect(isFormulaInjectionRisk(value)).toBe(false);
  });
});

describe("isFormulaInjectionRiskForField / neutralizeFormulaInjectionForField", () => {
  it("exempts the phone field from the generic leading-char check", () => {
    expect(isFormulaInjectionRiskForField("phone", "+1 415-555-0101")).toBe(false);
    expect(neutralizeFormulaInjectionForField("phone", "+1 415-555-0101")).toBe("+1 415-555-0101");
  });

  it("still flags every other field", () => {
    expect(isFormulaInjectionRiskForField("addressLine1", "=1+1")).toBe(true);
    expect(neutralizeFormulaInjectionForField("addressLine1", "=1+1")).toBe("'=1+1");
  });
});

describe("neutralizeFormulaInjection", () => {
  it("prefixes risky cells with a single quote, leaving the rest unchanged", () => {
    expect(neutralizeFormulaInjection("=1+1")).toBe("'=1+1");
    expect(neutralizeFormulaInjection("safe value")).toBe("safe value");
  });

  it("matches the expected findings for formula_injection.csv row by row", () => {
    const rows = fixtureRowsFromCsv(loadFixtureCsv("formula_injection.csv"));
    const expected = loadExpectedJson<ValidationExpectedFile>("validate_errors.expected.json")[
      "formula_injection.csv"
    ];

    const fieldGetters: Record<string, (r: (typeof rows)[number]) => string> = {
      firstName: (r) => r.firstName,
      lastName: (r) => r.lastName,
      email: (r) => r.email,
      addressLine1: (r) => r.addressLine1,
    };

    for (const finding of expected.expectedFindings) {
      const row = rows.find((r) => r.rowId === finding.rowId)!;
      const value = fieldGetters[finding.field](row);
      expect(isFormulaInjectionRisk(value), `${finding.rowId}.${finding.field}`).toBe(true);
    }

    for (const cleanRowId of expected.expectedCleanRowIds) {
      const row = rows.find((r) => r.rowId === cleanRowId)!;
      expect(isFormulaInjectionRisk(row.firstName)).toBe(false);
      expect(isFormulaInjectionRisk(row.lastName)).toBe(false);
      expect(isFormulaInjectionRisk(row.email)).toBe(false);
      expect(isFormulaInjectionRisk(row.addressLine1)).toBe(false);
    }
  });
});
