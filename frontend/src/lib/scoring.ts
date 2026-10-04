// Deterministic, explainable duplicate-detection scoring engine.
// Ported 1:1 to backend/app/scoring.py — same signal order, same weights,
// same rounding — so both sides produce byte-identical reasonSummary text
// for the same input (AGENTS.md rule 2). See docs/adr/0001-duplicate-scoring-design.md.

import type { ConfidenceBand, DuplicateCandidate, ScoreSignal } from "../types/contract";
import {
  emailLocalPart,
  levenshteinRatio,
  normalizeAddress,
  normalizeEmail,
  normalizeFullName,
  normalizePhone,
} from "./normalize";

export interface ScorableRow {
  rowId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  addressLine1: string;
  postalCode: string;
}

const FUZZY_NAME_THRESHOLD = 0.82;
const FUZZY_ADDRESS_THRESHOLD = 0.82;
const SURFACE_THRESHOLD = 35;

/** Signal evaluation order is fixed; ties in points are broken by this order. */
type SignalFn = (a: ScorableRow, b: ScorableRow) => ScoreSignal | null;

const emailExact: SignalFn = (a, b) => {
  const ea = normalizeEmail(a.email);
  const eb = normalizeEmail(b.email);
  if (ea.length > 0 && ea === eb) {
    return { signal: "email_exact", points: 40, reason: "email exact match" };
  }
  return null;
};

const emailLocalPartMatch: SignalFn = (a, b) => {
  const la = emailLocalPart(normalizeEmail(a.email));
  const lb = emailLocalPart(normalizeEmail(b.email));
  if (la.length > 0 && la === lb) {
    return {
      signal: "email_local_part_match",
      points: 15,
      reason: "email username matches, domain differs",
    };
  }
  return null;
};

const phoneNormalizedExact: SignalFn = (a, b) => {
  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  if (pa.ambiguous || pb.ambiguous) return null;
  if (pa.normalized.length > 0 && pa.normalized === pb.normalized) {
    return {
      signal: "phone_normalized_exact",
      points: 30,
      reason: "phone exact match (normalized)",
    };
  }
  return null;
};

const phoneLast7Match: SignalFn = (a, b) => {
  const pa = normalizePhone(a.phone);
  const pb = normalizePhone(b.phone);
  if (pa.ambiguous || pb.ambiguous) return null;
  if (pa.last7.length === 7 && pa.last7 === pb.last7) {
    return {
      signal: "phone_last7_match",
      points: 15,
      reason: "phone matches ignoring area code/extension",
    };
  }
  return null;
};

const nameExact: SignalFn = (a, b) => {
  const na = normalizeFullName(a.firstName, a.lastName);
  const nb = normalizeFullName(b.firstName, b.lastName);
  if (na.length > 0 && na === nb) {
    return { signal: "name_exact", points: 20, reason: "name exact match" };
  }
  return null;
};

const nameFuzzy: SignalFn = (a, b) => {
  const na = normalizeFullName(a.firstName, a.lastName);
  const nb = normalizeFullName(b.firstName, b.lastName);
  const ratio = levenshteinRatio(na, nb);
  if (ratio >= FUZZY_NAME_THRESHOLD) {
    return {
      signal: "name_fuzzy",
      points: Math.round(15 * ratio),
      reason: `name ${Math.round(ratio * 100)}% similar (Levenshtein)`,
    };
  }
  return null;
};

const addressFuzzy: SignalFn = (a, b) => {
  const aa = normalizeAddress(a.addressLine1, a.postalCode);
  const ab = normalizeAddress(b.addressLine1, b.postalCode);
  const ratio = levenshteinRatio(aa, ab);
  if (ratio >= FUZZY_ADDRESS_THRESHOLD) {
    return {
      signal: "address_fuzzy",
      points: Math.round(10 * ratio),
      reason: `address ${Math.round(ratio * 100)}% similar (Levenshtein)`,
    };
  }
  return null;
};

function confidenceBandFor(score: number): ConfidenceBand | null {
  if (score >= 85) return "high_confidence_duplicate";
  if (score >= 60) return "likely_duplicate";
  if (score >= 35) return "possible_duplicate";
  return null;
}

function buildReasonSummary(score: number, signals: ScoreSignal[]): string {
  const sorted = [...signals].sort((x, y) => y.points - x.points);
  const parts = sorted.map((s) => `${s.reason} (+${s.points})`);
  return `${score}% — ${parts.join("; ")}`;
}

/** Scores one pair of rows. Pure, deterministic, order-independent signal evaluation. */
export function scorePair(a: ScorableRow, b: ScorableRow): DuplicateCandidate | null {
  const signals: ScoreSignal[] = [];

  const emailExactSignal = emailExact(a, b);
  if (emailExactSignal) signals.push(emailExactSignal);
  else {
    const localMatch = emailLocalPartMatch(a, b);
    if (localMatch) signals.push(localMatch);
  }

  const phoneExactSignal = phoneNormalizedExact(a, b);
  if (phoneExactSignal) signals.push(phoneExactSignal);
  else {
    const last7 = phoneLast7Match(a, b);
    if (last7) signals.push(last7);
  }

  const nameExactSignal = nameExact(a, b);
  if (nameExactSignal) signals.push(nameExactSignal);
  else {
    const fuzzy = nameFuzzy(a, b);
    if (fuzzy) signals.push(fuzzy);
  }

  const address = addressFuzzy(a, b);
  if (address) signals.push(address);

  const rawScore = signals.reduce((sum, s) => sum + s.points, 0);
  const score = Math.min(100, rawScore);
  const band = confidenceBandFor(score);
  if (band === null) return null;

  return {
    rowIdA: a.rowId,
    rowIdB: b.rowId,
    score,
    confidenceBand: band,
    signals: [...signals].sort((x, y) => y.points - x.points),
    reasonSummary: buildReasonSummary(score, signals),
  };
}

/** Scores every pair in the row set, returning only candidates at/above the surfacing threshold. */
export function findDuplicateCandidates(rows: ScorableRow[]): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const candidate = scorePair(rows[i], rows[j]);
      if (candidate && candidate.score >= SURFACE_THRESHOLD) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}
