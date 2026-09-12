"""Independent check of OrbitGuard's calculations against the case documents.

Everything in the first half of this file is written from the formulas in
«Описание данных» and imports nothing from the project: positions, elevation,
the ISL occlusion test, the active set, BFS routing with clients that never
relay, and the result metrics. The second half puts those numbers next to

  1. the organisers' own geometry.py (positions and every contact),
  2. the service engine (visibility, availability, longest outage, hops),
  3. the official export cosmo-A-result-1.0 (one record per instant and client,
     every path a chain of contacts that exist at that instant).

Run from the repository root:

    backend/.venv/bin/python verification/verify.py            # all scenarios in data/
    backend/.venv/bin/python verification/verify.py my.json    # any file of the same format

Only numpy is needed for part one; parts two and three import backend/src.
Exit code is 0 when every check passes, 1 otherwise.
"""

from __future__ import annotations

import json
import math
import sys
from collections import deque
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "src"))

# Constants exactly as printed in «Описание данных», section «Координаты спутников».
R_EARTH_KM = 6371.0
MU_KM3_S2 = 398600.435507
T_EARTH_S = 86164.09054


# --------------------------------------------------------------------------- #
# Part one: the case formulas, written from the PDF                            #
# --------------------------------------------------------------------------- #


def satellite_positions(scenario: dict, t_s: float) -> tuple[list[str], np.ndarray]:
    """Earth-fixed coordinates [km] of every satellite at t_s."""
    env, design = scenario["environment"], scenario["design"]
    planes = {p["id"]: p for p in design["planes"]}
    r = R_EARTH_KM + env["altitude_km"]
    n = math.sqrt(MU_KM3_S2 / r**3)
    i = math.radians(env["inclination_deg"])
    theta = math.radians(env["earth_angle0_deg"]) + 2 * math.pi * t_s / T_EARTH_S

    ids, coords = [], []
    for sat in design["satellites"]:
        plane = planes[sat["plane_id"]]
        omega = math.radians(plane["raan_deg"])
        u = math.radians(sat["slot_deg"] + plane["phase_deg"]) + n * t_s
        x = r * (math.cos(omega) * math.cos(u) - math.sin(omega) * math.sin(u) * math.cos(i))
        y = r * (math.sin(omega) * math.cos(u) + math.cos(omega) * math.sin(u) * math.cos(i))
        z = r * math.sin(u) * math.sin(i)
        xe = math.cos(theta) * x + math.sin(theta) * y
        ye = -math.sin(theta) * x + math.cos(theta) * y
        ids.append(sat["id"])
        coords.append((xe, ye, z))
    return ids, np.array(coords)


def ground_position(site: dict) -> np.ndarray:
    lat, lon = math.radians(site["lat_deg"]), math.radians(site["lon_deg"])
    return R_EARTH_KM * np.array(
        [math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)]
    )


def elevation_deg(sat: np.ndarray, ground: np.ndarray) -> float:
    d = sat - ground
    value = float(np.dot(d, ground) / (np.linalg.norm(d) * R_EARTH_KM))
    return math.degrees(math.asin(max(-1.0, min(1.0, value))))


def isl_available(a: np.ndarray, b: np.ndarray, range_km: float) -> bool:
    d = b - a
    dd = float(np.dot(d, d))
    if dd == 0.0:
        closest = float(np.linalg.norm(a))
    else:
        q = min(1.0, max(0.0, -float(np.dot(a, d)) / dd))
        closest = float(np.linalg.norm(a + q * d))
    return float(np.linalg.norm(d)) < range_km and closest > R_EARTH_KM


def in_window(t_s: float, start_s: float, end_s: float) -> bool:
    """Start included, end excluded."""
    return start_s <= t_s < end_s


