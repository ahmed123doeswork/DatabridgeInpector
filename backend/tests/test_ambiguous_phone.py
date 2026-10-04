from app.normalize import normalize_phone
from tests.conftest import load_fixture_csv
from tests.helpers import fixture_rows_from_csv


def test_every_row_in_ambiguous_phones_csv_is_flagged_ambiguous():
    rows = fixture_rows_from_csv(load_fixture_csv("ambiguous_phones.csv"))
    for row in rows:
        assert normalize_phone(row.phone).ambiguous is True


def test_explicit_country_code_is_not_ambiguous():
    assert normalize_phone("+1 415-555-0101").ambiguous is False


def test_ambiguous_phone_never_gets_a_guessed_country_code():
    # normalize_phone must never invent a '+<countrycode>' prefix for a
    # number that didn't already have one (AGENTS.md rule 1).
    for raw in ["555-0101", "0171 1234567", "07911 123456", "2125550123"]:
        result = normalize_phone(raw)
        assert result.ambiguous is True
        assert not result.normalized.startswith("+")


def test_ambiguous_phone_is_flagged_as_a_validation_warning_via_the_api(client):
    job_id = client.create_job_from_fixture("ambiguous_phones.csv", "ambiguous-phone-key")
    client.set_default_mapping(job_id)
    job = client.validate(job_id)
    ambiguous_findings = [e for e in job["validationErrors"] if e["code"] == "ambiguous_phone"]
    assert len(ambiguous_findings) == 6
    for finding in ambiguous_findings:
        assert finding["severity"] == "warning"
