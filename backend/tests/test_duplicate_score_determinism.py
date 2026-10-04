from app.scoring import find_duplicate_candidates
from tests.conftest import load_expected_json, load_fixture_csv
from tests.helpers import fixture_rows_from_csv


def test_matches_hand_computed_expected_pairs():
    rows = fixture_rows_from_csv(load_fixture_csv("duplicates.csv"))
    expected = load_expected_json("duplicates.expected.json")

    candidates = find_duplicate_candidates(rows)
    by_pair = {(c.rowIdA, c.rowIdB): c for c in candidates}

    for expected_pair in expected["expectedPairs"]:
        key = (expected_pair["rowIdA"], expected_pair["rowIdB"])
        assert key in by_pair, f"expected pair {key} not found"
        found = by_pair[key]
        assert found.score == expected_pair["score"]
        assert found.confidenceBand.value == expected_pair["confidenceBand"]
        assert [s.model_dump() for s in found.signals] == expected_pair["signals"]
        assert found.reasonSummary == expected_pair["reasonSummary"]

    for pruned in expected["prunedPairs"]:
        key = (pruned["rowIdA"], pruned["rowIdB"])
        assert key not in by_pair, f"pruned pair {key} should not be surfaced"


def test_deterministic_across_repeated_runs():
    rows = fixture_rows_from_csv(load_fixture_csv("duplicates.csv"))
    run1 = find_duplicate_candidates(rows)
    run2 = find_duplicate_candidates(rows)
    assert [c.model_dump() for c in run1] == [c.model_dump() for c in run2]


def test_deterministic_via_live_api(client):
    job_id = client.create_job_from_fixture("duplicates.csv", "determinism-key")
    client.set_default_mapping(job_id)
    client.validate(job_id)

    job_run1 = client.get_duplicates(job_id)
    job_run2 = client.get_duplicates(job_id)
    assert job_run1["duplicates"] == job_run2["duplicates"]


def test_never_scores_a_phone_signal_when_either_side_is_ambiguous():
    ambiguous_rows = fixture_rows_from_csv(load_fixture_csv("ambiguous_phones.csv"))
    clean_rows = fixture_rows_from_csv(load_fixture_csv("clean.csv"))[:2]
    candidates = find_duplicate_candidates([*ambiguous_rows, *clean_rows])
    for candidate in candidates:
        for signal in candidate.signals:
            assert signal.signal not in ("phone_normalized_exact", "phone_last7_match")
