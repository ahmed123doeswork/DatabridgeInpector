import { describe, expect, it } from "vitest";
import {
  canonicalizePhoneFormat,
  levenshteinRatio,
  normalizeEmail,
  normalizeNameCasing,
  normalizePhone,
} from "../src/lib/normalize";
import { fixtureRowsFromCsv, loadExpectedJson, loadFixtureCsv } from "./helpers";

describe("normalizePhone", () => {
  it("flags every row in ambiguous_phones.csv as ambiguous, never guessing a country code", () => {
    const rows = fixtureRowsFromCsv(loadFixtureCsv("ambiguous_phones.csv"));
    for (const row of rows) {
      expect(normalizePhone(row.phone).ambiguous).toBe(true);
    }
  });

  it("does not flag an explicit leading country code as ambiguous", () => {
    expect(normalizePhone("+1 415-555-0101").ambiguous).toBe(false);
  });
});

describe("canonicalizePhoneFormat", () => {
  it("matches the hand-computed expected normalization suggestions", () => {
    interface NormalizationFile {
      ["clean.csv"]: Array<{ rowId: string; field: string; originalValue: string; suggestedValue: string }>;
    }
    const expected = loadExpectedJson<NormalizationFile>("normalization.expected.json");
    for (const entry of expected["clean.csv"]) {
      if (entry.field !== "phone") continue;
      expect(canonicalizePhoneFormat(entry.originalValue)).toBe(entry.suggestedValue);
    }
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Alice@EXAMPLE.com ")).toBe("alice@example.com");
  });
});

describe("normalizeNameCasing", () => {
  it("collapses whitespace and title-cases each word", () => {
    expect(normalizeNameCasing("  john   SMITH ")).toBe("John Smith");
  });
});

describe("levenshteinRatio", () => {
  it("is 1 for identical strings and 0 for empty strings", () => {
    expect(levenshteinRatio("abc", "abc")).toBe(1);
    expect(levenshteinRatio("", "")).toBe(0);
  });
});
