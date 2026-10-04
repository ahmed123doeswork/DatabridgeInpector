"""Pure normalization helpers. Ported 1:1 from frontend/src/lib/normalize.ts —
keep both sides in lockstep (AGENTS.md rule 2)."""

from __future__ import annotations

import re

_NON_DIGIT = re.compile(r"[^0-9]")
_WHITESPACE = re.compile(r"\s+")


def normalize_email(raw: str) -> str:
    return raw.strip().lower()


def email_local_part(normalized_email: str) -> str:
    at = normalized_email.find("@")
    return normalized_email if at == -1 else normalized_email[:at]


class NormalizedPhone:
    __slots__ = ("normalized", "ambiguous", "last7")

    def __init__(self, normalized: str, ambiguous: bool, last7: str) -> None:
        self.normalized = normalized
        self.ambiguous = ambiguous
        self.last7 = last7


def normalize_phone(raw: str) -> NormalizedPhone:
    trimmed = raw.strip()
    has_explicit_country_code = trimmed.startswith("+")
    digits_only = _NON_DIGIT.sub("", trimmed)
    normalized = f"+{digits_only}" if has_explicit_country_code else digits_only
    return NormalizedPhone(
        normalized=normalized,
        ambiguous=not has_explicit_country_code,
        last7=digits_only[-7:],
    )


def canonicalize_phone_format(raw: str) -> str:
    return normalize_phone(raw).normalized


def normalize_full_name(first_name: str, last_name: str) -> str:
    return _WHITESPACE.sub(" ", f"{first_name} {last_name}".strip()).lower()


def normalize_address(address_line1: str, postal_code: str) -> str:
    return _WHITESPACE.sub(" ", f"{address_line1} {postal_code}".strip()).lower()


def _title_case_word(word: str) -> str:
    if not word:
        return word
    return word[0].upper() + word[1:].lower()


def normalize_name_casing(raw: str) -> str:
    collapsed = _WHITESPACE.sub(" ", raw.strip())
    return " ".join(_title_case_word(w) for w in collapsed.split(" "))


def levenshtein_distance(a: str, b: str) -> int:
    rows, cols = len(a) + 1, len(b) + 1
    dp = [[0] * cols for _ in range(rows)]
    for i in range(rows):
        dp[i][0] = i
    for j in range(cols):
        dp[0][j] = j
    for i in range(1, rows):
        for j in range(1, cols):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            dp[i][j] = min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
    return dp[rows - 1][cols - 1]


def levenshtein_ratio(a: str, b: str) -> float:
    max_len = max(len(a), len(b))
    if max_len == 0:
        return 0.0
    return 1 - levenshtein_distance(a, b) / max_len
