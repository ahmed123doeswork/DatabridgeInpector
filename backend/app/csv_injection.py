"""CSV formula-injection detection/neutralization per OWASP guidance.
Ported 1:1 from frontend/src/lib/csvInjection.ts (AGENTS.md rule 5).

The "phone" field is exempted: a leading '+' there is a legitimate E.164
country code (e.g. "+1 415-555-0101"), not a formula-injection attempt.
Flagging/neutralizing every international phone number would bury the real
signal in noise and corrupt exported phone data. See
docs/adr/0003-csv-injection-handling.md.
"""

_RISKY_LEADING_CHARS = {"=", "+", "-", "@"}
FIELDS_EXEMPT_FROM_INJECTION_CHECK = {"phone"}


def is_formula_injection_risk(value: str) -> bool:
    if not value:
        return False
    return value[0] in _RISKY_LEADING_CHARS


def is_formula_injection_risk_for_field(field: str, value: str) -> bool:
    if field in FIELDS_EXEMPT_FROM_INJECTION_CHECK:
        return False
    return is_formula_injection_risk(value)


def neutralize_formula_injection(value: str) -> str:
    return f"'{value}" if is_formula_injection_risk(value) else value


def neutralize_formula_injection_for_field(field: str, value: str) -> str:
    if field in FIELDS_EXEMPT_FROM_INJECTION_CHECK:
        return value
    return neutralize_formula_injection(value)
