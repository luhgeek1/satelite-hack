import pytest

from engine import load_scenario, simulate
from engine.export import build_result

pytestmark = pytest.mark.unit


@pytest.fixture(scope="module")
def exported(request):
    data_dir = request.config.rootpath.parent / "data"
    return build_result(simulate(load_scenario(data_dir / "03_satellite_outages.json")))


def test_schema_version(exported):
    assert exported["schema_version"] == "cosmo-A-result-1.0"


def test_one_record_per_instant_and_client(exported):
    assert len(exported["routes"]) == 720 * 3
    pairs = {(r["t_s"], r["client_id"]) for r in exported["routes"]}
    assert len(pairs) == 720 * 3


def test_paths_run_from_client_to_gateway(exported):
    for record in exported["routes"]:
        if not record["path"]:
            continue
        assert record["path"][0] == record["client_id"]
        assert record["path"][-1].startswith("G")


def test_missing_routes_are_empty_lists(exported):
    unroutable = [r for r in exported["routes"] if not r["path"]]
    assert unroutable, "this scenario is supposed to have outages"
    assert all(r["path"] == [] for r in unroutable)


def test_effective_scenario_round_trips(exported):
    from engine.scenario import validate_scenario

    validate_scenario(exported["effective_scenario"])


def test_summary_is_attached(exported):
    summary = exported["summary"]
    assert summary["steps"] == 720
    assert {c["client_id"] for c in summary["clients"]} == {"C65", "C70", "C72"}
