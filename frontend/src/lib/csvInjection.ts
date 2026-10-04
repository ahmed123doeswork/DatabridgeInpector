// CSV formula-injection detection/neutralization per OWASP guidance.
// AGENTS.md rule 5: flagged in validation, neutralized on export, identical
// behavior on both export paths (browser + backend).
//
// The "phone" field is exempted: a leading '+' there is a legitimate E.164
// country code (e.g. "+1 415-555-0101"), not a formula-injection attempt.
// Flagging/neutralizing every international phone number would bury the
// real signal in noise and corrupt exported phone data. See
// docs/adr/0003-csv-injection-handling.md.

const RISKY_LEADING_CHARS = ["=", "+", "-", "@"];
export const FIELDS_EXEMPT_FROM_INJECTION_CHECK = new Set(["phone"]);

export function isFormulaInjectionRisk(value: string): boolean {
  if (value.length === 0) return false;
  return RISKY_LEADING_CHARS.includes(value[0]);
}

export function isFormulaInjectionRiskForField(field: string, value: string): boolean {
  if (FIELDS_EXEMPT_FROM_INJECTION_CHECK.has(field)) return false;
  return isFormulaInjectionRisk(value);
}

/** Prefixes a risky cell with a single quote so spreadsheet apps treat it as text. */
export function neutralizeFormulaInjection(value: string): string {
  return isFormulaInjectionRisk(value) ? `'${value}` : value;
}

export function neutralizeFormulaInjectionForField(field: string, value: string): string {
  if (FIELDS_EXEMPT_FROM_INJECTION_CHECK.has(field)) return value;
  return neutralizeFormulaInjection(value);
}