def contacts(scenario: dict, t_s: float) -> set[frozenset[str]]:
    """Every bidirectional contact available at t_s."""
    env, design = scenario["environment"], scenario["design"]
    ids, xyz = satellite_positions(scenario, t_s)
    batch = {s["id"]: s["launch_batch"] for s in design["satellites"]}
    failed = {
        f["satellite_id"]
        for f in scenario["failures"]
        if in_window(t_s, f["start_s"], f["end_s"])
    }
    active = [batch[sid] <= design["launch_stage"] and sid not in failed for sid in ids]

    links: set[frozenset[str]] = set()
    for a in range(len(ids)):
        for b in range(a + 1, len(ids)):
            if active[a] and active[b] and isl_available(xyz[a], xyz[b], env["isl_range_km"]):
                links.add(frozenset((ids[a], ids[b])))

    for site in scenario["ground_sites"]:
        offline = site["role"] == "gateway" and any(
            o["gateway_id"] == site["id"] and in_window(t_s, o["start_s"], o["end_s"])
            for o in scenario["gateway_outages"]
        )
        if offline:
            continue
        g = ground_position(site)
        for k, sid in enumerate(ids):
            if active[k] and elevation_deg(xyz[k], g) >= env["min_elevation_deg"]:
                links.add(frozenset((site["id"], sid)))
    return links


def shortest_path(links: set[frozenset[str]], client: str, gateways: set[str],
                  ground: set[str]) -> list[str]:
    """Fewest-hop path client → satellites → gateway; ground sites never relay."""
    neighbours: dict[str, list[str]] = {}
    for link in links:
        a, b = tuple(link)
        neighbours.setdefault(a, []).append(b)
        neighbours.setdefault(b, []).append(a)

    parent = {client: None}
    queue = deque([client])
    while queue:
        node = queue.popleft()
        if node in gateways:
            path = [node]
            while parent[path[-1]] is not None:
                path.append(parent[path[-1]])
            return path[::-1]
        if node != client and node in ground:
            continue
        for nxt in neighbours.get(node, ()):
            if nxt not in parent and (nxt not in ground or nxt in gateways):
                parent[nxt] = node
                queue.append(nxt)
    return []


def independent_metrics(scenario: dict) -> dict[str, dict]:
    env = scenario["environment"]
    grid = range(0, env["horizon_s"], env["step_s"])
    clients = [s["id"] for s in scenario["ground_sites"] if s["role"] == "client"]
    gateways = {s["id"] for s in scenario["ground_sites"] if s["role"] == "gateway"}
    ground = {s["id"] for s in scenario["ground_sites"]}

    visible = {c: 0 for c in clients}
    routed = {c: 0 for c in clients}
    run = {c: 0 for c in clients}
    longest = {c: 0 for c in clients}
    hops: dict[str, list[int]] = {c: [] for c in clients}

    for t_s in grid:
        links = contacts(scenario, t_s)
        for c in clients:
            if any(c in link for link in links):
                visible[c] += 1
            path = shortest_path(links, c, gateways, ground)
            if path:
                routed[c] += 1
                hops[c].append(len(path) - 1)  # edges, both ground links included
                run[c] = 0
            else:
                run[c] += 1
                longest[c] = max(longest[c], run[c])

    steps = len(grid)
    return {
        c: {
            "visibility": visible[c] / steps,
            "availability": routed[c] / steps,
            "max_outage_s": longest[c] * env["step_s"],
            "avg_hops": sum(hops[c]) / len(hops[c]) if hops[c] else None,
        }
        for c in clients
    }


# --------------------------------------------------------------------------- #
# Part two: put the independent numbers next to the project                    #
# --------------------------------------------------------------------------- #


class Report:
    def __init__(self) -> None:
        self.failures = 0

    def check(self, ok: bool, label: str, detail: str = "") -> None:
        mark = "PASS" if ok else "FAIL"
        self.failures += 0 if ok else 1
        print(f"  [{mark}] {label}" + (f" — {detail}" if detail else ""))


