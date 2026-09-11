# Backend API contract — OrbitGuard

What the frontend needs from the backend, in the shapes it already consumes.

`BACKEND_HANDOFF.md` lists *where* the fixtures live in the code. This document
describes *what* has to replace them. Types below mirror `src/types.ts`, so a
response that matches them drops straight into the UI.

Base URL: `/api/v1`. All responses JSON, all times UTC.

---

## 1. Domain model

Units and conventions used everywhere:

| Field | Unit | Notes |
|---|---|---|
| `lat` | degrees | −90…90, positive north |
| `lon` | degrees | −180…180, positive east |
| `altitude` | km | above mean sea level |
| `raan`, `phase`, `inclination` | degrees | 0…360 / 0…360 / 0…180 |
| `t` | minutes | 0…1439, minute of the simulated day |
| `availability` | percent | 0…100, one decimal |

Stable IDs are required and are shown to the user verbatim: `S01…S48` for
satellites, `P1…P3` for planes, `G_MUR` for gateways, `C65`/`C70`/`C72` for
client sites. Do not renumber them between responses.

---

## 2. Constellation catalog

```
GET /scenarios/{scenarioId}/constellation
```

```jsonc
{
  "planes": [
    { "id": "P1", "raan": 0,   "phase": 0,    "inclination": 70, "altitudeKm": 550 },
    { "id": "P2", "raan": 60,  "phase": 7.5,  "inclination": 70, "altitudeKm": 550 },
    { "id": "P3", "raan": 120, "phase": 15,   "inclination": 70, "altitudeKm": 550 }
  ],
  "satellites": [
    {
      "id": "S01",
      "plane": "P1",
      "slotDeg": 0,            // position within the plane, 0…360
      "altitude": 550,
      "status": "active",      // "active" | "failed"
      "criticality": 24,       // 0…100, computed server-side, see §6
      "launchBatch": 1,        // 1 | 2 | 3 — drives the deployment stages
      "coverageRadiusKm": 1700 // beam//footprint radius, per satellite
    }
  ],
  "groundSites": [
    { "id": "G_MUR", "name": "Murmansk reference gateway", "role": "gateway", "lat": 68.97, "lon": 33.07 },
    { "id": "C65",   "name": "Northern terminal 65",       "role": "client",  "lat": 65.0,  "lon": 60.0 }
  ]
}
```

Notes:

- `slotDeg` is what the UI needs to place a satellite on its plane's track and
  to re-place it when the engineer drags the phase slider. Without it the
  frontend cannot move satellites along the orbit, only rotate the plane.
- `criticality` must be computed by the backend. The UI only renders it and
  buckets it (<45 low, <70 medium, <85 high, else critical).
- `coverageRadiusKm` is currently hardcoded to 1700 in the client.
- Deployment stages are `launchBatch` 1 / 1–2 / 1–3.

---

## 3. Ephemeris

The UI animates a 24-hour window at 1/4/16× and needs positions at any minute.
Either shape is acceptable; prefer (A) if propagation is cheap server-side.

**(A) Precomputed track — preferred**

```
GET /scenarios/{scenarioId}/ephemeris?stepMin=5
```

```jsonc
{
  "stepMin": 5,
  "samples": [
    { "t": 0, "positions": { "S01": { "lat": 0.0, "lon": -180.0 }, "S02": { "lat": 26.8, "lon": -157.5 } } },
    { "t": 5, "positions": { "S01": { "lat": 1.2, "lon": -178.8 } } }
  ]
}
```

The client interpolates between samples. 5-minute steps for 48 satellites is
~14k points — fine over the wire.

**(B) Orbital elements, propagated client-side**

```jsonc
{
  "epoch": "2026-03-01T00:00:00Z",
  "elements": [
    { "id": "S01", "plane": "P1", "inclinationDeg": 70, "raanDeg": 0, "argLatDeg": 0, "meanMotionRevPerDay": 15.2 }
  ]
}
```

Also return, for either shape, the **orbit track** per plane so the UI can draw
the three orbit lines: either an inclination the client can trace, or an
explicit polyline `{ "plane": "P1", "points": [{ "lat": 0, "lon": -180 }, …] }`.

---

## 4. Topology and routing

Needed per time step, because links appear and drop as satellites move.

```
GET /scenarios/{scenarioId}/topology?t=402
```

```jsonc
{
  "t": 402,
  "links": [
    { "source": "S01", "target": "S02",    "type": "isl" },
    { "source": "C65", "target": "S39",    "type": "ground" },
    { "source": "S39", "target": "G_MUR",  "type": "gateway" }
  ],
  "routes": [
    { "groundStation": "C65", "available": true,  "path": ["C65", "S39", "G_MUR"] },
    { "groundStation": "C70", "available": false, "path": [], "reason": "no_visible_satellite" }
  ]
}
```

