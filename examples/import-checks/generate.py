"""Build the scenario files that exercise the import checks.

Every file starts from the official `01_full_constellation.json` and changes
one thing, so the report for it has one obvious cause. `ok-*` files must load,
`bad-*` files must be refused with the field named in README.md.

    backend/.venv/bin/python examples/import-checks/generate.py

The result-file case runs the real engine, so this needs the backend venv.
"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(ROOT / "backend" / "src"))

from engine import apply_override, simulate  # noqa: E402
from engine.export import build_result  # noqa: E402
from engine.scenario import ConfigOverride  # noqa: E402

BASE = json.loads((ROOT / "data" / "01_full_constellation.json").read_text(encoding="utf-8"))


def scenario(meta_id: str, title: str) -> dict:
    s = copy.deepcopy(BASE)
    s["meta"] = {"id": meta_id, "title": title}
    return s


def write(name: str, document: object) -> None:
    (HERE / name).write_text(
        json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def write_raw(name: str, text: str) -> None:
    (HERE / name).write_text(text, encoding="utf-8")


# --- files that must load -----------------------------------------------------


def ok_other_constellation() -> dict:
    """What the jury is likely to bring: other ids, other sites, same format."""
    s = scenario("jury_like_arctic", "Другие пункты и идентификаторы")
    renames = {"P1": "ORB-A", "P2": "ORB-B", "P3": "ORB-C"}
    for plane in s["design"]["planes"]:
        plane["id"] = renames[plane["id"]]
    for index, sat in enumerate(s["design"]["satellites"], start=1):
        sat["id"] = f"SAT-{index:03d}"
        sat["plane_id"] = renames[sat["plane_id"]]
    s["ground_sites"] = [
        {"id": "GW-ARH", "name": "Архангельск, шлюз", "role": "gateway", "lat_deg": 64.54, "lon_deg": 40.52},
        {"id": "NRL", "name": "Норильск", "role": "client", "lat_deg": 69.35, "lon_deg": 88.2},
        {"id": "TKS", "name": "Тикси", "role": "client", "lat_deg": 71.64, "lon_deg": 128.87},
        {"id": "ANR", "name": "Анадырь", "role": "client", "lat_deg": 64.73, "lon_deg": 177.5},
        {"id": "DKS", "name": "Диксон", "role": "client", "lat_deg": 73.51, "lon_deg": 80.55},
    ]
    s["failures"] = [{"satellite_id": "SAT-020", "start_s": 21600, "end_s": 43200}]
    return s


def ok_two_days() -> dict:
    s = scenario("two_days_20s", "Двое суток с шагом 20 с (8640 шагов)")
    s["environment"].update(horizon_s=172_800, step_s=20)
    return s


def ok_empty_stage() -> dict:
    s = scenario("empty_first_stage", "На первом этапе ничего не запущено")
    for sat in s["design"]["satellites"]:
        sat["launch_batch"] = max(2, sat["launch_batch"])
    s["design"]["launch_stage"] = 1
    return s


def ok_outages() -> dict:
    s = scenario("outages_and_gateway", "Отказы спутников и простой шлюза")
    s["design"]["launch_stage"] = 2
    s["failures"] = [
        {"satellite_id": "S03", "start_s": 0, "end_s": 7200},
        {"satellite_id": "S03", "start_s": 3600, "end_s": 10800},
        {"satellite_id": "S18", "start_s": 43200, "end_s": 86400},
    ]
    s["gateway_outages"] = [{"gateway_id": "G_MUR", "start_s": 36000, "end_s": 39600}]
    return s


def ok_result_file() -> dict:
    s = apply_override(
        scenario("from_result_file", "Сценарий из файла результата"),
        ConfigOverride(launch_stage=2),
    )
    return build_result(simulate(s))


# --- files that must be refused ------------------------------------------------


def broken(meta_id: str, mutate) -> dict:
    s = scenario(meta_id, meta_id)
    mutate(s)
    return s


def many_problems(s: dict) -> None:
    s["environment"]["altitude_km"] = 100
    s["design"]["planes"][2]["raan_deg"] = 400
    s["design"]["satellites"][7]["plane_id"] = "P7"
    s["ground_sites"][1]["lon_deg"] = 200
    s["failures"] = [{"satellite_id": "S01", "start_s": 5000, "end_s": 4000}]


def flood(s: dict) -> None:
    for sat in s["design"]["satellites"]:
        sat["slot_deg"] = "north"
    s["failures"] = [
        {"satellite_id": "S01", "start_s": -60, "end_s": 60} for _ in range(12)
    ]


def too_many_satellites(s: dict) -> None:
    template = s["design"]["satellites"]
    s["design"]["satellites"] = [
        {**template[i % len(template)], "id": f"X{i:04d}"} for i in range(501)
    ]


def main() -> None:
    for old in HERE.glob("*.json"):
        old.unlink()

    write("ok-01-other-sites-and-ids.json", ok_other_constellation())
    write("ok-02-two-days-20s-step.json", ok_two_days())
    write("ok-03-empty-stage-warning.json", ok_empty_stage())
    write("ok-04-outages-and-gateway.json", ok_outages())
    write("ok-05-result-file.json", ok_result_file())

    base_text = json.dumps(scenario("not_json", "x"), ensure_ascii=False, indent=2)
    write_raw("bad-01-not-json.json", base_text[: len(base_text) // 2])
    write("bad-02-list-not-object.json", [scenario("in_a_list", "x")])
    write("bad-03-wrong-schema-version.json", broken("v2", lambda s: s.update(schema_version="cosmo-A-2.0")))
    write("bad-04-no-meta.json", broken("no_meta", lambda s: s.pop("meta")))
    write("bad-05-no-step.json", broken("no_step", lambda s: s["environment"].pop("step_s")))
    write_raw(
        "bad-06-step-with-decimal-point.json",
        json.dumps(scenario("step_float", "x"), ensure_ascii=False, indent=2).replace(
            '"step_s": 120', '"step_s": 120.0'
        ),
    )
    write("bad-07-horizon-not-multiple.json", broken("grid", lambda s: s["environment"].update(step_s=7)))
    write("bad-08-altitude-out-of-range.json", broken("alt", lambda s: s["environment"].update(altitude_km=100)))
    write("bad-09-number-as-string.json", broken("str", lambda s: s["environment"].update(altitude_km="550")))
    write("bad-10-phase-out-of-range.json", broken("phase", lambda s: s["design"]["planes"][1].update(phase_deg=-5)))
    write("bad-11-duplicate-plane-id.json", broken("dup_plane", lambda s: s["design"]["planes"][1].update(id="P1")))
    write("bad-12-unknown-plane.json", broken("ref", lambda s: s["design"]["satellites"][12].update(plane_id="P9")))
    write("bad-13-duplicate-satellite-id.json", broken("dup_sat", lambda s: s["design"]["satellites"][12].update(id="S01")))
    write("bad-14-launch-batch-4.json", broken("batch", lambda s: s["design"]["satellites"][40].update(launch_batch=4)))
    write("bad-15-launch-stage-0.json", broken("stage", lambda s: s["design"].update(launch_stage=0)))
    write("bad-16-latitude-95.json", broken("lat", lambda s: s["ground_sites"][2].update(lat_deg=95)))
    write("bad-17-unknown-role.json", broken("role", lambda s: s["ground_sites"][2].update(role="relay")))
    write("bad-18-site-id-is-satellite-id.json", broken("collide", lambda s: s["ground_sites"][2].update(id="S05")))
    write(
        "bad-19-no-gateway.json",
        broken("no_gw", lambda s: [g.update(role="client") for g in s["ground_sites"]]),
    )
    write(
        "bad-20-failure-unknown-satellite.json",
        broken("fail_ref", lambda s: s.update(failures=[{"satellite_id": "S99", "start_s": 0, "end_s": 3600}])),
    )
    write(
        "bad-21-failure-past-horizon.json",
        broken("fail_late", lambda s: s.update(failures=[{"satellite_id": "S01", "start_s": 80000, "end_s": 90000}])),
    )
    write(
        "bad-22-failure-empty-interval.json",
        broken("fail_empty", lambda s: s.update(failures=[{"satellite_id": "S01", "start_s": 3600, "end_s": 3600}])),
    )
    write(
        "bad-23-gateway-outage-on-client.json",
        broken("gw_client", lambda s: s.update(gateway_outages=[{"gateway_id": "C65", "start_s": 0, "end_s": 3600}])),
    )
    write(
        "bad-24-too-many-steps.json",
        broken("heavy", lambda s: s["environment"].update(horizon_s=172_800, step_s=10)),
    )
    write("bad-25-too-many-satellites.json", broken("crowd", too_many_satellites))
    write("bad-26-five-problems-at-once.json", broken("many", many_problems))
    write("bad-27-sixty-problems.json", broken("flood", flood))
    write(
        "bad-28-result-file-without-scenario.json",
        {"schema_version": "cosmo-A-result-1.0", "routes": []},
    )

    print(f"wrote {len(list(HERE.glob('*.json')))} files to {HERE}")


if __name__ == "__main__":
    main()
