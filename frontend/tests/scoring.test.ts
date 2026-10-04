import { describe, expect, it } from "vitest";
import { findDuplicateCandidates } from "../src/lib/scoring";
import { fixtureRowsFromCsv, loadExpectedJson, loadFixtureCsv } from "./helpers";

interface ExpectedDuplicatesFile {
  expectedPairs: Array<{
    rowIdA: string;
    rowIdB: string;
    score: number;
    confidenceBand: string;
    signals: Array<{ signal: string; points: number; reason: string }>;
    reasonSummary: string;
  }>;
  prunedPairs: Array<{ rowIdA: string; rowIdB: string }>;
}

describe("findDuplicateCandidates", () => {
  const rows = fixtureRowsFromCsv(loadFixtureCsv("duplicates.csv"));
  const expected = loadExpectedJson<ExpectedDuplicatesFile>("duplicates.expected.json");

  it("surfaces every expected pair with the exact score, band, and signals", () => {
    const candidates = findDuplicateCandidates(rows);

    for (const expectedPair of expected.expectedPairs) {
      const found = candidates.find(
        (c) => c.rowIdA === expectedPair.rowIdA && c.rowIdB === expectedPair.rowIdB
      );
      expect(found, `expected pair ${expectedPair.rowIdA}/${expectedPair.rowIdB} not found`).toBeDefined();
      expect(found!.score).toBe(expectedPair.score);
      expect(found!.confidenceBand).toBe(expectedPair.confidenceBand);
      expect(found!.signals).toEqual(expectedPair.signals);
      expect(found!.reasonSummary).toBe(expectedPair.reasonSummary);
    }
  });

  it("prunes pairs below the surfacing threshold", () => {
    const candidates = findDuplicateCandidates(rows);
    for (const pruned of expected.prunedPairs) {
      const found = candidates.find(
        (c) => c.rowIdA === pruned.rowIdA && c.rowIdB === pruned.rowIdB
      );
      expect(found, `pruned pair ${pruned.rowIdA}/${pruned.rowIdB} should not be surfaced`).toBeUndefined();
    }
  });

  it("is deterministic across repeated runs", () => {
    const run1 = findDuplicateCandidates(rows);
    const run2 = findDuplicateCandidates(rows);
    expect(run1).toEqual(run2);
  });

  it("never assigns a signal when either phone is ambiguous", () => {
    const ambiguousRows = fixtureRowsFromCsv(loadFixtureCsv("ambiguous_phones.csv"));
    // Pair rows up against each other and against a clean-phone row — no
    // phone_normalized_exact / phone_last7_match signal may ever appear.
    const cleanRows = fixtureRowsFromCsv(loadFixtureCsv("clean.csv"));
    const mixed = [...ambiguousRows, ...cleanRows.slice(0, 2)];
    const candidates = findDuplicateCandidates(mixed);
    for (const candidate of candidates) {
      for (const signal of candidate.signals) {
        expect(signal.signal).not.toBe("phone_normalized_exact");
        expect(signal.signal).not.toBe("phone_last7_match");
      }
    }
  });
});