def check_geometry(scenario: dict, report: Report) -> None:
    from engine import geometry

    env = scenario["environment"]
    samples = sorted({0, env["step_s"], env["horizon_s"] // 2, env["horizon_s"] - env["step_s"]})
    worst_km = 0.0
    same_contacts = True
    for t_s in samples:
        ids, ours = satellite_positions(scenario, t_s)
        snap = geometry.snapshot(scenario, t_s)
        theirs = np.array([[s["x_km"], s["y_km"], s["z_km"]] for s in snap["satellites"]])
        worst_km = max(worst_km, float(np.max(np.abs(ours - theirs))))
        their_links = {frozenset((a, b)) for a, b, _ in snap["edges"]}
        same_contacts &= their_links == contacts(scenario, t_s)
    report.check(worst_km < 1e-6, "coordinates match geometry.py",
                 f"max deviation {worst_km:.2e} km at t = {samples} s")
    report.check(same_contacts, "ground and ISL contacts match geometry.py, edge for edge")


def check_engine(scenario: dict, report: Report) -> dict[str, dict]:
    from engine import simulate

    ours = independent_metrics(scenario)
    result = simulate(scenario)
    target = scenario["environment"]["target_availability"]

    print(f"  {'client':<8}{'visibility':>12}{'availability':>14}{'max outage':>12}"
          f"{'avg hops':>10}  {'≥ target':<9}engine")
    differing = 0
    for client, m in ours.items():
        e = result.metrics[client]
        agree = (
            abs(m["visibility"] - e.visibility) < 1e-9
            and abs(m["availability"] - e.availability) < 1e-9
            and m["max_outage_s"] == e.max_outage_s
            and (m["avg_hops"] is None) == (e.avg_hops is None)
            and (m["avg_hops"] is None or abs(m["avg_hops"] - e.avg_hops) < 1e-9)
        )
        hops = "—" if m["avg_hops"] is None else f"{m['avg_hops']:.2f}"
        print(f"  {client:<8}{m['visibility']:>11.2%} {m['availability']:>13.2%}"
              f"{m['max_outage_s'] / 60:>9.0f} min{hops:>10}  "
              f"{'yes' if m['availability'] >= target else 'no':<9}{'same' if agree else 'DIFFERS'}")
        differing += 0 if agree else 1
    report.check(differing == 0, "engine metrics equal the independent recomputation for every client")
    return {"result": result}


def check_export(scenario: dict, result, report: Report) -> None:
    from engine import geometry
    from engine.export import build_result

    payload = json.loads(json.dumps(build_result(result)))
    env = scenario["environment"]
    grid = list(range(0, env["horizon_s"], env["step_s"]))
    clients = [s["id"] for s in scenario["ground_sites"] if s["role"] == "client"]
    gateways = {s["id"] for s in scenario["ground_sites"] if s["role"] == "gateway"}

    report.check(payload["schema_version"] == "cosmo-A-result-1.0", "schema_version is cosmo-A-result-1.0")
    report.check(payload["effective_scenario"] == scenario, "effective_scenario is the scenario that was run")
    pairs = [(r["t_s"], r["client_id"]) for r in payload["routes"]]
    report.check(
        len(pairs) == len(set(pairs)) == len(grid) * len(clients),
        "one record per (t_s, client_id)",
        f"{len(pairs)} = {len(grid)} instants × {len(clients)} clients",
    )

    broken = 0
    by_time: dict[int, list[dict]] = {}
    for record in payload["routes"]:
        by_time.setdefault(record["t_s"], []).append(record)
    for t_s, records in by_time.items():
        links = {frozenset((a, b)) for a, b, _ in geometry.snapshot(scenario, t_s)["edges"]}
        for record in records:
            path = record["path"]
            if not path:
                continue
            chain_ok = all(frozenset(pair) in links for pair in zip(path, path[1:]))
            relays = set(path[1:-1]) & {s["id"] for s in scenario["ground_sites"]}
            if path[0] != record["client_id"] or path[-1] not in gateways or not chain_ok or relays:
                broken += 1
    report.check(broken == 0, "every exported path is client → satellites → gateway over contacts that exist",
                 f"{broken} broken paths")


def verify(path: Path, report: Report) -> None:
    from engine import load_scenario

    scenario = load_scenario(path)
    print(f"\n{path.name} — {scenario['meta'].get('title', '')}")
    check_geometry(scenario, report)
    result = check_engine(scenario, report)["result"]
    check_export(scenario, result, report)


def main(argv: list[str]) -> int:
    paths = [Path(a) for a in argv] or sorted((ROOT / "data").glob("*.json"))
    report = Report()
    for path in paths:
        verify(path, report)
    print("\nAll checks passed." if report.failures == 0 else f"\n{report.failures} check(s) failed.")
    return 0 if report.failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
