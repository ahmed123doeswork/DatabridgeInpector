"""Deterministic, explainable duplicate-detection scoring engine.
Ported 1:1 from frontend/src/lib/scoring.ts — same signal order, same
weights, same rounding, so both sides produce identical reasonSummary text
for the same input (AGENTS.md rule 2). See docs/adr/0001-duplicate-scoring-design.md.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.normalize import (
    email_local_part,
    levenshtein_ratio,
    normalize_address,
    normalize_email,
    normalize_full_name,
    normalize_phone,
)
from app.schemas import ConfidenceBand, DuplicateCandidate, ScoreSignal

FUZZY_NAME_THRESHOLD = 0.82
FUZZY_ADDRESS_THRESHOLD = 0.82
SURFACE_THRESHOLD = 35


@dataclass
class ScorableRow:
    rowId: str
    firstName: str
    lastName: str
    email: str
    phone: str
    addressLine1: str
    postalCode: str


def _email_exact(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    ea, eb = normalize_email(a.email), normalize_email(b.email)
    if ea and ea == eb:
        return ScoreSignal(signal="email_exact", points=40, reason="email exact match")
    return None


def _email_local_part_match(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    la = email_local_part(normalize_email(a.email))
    lb = email_local_part(normalize_email(b.email))
    if la and la == lb:
        return ScoreSignal(
            signal="email_local_part_match",
            points=15,
            reason="email username matches, domain differs",
        )
    return None


def _phone_normalized_exact(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    pa, pb = normalize_phone(a.phone), normalize_phone(b.phone)
    if pa.ambiguous or pb.ambiguous:
        return None
    if pa.normalized and pa.normalized == pb.normalized:
        return ScoreSignal(
            signal="phone_normalized_exact", points=30, reason="phone exact match (normalized)"
        )
    return None


def _phone_last7_match(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    pa, pb = normalize_phone(a.phone), normalize_phone(b.phone)
    if pa.ambiguous or pb.ambiguous:
        return None
    if len(pa.last7) == 7 and pa.last7 == pb.last7:
        return ScoreSignal(
            signal="phone_last7_match",
            points=15,
            reason="phone matches ignoring area code/extension",
        )
    return None


def _name_exact(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    na = normalize_full_name(a.firstName, a.lastName)
    nb = normalize_full_name(b.firstName, b.lastName)
    if na and na == nb:
        return ScoreSignal(signal="name_exact", points=20, reason="name exact match")
    return None


def _name_fuzzy(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    na = normalize_full_name(a.firstName, a.lastName)
    nb = normalize_full_name(b.firstName, b.lastName)
    ratio = levenshtein_ratio(na, nb)
    if ratio >= FUZZY_NAME_THRESHOLD:
        return ScoreSignal(
            signal="name_fuzzy",
            points=round(15 * ratio),
            reason=f"name {round(ratio * 100)}% similar (Levenshtein)",
        )
    return None


def _address_fuzzy(a: ScorableRow, b: ScorableRow) -> ScoreSignal | None:
    aa = normalize_address(a.addressLine1, a.postalCode)
    ab = normalize_address(b.addressLine1, b.postalCode)
    ratio = levenshtein_ratio(aa, ab)
    if ratio >= FUZZY_ADDRESS_THRESHOLD:
        return ScoreSignal(
            signal="address_fuzzy",
            points=round(10 * ratio),
            reason=f"address {round(ratio * 100)}% similar (Levenshtein)",
        )
    return None


def _confidence_band_for(score: float) -> ConfidenceBand | None:
    if score >= 85:
        return ConfidenceBand.high_confidence_duplicate
    if score >= 60:
        return ConfidenceBand.likely_duplicate
    if score >= 35:
        return ConfidenceBand.possible_duplicate
    return None


def _build_reason_summary(score: float, signals: list[ScoreSignal]) -> str:
    sorted_signals = sorted(signals, key=lambda s: -s.points)
    parts = [f"{s.reason} (+{int(s.points)})" for s in sorted_signals]
    return f"{int(score)}% — " + "; ".join(parts)


def score_pair(a: ScorableRow, b: ScorableRow) -> DuplicateCandidate | None:
    """Pure, deterministic, fixed-order signal evaluation — see the TS twin
    in frontend/src/lib/scoring.ts for the authoritative ordering rationale."""
    signals: list[ScoreSignal] = []

    email_exact = _email_exact(a, b)
    if email_exact:
        signals.append(email_exact)
    else:
        local_match = _email_local_part_match(a, b)
        if local_match:
            signals.append(local_match)

    phone_exact = _phone_normalized_exact(a, b)
    if phone_exact:
        signals.append(phone_exact)
    else:
        last7 = _phone_last7_match(a, b)
        if last7:
            signals.append(last7)

    name_exact = _name_exact(a, b)
    if name_exact:
        signals.append(name_exact)
    else:
        fuzzy = _name_fuzzy(a, b)
        if fuzzy:
            signals.append(fuzzy)

    address = _address_fuzzy(a, b)
    if address:
        signals.append(address)

    raw_score = sum(s.points for s in signals)
    score = min(100, raw_score)
    band = _confidence_band_for(score)
    if band is None:
        return None

    return DuplicateCandidate(
        rowIdA=a.rowId,
        rowIdB=b.rowId,
        score=score,
        confidenceBand=band,
        signals=sorted(signals, key=lambda s: -s.points),
        reasonSummary=_build_reason_summary(score, signals),
    )


def find_duplicate_candidates(rows: list[ScorableRow]) -> list[DuplicateCandidate]:
    candidates: list[DuplicateCandidate] = []
    for i in range(len(rows)):
        for j in range(i + 1, len(rows)):
            candidate = score_pair(rows[i], rows[j])
            if candidate is not None and candidate.score >= SURFACE_THRESHOLD:
                candidates.append(candidate)
    return candidates
