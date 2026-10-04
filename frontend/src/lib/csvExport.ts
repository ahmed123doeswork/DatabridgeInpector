// Pure CSV serialization (RFC-4180-ish quoting). Formula-injection
// neutralization is applied by the caller per-field BEFORE building rows —
// see docs/adr/0003-csv-injection-handling.md for why the "phone" field is
// exempted (a leading '+' there is a legitimate E.164 country code, not a
// formula-injection risk).

function escapeCsvField(raw: string): string {
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((row) => row.map(escapeCsvField).join(","));
  return lines.join("\n") + "\n";
}
