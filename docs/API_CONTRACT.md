# Frontend ↔ backend contract

Base URL `/api/v1`. Interactive docs at `/api/docs`, machine-readable schema at
`/api/openapi.json` (dump a copy with `make api-spec`).

This document is the agreement. Where it disagrees with
`frontend/BACKEND_API.md`, this wins — §9 lists what changed and why.

---

## 1. Conventions

| Thing | Convention | Example |
|---|---|---|
| Keys | `snake_case` | `client_id`, `max_outage_s` |
| Time | **seconds from the start of the run**, `t_s` | `21600` = 06:00 |
| Angles | degrees | `raan_deg: 60.0` |
| Distance | kilometres | `distance_km: 2700.44` |
| Availability, visibility, shares | **fraction 0…1** | `0.966667` → render as `96.7%` |
| Durations | seconds | `max_outage_s: 480` → render as `8 min` |

Two choices worth stating outright, because they differ from the first draft:

**Seconds, not minutes.** The official export format uses `t_s`, and a scenario
the jury uploads may use a step that does not divide into whole minutes. Minutes
would force rounding into the one place that has to stay exact. Convert at the
edge: `minutes = t_s / 60`.

**Fractions, not percent.** One representation end to end, formatted once in the
UI. `0.966667` never has to be un-rounded.

**Identifiers are opaque.** `S01`, `P1`, `C65`, `G_MUR` are what the *current*
files happen to contain. The jury will upload a file with **different ground-site
coordinates and possibly different ids** — confirmed at the Q&A. Never hardcode
them, never assume 48 satellites, 3 planes, 3 clients, one gateway, or a 120 s
step. Everything is derived from the scenario.

---

## 2. Errors

Any non-2xx returns an RFC 9457 problem document:

```jsonc
{
  "type": "about:blank",
  "title": "Unprocessable Entity",
  "status": 422,
  "detail": "Missing required section 'environment'",
  "error_code": "SCENARIO_INVALID",
  "instance": "/api/v1/scenarios",
  "timestamp": "2026-09-12T04:41:07.021Z",
  "request_id": "9f1c…",
  "details": { "field": "environment" }       // present when we can point at one
}
```

Show `detail` to the user. `details.field` is the JSON path to highlight in the
import dialog — the case requires the service to say what to fix.

Codes you will meet: `SCENARIO_INVALID`, `NOT_FOUND`, `BAD_REQUEST`,
`PAYLOAD_TOO_LARGE`, `CONFLICT`, `REQUEST_VALIDATION_ERROR`.

---

## 3. Scenarios

```
GET    /scenarios                        list
GET    /scenarios/{id}                   summary + the original document
GET    /scenarios/{id}/download          the cosmo-A-1.0 file, as a download
POST   /scenarios                        import from a JSON body   → 201
POST   /scenarios/upload                 import from multipart file → 201
POST   /scenarios/validate               dry run, never throws
DELETE /scenarios/{id}                   imported scenarios only    → 204
GET    /scenarios/site-profiles          named surroundings profiles for ground sites
```

`GET /scenarios/site-profiles` serves the defaults behind the surroundings
picker so the numbers live in the engine and nowhere else:

```jsonc
[ { "id": "urban", "mask_deg": 25.0, "altitude_m": 0.0,
    "rationale": "Mid-rise blocks a street away: anything below about 25 degrees is behind a wall." } ]
```

A ground site in a scenario may carry our extension block, which the official
validator ignores and ours checks:

```jsonc
{ "id": "C65", "role": "client", "lat_deg": 65.0, "lon_deg": 60.0,
  "site_conditions": { "profile": "urban", "mask_deg": 25.0,
                       "altitude_m": 120, "azimuth_mask": [[0, 35], [180, 12]] } }
```

The four official scenarios are seeded at startup and cannot be deleted
(`source: "official"`).

```jsonc
// GET /scenarios → [ … ]
{
  "id": "01_full_constellation",
  "title": "Полная группировка",
  "source": "official",              // "official" | "imported"
  "satellite_count": 48,
  "plane_count": 3,
  "client_count": 3,
  "gateway_count": 1,
  "launch_stage": 3,
  "horizon_s": 86400,
  "step_s": 120,
  "steps": 720,
  "target_availability": 0.9,
  "created_at": "2026-09-12T04:41:05.123456+00:00"
}
```