`type` drives how a link is drawn (`isl` inside/between planes, `ground`,
`gateway`), so send it even if the graph is homogeneous internally.

When `available` is false the UI shows an outage state, so `reason` should be a
short machine value the client maps to copy: `no_visible_satellite`,
`network_partition`, `gateway_unreachable`.

---

## 5. Scenario simulation

Runs the configured scenario over 24 hours. Long-running, so it is a job.

```
POST /scenarios/{scenarioId}/simulate
```

Request — this is exactly the state the right-hand configuration panel holds:

```jsonc
{
  "deploymentStage": 3,                       // 1 | 2 | 3
  "planes": {
    "P1": { "raan": 0,   "phase": 0 },
    "P2": { "raan": 60,  "phase": 7.5 },
    "P3": { "raan": 120, "phase": 15 }
  },
  "failures": [
    { "satelliteId": "S15", "fromMin": 0, "toMin": 1439 }
  ],
  "windowMin": 1440
}
```

Response: `202` with `{ "jobId": "sim_01H…" }`.

```
GET /jobs/{jobId}
```

```jsonc
{
  "status": "running",        // "queued" | "running" | "done" | "failed"
  "progress": 0.42,           // 0…1
  "explored": 124,            // optional, optimizer jobs only
  "total": 500,
  "error": null               // message string when status is "failed"
}
```

```
GET /jobs/{jobId}/result
```

```jsonc
{
  "metrics": {
    "availability": { "C65": 96.7, "C70": 98.8, "C72": 98.9 },
    "maxOutageMinutes": 8,
    "criticalSatellites": 5
  },
  "availabilitySeries": [
    { "t": 0,  "C65": 97.1, "C70": 98.0, "C72": 99.2 },
    { "t": 60, "C65": 95.4, "C70": 98.6, "C72": 99.0 }
  ],
  "outageWindows": [
    { "groundStation": "C65", "fromMin": 430, "toMin": 438, "reason": "no_visible_satellite" }
  ]
}
```

`outageWindows` is what the timeline bar under the globe renders — it currently
draws hardcoded red/blue segments. `availabilitySeries` feeds the Compare chart.

---

## 6. Failure injection

The UI marks a node failed and expects recomputed topology and metrics.

```
POST   /scenarios/{scenarioId}/failures   { "satelliteId": "S15" }
DELETE /scenarios/{scenarioId}/failures/{satelliteId}
```

Both return the updated `{ metrics, routes, links }` so the panel, the globe and
the health HUD can update from one response.

Criticality is expected to be recomputed here too: it is defined as *how much
availability the network loses if this node fails*, and the detail panel shows
that number ("Losing this node costs about 15.0% availability"). Today the UI
derives it as `criticality / 100 * 16`, which is a placeholder — send the real
figure as `availabilityImpact` per satellite:

```jsonc
{ "id": "S15", "criticality": 94, "availabilityImpact": 15.0 }
```

---

## 7. Optimizer

```
POST /scenarios/{scenarioId}/optimize   → { "jobId": "opt_01H…" }
GET  /jobs/{jobId}                      → progress, see §5
GET  /jobs/{jobId}/result
```

```jsonc
{
  "recommendation": {
    "planes": {
      "P2": { "raan": 56,  "phase": 13.0 },
      "P3": { "raan": 124, "phase": 15.0 }
    },
    "before": { "availability": 96.7, "maxOutageMinutes": 26, "criticalSatellites": 5 },
    "after":  { "availability": 98.1, "maxOutageMinutes": 14, "criticalSatellites": 2 }
  }
}
```

Only send planes that actually change — the UI lists them as a diff.

---

## 8. Scenarios

```
GET  /scenarios                 → [{ "id": "01_full_constellation", "name": "Full constellation" }]
GET  /scenarios/{id}            → the constellation catalog of §2
POST /scenarios/import          → multipart or JSON body, the "JSON" button in the header
```

Import should accept the official case file format and return the created
scenario id, or `400` with `{ "error": "…", "field": "…" }` so the UI can say
what is wrong with the file.

---

## 9. Errors

Any non-2xx should carry a body the UI can show without inventing copy:

```jsonc
{ "error": "Scenario 01_full_constellation has no ephemeris for t=402", "code": "no_ephemeris" }
```

The interface states what went wrong and what to do next, so prefer specific
`code` values over a generic 500.

---

## 10. Stays in the browser

Not backend concerns — these are per-person view preferences kept in
`localStorage`:

- which configuration groups are open, whether the data column is collapsed,
  whether the health HUD is expanded;
- the selected satellite, the globe camera position, play state and speed;
- all colors, marker sizes, animation timings and the starfield.

Move them to an account-preferences endpoint only if the same view has to follow
a person across devices.
