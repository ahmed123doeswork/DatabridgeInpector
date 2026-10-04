"""Anti-drift check (AGENTS.md rule 9): the Pydantic models in
backend/app/schemas.py must declare the same fields as the TS types in
frontend/src/types/contract.ts (compiled to shared/contract.schema.json via
`npm run gen:schema`). This catches a renamed/added/removed field on one side
of the stack that the other side didn't follow.
"""

from app import schemas
from tests.conftest import load_contract_schema

MODELS_BY_NAME = {
    "ImportJob": schemas.ImportJob,
    "ColumnMapping": schemas.ColumnMapping,
    "ValidationError": schemas.ValidationError,
    "DuplicateCandidate": schemas.DuplicateCandidate,
    "ScoreSignal": schemas.ScoreSignal,
    "NormalizationSuggestion": schemas.NormalizationSuggestion,
    "ExportResult": schemas.ExportResult,
}

ENUMS_BY_NAME = {
    "JobStatus": schemas.JobStatus,
    "ContactField": schemas.ContactField,
    "ConfidenceBand": schemas.ConfidenceBand,
}


def test_contract_schema_file_exists():
    schema = load_contract_schema()
    assert "definitions" in schema


def test_model_field_names_match_ts_contract():
    ts_schema = load_contract_schema()
    ts_defs = ts_schema["definitions"]

    mismatches = []
    for name, model in MODELS_BY_NAME.items():
        assert name in ts_defs, f"{name} missing from shared/contract.schema.json"
        ts_required = set(ts_defs[name].get("required", []))
        ts_properties = set(ts_defs[name].get("properties", {}).keys())

        py_schema = model.model_json_schema()
        py_required = set(py_schema.get("required", []))
        py_properties = set(py_schema.get("properties", {}).keys())

        if ts_properties != py_properties:
            mismatches.append(
                f"{name}: property mismatch — ts-only={ts_properties - py_properties}, "
                f"py-only={py_properties - ts_properties}"
            )
        if ts_required != py_required:
            mismatches.append(
                f"{name}: required mismatch — ts-only={ts_required - py_required}, "
                f"py-only={py_required - ts_required}"
            )

    assert not mismatches, "\n".join(mismatches)


def test_enum_members_match_ts_contract():
    ts_schema = load_contract_schema()
    ts_defs = ts_schema["definitions"]

    mismatches = []
    for name, enum_cls in ENUMS_BY_NAME.items():
        assert name in ts_defs, f"{name} missing from shared/contract.schema.json"
        ts_members = set(ts_defs[name]["enum"])
        py_members = {member.value for member in enum_cls}
        if ts_members != py_members:
            mismatches.append(
                f"{name}: ts-only={ts_members - py_members}, py-only={py_members - ts_members}"
            )

    assert not mismatches, "\n".join(mismatches)
