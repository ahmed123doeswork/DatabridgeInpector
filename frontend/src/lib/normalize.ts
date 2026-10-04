// Pure normalization helpers. Ported 1:1 to backend/app/normalize.py — keep
// both sides in lockstep (AGENTS.md rule 2: scoring/normalization must be
// deterministic and identical on both sides of the stack).

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function emailLocalPart(normalizedEmail: string): string {
  const at = normalizedEmail.indexOf("@");
  return at === -1 ? normalizedEmail : normalizedEmail.slice(0, at);
}

export interface NormalizedPhone {
  /** Digits only, with a leading '+' preserved when the source had one. */
  normalized: string;
  /** True when the source had no explicit leading '+<countrycode>'. */
  ambiguous: boolean;
  /** Last 7 digits, used to match despite area-code/extension noise. */
  last7: string;
}

export function normalizePhone(raw: string): NormalizedPhone {
  const trimmed = raw.trim();
  const hasExplicitCountryCode = trimmed.startsWith("+");
  const digitsOnly = trimmed.replace(/[^0-9]/g, "");
  const normalized = hasExplicitCountryCode ? `+${digitsOnly}` : digitsOnly;
  return {
    normalized,
    ambiguous: !hasExplicitCountryCode,
    last7: digitsOnly.slice(-7),
  };
}

/** Strips formatting characters but keeps a leading '+' and all digits. */
export function canonicalizePhoneFormat(raw: string): string {
  return normalizePhone(raw).normalized;
}

export function normalizeFullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim().replace(/\s+/g, " ").toLowerCase();
}

export function normalizeAddress(addressLine1: string, postalCode: string): string {
  return `${addressLine1} ${postalCode}`.trim().replace(/\s+/g, " ").toLowerCase();
}

function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

/** Trim, collapse internal whitespace, title-case each whitespace-separated word. */
export function normalizeNameCasing(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map(titleCaseWord)
    .join(" ");
}

/** Levenshtein edit distance between two strings. */
export function levenshteinDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[rows - 1][cols - 1];
}

/** Similarity ratio in [0, 1]; 1 means identical. Empty strings are not similar. */
export function levenshteinRatio(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 0;
  return 1 - levenshteinDistance(a, b) / maxLen;
}