`POST /scenarios/validate` always returns 200 with a verdict — use it to check a
file before committing to an import:

```jsonc
{ "valid": false, "error": "Unsupported schema_version 'nope'", "field": "schema_version" }
```

---

## 4. Running a simulation

```
POST /simulations
```

**Synchronous.** A full 720-instant run takes ~0.15 s, so there is no job to
poll. Send exactly one of `scenario_id` or `scenario` (inline lets the jury load
a file and run it in a single request, with no import step to fail in between).

```jsonc
{
  "scenario_id": "01_full_constellation",
  "strategy": "min_hops",             // "min_hops" (default) | "min_distance"
  "label": "Baseline",                // optional, for your own bookkeeping
  "config": {
    "launch_stage": 3,                // omit to keep the scenario's value
    "planes": {                       // omit a plane or a field to keep it
      "P2": { "raan_deg": 56.0, "phase_deg": 13.0 }
    },
    "failures": [                     // REPLACES the list when present
      { "satellite_id": "S15", "start_s": 21600, "end_s": 86400 }
    ],
    "gateway_outages": [],            // same semantics
    "sites": {                        // surroundings per ground site
      "C65": { "profile": "urban" },                    // profile default mask
      "G_MUR": { "profile": "custom", "mask_deg": 18 }, // your own number
      "C70": null                                       // clear the file's block
    },
    "isl_range_km": 2700              // environment block — see below
  }
}
```

`failures` and `gateway_outages` **replace** the scenario's lists rather than
appending, so the panel can own the whole list without add/remove verbs. Omit
the key to leave the scenario's own list untouched; send `[]` to clear it.

`sites` sets what surrounds a site: a named profile (`open`, `sea`, `forest`,
`urban`, `mountain`) or `custom` with `mask_deg`, plus optional `altitude_m`
and an `azimuth_mask` horizon profile. The effective mask is
`max(scenario mask, local mask)`, so surroundings only ever remove ground
links. Sites not named keep whatever the file says; `null` clears a block the
file carried. This is **not** a sensitivity study: the constellation is the
same and the assumption about the site is what changed, so the run is flagged
`site_conditions_active`, not `environment_modified`.

The environment keys (`isl_range_km`, `min_elevation_deg`, `altitude_km`,
`inclination_deg`, `step_s`, `horizon_s`) are separated on purpose. The case says
variants are compared at a fixed altitude, ISL range and elevation mask, so
touching them marks the run as a **sensitivity study**, not a design variant —
the response sets `environment_modified: true` and the UI should label it.

### Response

```jsonc
{
  "id": "sim_7a3f9c1e5b2d4a8f6c01",
  "scenario_id": "01_full_constellation",
  "label": null,
  "strategy": "min_hops",
  "created_at": "2026-09-12T04:41:06.882Z",

  "target_availability": 0.9,
  "step_s": 120,
  "horizon_s": 86400,
  "steps": 720,

  "worst_availability": 0.966667,     // what the 90% target is judged on
  "mean_availability": 0.981019,
  "meets_target": true,

  "clients": [
    {
      "client_id": "C65",
      "name": "Northern terminal 65",
      "visibility": 0.977778,          // a satellite was in view
      "availability": 0.966667,        // …and a route to the gateway existed
      "meets_target": true,
      "max_outage_s": 480,
      "max_bounded_outage_s": 480,     // excludes gaps touching the horizon ends
      "leading_outage_s": 0,
      "trailing_outage_s": 0,
      "avg_hops": 2.287356,
      "min_hops": 2,
      "max_hops": 4,
      "outage_reasons": { "network_partition": 18, "no_visible_satellite": 6 },
      "site_profile": null,            // "urban" etc. when surroundings apply
      "effective_mask_deg": 10.0,      // scenario mask, or the local one if higher
      "masked_share": 0.0,             // instants a satellite cleared the scenario mask but the surroundings hid every one
      "outage_windows": [
        {
          "client_id": "C65", "start_s": 22200, "end_s": 22680, "duration_s": 480,
          "reason": "network_partition", "leading": false, "trailing": false
        }
      ]
    }
  ],

  "config": { /* echoed back */ },
  "environment_modified": false,
  "site_conditions_active": false,
  "effective_scenario": { /* the full cosmo-A-1.0 document as actually run */ },
  "compute_ms": 148.3
}
```

