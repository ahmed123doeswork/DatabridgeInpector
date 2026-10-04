from app.csv_injection import is_formula_injection_risk, is_formula_injection_risk_for_field
from tests.conftest import load_expected_json


def test_matches_expected_findings_for_formula_injection_csv(client):
    job_id = client.create_job_from_fixture("formula_injection.csv", "formula-injection-key")
    client.set_default_mapping(job_id)
    job = client.validate(job_id)

    expected = load_expected_json("validate_errors.expected.json")["formula_injection.csv"]
    findings = {(e["rowId"], e["field"]) for e in job["validationErrors"] if e["code"] == "formula_injection_risk"}

    for finding in expected["expectedFindings"]:
        assert (finding["rowId"], finding["field"]) in findings

    for clean_row_id in expected["expectedCleanRowIds"]:
        assert not any(rowId == clean_row_id for rowId, _ in findings)


def test_export_neutralizes_risky_cells_with_leading_quote(client):
    job_id = client.create_job_from_fixture("formula_injection.csv", "formula-injection-export-key")
    client.set_default_mapping(job_id)
    client.validate(job_id)
    client.get_duplicates(job_id)
    export_result = client.export(job_id)

    lines = export_result["csvContent"].splitlines()
    header = lines[0].split(",")
    first_name_idx = header.index("firstName")
    last_name_idx = header.index("lastName")

    # row-1 firstName was '=HYPERLINK(...)' — must be neutralized.
    row1 = lines[1]
    assert row1.split(",", 1)[1].lstrip('"').startswith("'=HYPERLINK")

    # row-2 lastName was '+CMD(calc.exe)' — must be neutralized.
    row2_fields = _split_csv_row(lines[2])
    assert row2_fields[last_name_idx] == "'+CMD(calc.exe)"


def test_phone_field_is_never_neutralized_even_with_leading_plus():
    # A phone's leading '+' is a legitimate country code, not a formula.
    assert is_formula_injection_risk("+1 415-555-0101") is True  # generic check still flags it
    assert is_formula_injection_risk_for_field("phone", "+1 415-555-0101") is False  # field-aware check exempts it


def _split_csv_row(line: str) -> list[str]:
    import csv
    import io

    return next(csv.reader(io.StringIO(line)))