`visibility` vs `availability` is the case's central point — a client can see a
satellite and still have no route. Show both.

`outage_windows` is what the timeline draws, and each window is directly
clickable: jump the timeline to `start_s` and fetch the snapshot there. The
organisers named this flow explicitly ("перейти к этим разрывам и посмотреть, как
в этот момент станция связывается со шлюзом").

**Runs are content-addressed.** The id is a hash of the effective scenario plus
the strategy, so re-posting an identical configuration returns the same `id`
without recomputing. Dragging a slider back to where it was is free.

---

## 5. Reading a run

```
GET /simulations/{run_id}                       the summary again
GET /simulations/{run_id}/snapshot?t_s=21600    one instant
GET /simulations/{run_id}/ephemeris[?step_s=]   positions over the horizon
GET /simulations/{run_id}/availability          per-instant state for the strip
GET /simulations/{run_id}/routes/{client_id}    every instant's route, one client
GET /simulations/{run_id}/export                official cosmo-A-result-1.0
GET /simulations/{run_id}/scenario              the effective scenario, as a file
```

### Snapshot — what the globe draws at the current timeline position

~13 KB, cached. `t_s` is snapped **down** to a real calculation instant, so an
arbitrary scrub position is always valid.

```jsonc
{
  "t_s": 0,
  "satellites": [
    {
      "id": "S01",
      "lat_deg": 0.0, "lon_deg": -12.0, "alt_km": 550.0,   // for the globe
      "x_km": 6772.0, "y_km": -1439.4, "z_km": 0.0,        // as geometry.py emits
      "active": true
    }
  ],
  "edges": [
    { "source": "S01", "target": "S16", "distance_km": 2700.44, "type": "isl" },
    { "source": "C65", "target": "S20", "distance_km": 1284.1, "type": "ground" },
    { "source": "S20", "target": "G_MUR", "distance_km": 1227.9, "type": "gateway" }
  ],
  "routes": [
    {
      "client_id": "C65", "available": true,
      "path": ["C65", "S20", "G_MUR"],
      "hops": 2,                       // edges, including both ground links
      "distance_km": 2512.046,
      "reason": null, "gateway_id": "G_MUR"
    },
    {
      "client_id": "C70", "available": false, "path": [], "hops": null,
      "distance_km": null, "gateway_id": null,
      "reason": "network_partition"
    }
  ],
  "elevation_deg": { "C65": { "S20": 47.3, "S21": 12.8 } },
  "offline_gateways": [],
  "masked_satellites": { "C65": ["S21"] },   // above the scenario mask, behind the site's horizon
  "active_satellites": 48,
  "total_satellites": 48
}
```

`reason` is one of four values, and the case requires the UI to distinguish them:

| value | what to tell the user |
|---|---|
| `no_visible_satellite` | No satellite above the elevation mask |
| `network_partition` | Satellite in view, but the mesh cannot reach the gateway |
| `no_gateway_contact` | No satellite can currently see the gateway |
| `gateway_unavailable` | The gateway itself is in an outage window |

`masked_satellites` lists, per site with surroundings, the satellites
`geometry.py` considers in view that the local horizon hides. They are absent
from `edges`; the globe draws them dashed so "no satellite overhead" and "a
satellite overhead the site cannot use" read differently.

`edges` carries `type` so links can be drawn differently even though the graph is
homogeneous internally. Note the ISL example: **2700.44 km** is the distance
between in-plane neighbours at 16 satellites per plane, and it is exactly the
threshold below which the along-orbit mesh stops forming.

### Ephemeris — the animation

~324 KB gzipped for a full day at the native 120 s step, so it ships in one
response. `step_s` may **coarsen** the sampling (the client interpolates); it is
never finer than the scenario grid.

```jsonc
{
  "step_s": 120,
  "horizon_s": 86400,
  "samples": [ { "t_s": 0, "satellites": [ /* same shape as above */ ] } ]
}
```

### Availability strip — three states, not two

```jsonc
[
  { "t_s": 0,   "state": { "C65": "routed", "C70": "routed", "C72": "routed" } },
  { "t_s": 120, "state": { "C65": "visible_no_route", "C70": "routed", "C72": "no_satellite" } }
]
```

`routed` / `visible_no_route` / `no_satellite`. Collapsing the middle state into
"no service" would hide the exact distinction the case is about — the other
team's prototype renders these as three colours, and it reads instantly.

### Export

`GET /simulations/{run_id}/export` returns the official document: one record per
`(instant, client)` pair — 720 × 3 = 2160 for the standard grid — with `path`
running from the client id to the gateway id and `[]` when there is no route.
`effective_scenario` is embedded, so a result file reproduces the run that made
it. Our own summary hangs off `summary`, which the case permits.

---

## 6. Variants and comparison

```
POST   /variants            save the current configuration under a name → 201
GET    /variants            list
POST   /variants/compare    { "variant_ids": ["var_…", "var_…"] }  (2…4)
DELETE /variants/{id}       → 204
```

`POST /variants` takes the same `scenario_id` / `scenario` / `config` / `strategy`
as a run, plus `name` and optional `note`; it runs the configuration if needed
and keeps it.

```jsonc
// POST /variants/compare
{
  "variants": [ /* VariantModel each, in the order requested */ ],
  "changed_parameters": [
    { "path": "design.launch_stage", "label": "Launch stage", "values": [3, 1] },
    { "path": "design.planes[P2].raan_deg", "label": "P2 RAAN", "values": [60.0, 45.0] },
    { "path": "ground_sites[C65].site_conditions", "label": "C65 surroundings", "values": ["open", "urban 25°"] }
  ],
  "metrics": [
    {
      "key": "worst_availability", "label": "Worst-client availability",
      "unit": "fraction", "values": [0.966667, 0.126389], "higher_is_better": true
    }
  ],
  "per_client_availability": { "C65": [0.966667, 0.272222] },
  "recommendation": "Full constellation is the strongest option: every client stays at or above the 90% target…"
}
```

`changed_parameters` exists because the case requires a comparison to show **what
was changed**, not only what it produced. `higher_is_better` lets one renderer
colour every metric row without a per-key lookup table.

Each `VariantModel` carries its own `environment_modified: bool` — the same flag
a run reports — so a comparison can say a variant is a sensitivity study rather
than a design variant without re-deriving it from `config`.

---

## 7. Analysis

```
POST /analysis/resilience     inline, ~2.3 s
POST /analysis/sensitivity    inline, ~0.4 s for 8 points
POST /analysis/optimize       job → 202
GET  /jobs/{job_id}           progress
GET  /jobs/{job_id}/result
DELETE /jobs/{job_id}         stop a running search
```

### Resilience

Knocks out each satellite for the whole horizon and measures the damage. Sorted
worst-first.

```jsonc
{
  "baseline_worst_availability": 0.793056,
  "baseline_mean_availability": 0.808796,
  "target_availability": 0.9,
  "impacts": [
    {
      "satellite_id": "S19", "plane_id": "P2",
      "worst_availability_drop": 0.031944,     // on the WORST-served client
      "mean_availability_drop": 0.019676,
      "per_client_drop": { "C65": 0.031944, "C70": 0.011111, "C72": 0.008333 },
      "breaks_target": false,
      "criticality": 100.0                     // 0…100, for the globe's colours
    }
  ],
  "critical_satellite_ids": [],
  "gateway_dependency": [
    {
      "gateway_id": "G_MUR",
      "serving_satellites": ["S01", "S02", "…"],   // ever the last hop
      "busiest_satellite": "S35",
      "busiest_share": 0.032,                      // share of deliveries
      "contact_availability": 0.879,               // instants the gateway carried traffic
      "routed_share_by_client": { "C65": 0.793 }
    }
  ],
  "compute_ms": 2314.7
}
```

`worst_availability_drop` is measured on the worst-served client, not the
average: the target is judged per client, and averaging would bury a satellite
whose loss costs one village nine points and the others nothing.

`gateway_dependency` answers the second thing the organisers said an engineer
looks for first. With a single gateway the question is how narrow the doorway is
— how many satellites ever deliver to it, and how much rests on the busiest.

### Sensitivity

```jsonc
// request
{ "scenario_id": "01_full_constellation", "parameter": "isl_range_km",
  "values": [2000, 2400, 2700, 2750, 3000] }

// response
{
  "parameter": "isl_range_km",
  "points": [
    { "value": 2000, "worst_availability": 0.622, "per_client": {…}, "meets_target": false },
    { "value": 2700, "worst_availability": 0.856, "per_client": {…}, "meets_target": false },
    { "value": 2750, "worst_availability": 0.967, "per_client": {…}, "meets_target": true }
  ],
  "threshold": 2750,
  "compute_ms": 412.8
}
```

`parameter` ∈ `isl_range_km` | `min_elevation_deg` | `altitude_km` |
`inclination_deg`. `threshold` is the lowest swept value where every client meets
the target, or `null`.

### Optimizer

The only background operation. A `null` range means the parameter is **locked**:

```jsonc
{
  "scenario_id": "01_full_constellation",
  "objective": "worst_first",        // | "mean_first"
  "method": "coordinate_descent",    // "grid" is refused with 400, see below
  "axis_steps": 12,                  // descent: samples per axis sweep
  "passes": 3,                       // descent: sweeps over every axis
  "starts": 3,                       // descent: independent starting points
  "coarse_steps": 4,                 // grid: samples per axis
  "refine_rounds": 2,                // both: local steps around the winner
  "bounds": [
    { "plane_id": "P1" },                                            // fully locked
    { "plane_id": "P2", "raan_deg": [0, 360], "phase_deg": [0, 22.5] },
    { "plane_id": "P3", "raan_deg": [0, 360] }                       // phase locked
  ]
}
```

Locks are the feature that makes the optimizer and the manual controls both
necessary rather than redundant: a real project has constraints the tool cannot
see, and the engineer pins them. They also cut the cost: each locked angle
removes a dimension from the search.

Only RAAN and phase move. Altitude, ISL range and the elevation mask are
hardware, not design choices — `POST /analysis/sweep` measures those separately
and flags the run `environment_modified`.

**Cost.** Every candidate is a full-horizon simulation, so the run count is the
unit the caller should budget in. The client can quote it before committing;
the formula matches `planned_runs` in the engine, with `axes` the number of
unlocked angles:

```
coordinate_descent   starts * (1 + passes * axes * axis_steps) + refine_rounds * 2 * axes + 1
grid                 coarse_steps ** axes + refine_rounds * 2 * axes + 1
```

At three free planes that is 158 runs for one descent against 4109 for a
four-sample grid. The descent is the default because it measured *better* as
well as cheaper — see [DECISIONS.md](DECISIONS.md) C7. An early-stopping descent
spends less than its quote, never more, so `total` in the job status is an upper
bound and `explored` may finish below it.

**Limits.** `method: "grid"` is refused with `400`: at six free angles it is
four thousand full days, about half an hour of both production cores, and it
scores worse than the descent. Any search whose quote exceeds
`OPTIMIZER_MAX_RUNS` (default 1000, roughly 7.5 min on production) is refused
the same way. On the production machine one run costs about 0.45 s.

**Stopping.** `DELETE /jobs/{id}` asks the search to stop and answers with the
job as it stands. The worker notices after its current configuration, drops the
rest of its queue and the job settles on `status: "cancelled"`; its result is
then a `400`. Cancelling a job that already finished changes nothing.

`202` returns a job; poll `GET /jobs/{id}`:

```jsonc
{ "id": "opt_3f8a…", "kind": "optimize", "status": "running",   // queued | running | done | failed | cancelled
  "progress": 0.42, "explored": 306, "total": 730, "error": null,
  "created_at": "…", "finished_at": null }
```

```jsonc
// GET /jobs/{id}/result
{
  "baseline": { "planes": {}, "worst_availability": 0.793, "mean_availability": 0.809,
                "worst_outage_s": 1440, "mean_hops": 2.79 },
  "best":     { "planes": { "P2": { "raan_deg": 56.0, "phase_deg": null } }, … },
  "objective": "worst_first",
  "improved": false,
  "explored": 730,
  "changed_planes": { "P2": { "raan_deg": 56.0, "phase_deg": null } },
  "verdict": "No phasing or RAAN change improves on 79.3% … The 90% target is not reachable by re-orienting the existing planes — it needs an architectural change."
}
```

`verdict` is a sentence to show verbatim. A search that finds nothing is a real
engineering result, and saying so plainly is worth more than dressing up a
rounding error.

---

## 8. Not backend concerns

Per-viewer preferences stay in `localStorage`: open panel groups, collapsed
columns, selected satellite, camera position, play state and speed, colours,
marker sizes, animation timing.

---

## 9. Changes from `frontend/BACKEND_API.md`

| Draft | Now | Why |
|---|---|---|
| camelCase | `snake_case` | One dialect with the official scenario and export formats |
| `t` in minutes 0…1439 | `t_s` in seconds | The export format uses `t_s`; a jury file may use a step that is not a whole minute |
| `availability` 0…100 | fraction 0…1 | Formatted once, in the UI |
| `POST /simulate` → job | `POST /simulations` → result | A run is 0.15 s; a job would add latency and a failure mode |
| `GET /topology?t=` | `GET /simulations/{id}/snapshot?t_s=` | Topology belongs to a run, not to a scenario — otherwise config changes cannot be reflected |
| `groundStation` | `client_id` | The case's own vocabulary |
| `availability: {C65, C70, C72}` | `clients: [ … ]` array | **The jury uploads different ground sites.** A typed three-key object breaks on their file |
| `criticality` only | `+ worst_availability_drop`, `per_client_drop` | The UI needed a real number for "losing this node costs X" |
| `POST /failures/{id}` | `config.failures` on the run | Failures are part of a configuration, so a variant round-trips whole |
| `coverageRadiusKm` | not provided | The case has no beam model; a footprint circle would be decoration presented as data |

## 10. Gaps the backend does not fill

Found while wiring the frontend. None block the integration; each is either
solved on the client or is a decision to take.

**Orbit track polylines.** The globe draws one line per plane. The API returns
positions, not tracks, so `shared/lib/geo.ts` derives them from the scenario's
inclination, the plane's RAAN and the Earth-rotation angle at the current
instant — the same spherical relations `geometry.py` uses, so the line and the
satellites on it agree.

**Ground contact radius.** *Closed.* The case gives an elevation mask, not a
radius, but on a spherical Earth the mask **is** a circle. `shared/lib/geo.ts`
derives it per scenario:

```
lambda = arccos(R cos(eps) / (R + h)) - eps      ->  14.968 deg  ->  1664 km
```

Verified against the organisers' own elevation function, which puts a site at
14.9 deg from the sub-satellite point at 10.109 deg elevation and one at 15.0 deg
below the 10 deg mask. The constant in `shared/config` is only a fallback for the
instant before a scenario has loaded. Note this is a different mechanism from the
3000 km ISL range, which is a straight-line budget between two satellites, not a
footprint on the ground.

**Per-step link topology during playback.** A snapshot is one request per
calculation instant (~13 KB). Playback advances through 720 of them, so a run
costs up to 720 requests spread over a pass, each cached forever afterwards. On
localhost this is invisible. If the deployed backend turns out to be far away, a
bulk endpoint returning every instant's edges — or edges at a coarser stride —
would remove the chatter.

**Satellite failures are windows, not a flag.** *Closed.* The card's one-click
"simulate failure" still writes the whole horizon, which is what a demo wants,
but the configuration panel's failure form takes a start and an end, so a
satellite can be dropped for part of the day and recovered.

**Every client's route is drawn.** *Closed.* A snapshot carries a `routes` entry
per client and the viewport consumes all of them, one colour each, with the
focused client's line given the faster dash. Nothing extra is needed from the
API.

**Hop count is unbounded.** Verified against the engine: with `S20` failed at
`t=0`, `C65` can see only `S19` while the gateway can only be seen by `S04`, so
the true shortest path is **15 hops** the long way around the mesh. The routing
is right — BFS returns the genuine minimum — but a 15-relay store-and-forward
path is questionable as an engineering answer, and neither the case nor the Q&A
defines a limit. See [DECISIONS.md](DECISIONS.md#o-open-questions).
