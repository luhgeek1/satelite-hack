# Decision log

Every non-obvious choice with the reason behind it. Check here before
re-litigating something. Add to it when you decide something worth remembering.

Source-of-truth order: **official case PDFs → `geometry.py` → the Q&A transcript
→ our own measurements → product judgement.**

---

## A. What the organisers confirmed

From the Q&A session ([`hackathon_qna_summary.md`](../hackathon_qna_summary.md),
[`hackathon_qna_transcript.md`](../hackathon_qna_transcript.md)). These override
our earlier guesses.

| # | Answer | What we did about it |
|---|---|---|
| A1 | **No reference routes and no reference availability figures exist.** Any path valid at that instant counts. | Removed the worry about matching a specific tie-break. We still pin our own twelve figures as a regression guard. |
| A2 | **90% is a guideline, not a pass/fail condition.** It does not have to be met in every scenario. | `meets_target` is reported, never enforced. The product is a study tool, not a validator. |
| A3 | **RAAN and phase are the free design parameters**, per group of 16. | Exactly what `ConfigModel.planes` exposes. |
| A4 | **Launch budget and batch composition should not be changed — "это никак не оценивается".** Allowed only as a justified bonus once everything else is done. | **Dropped batch-reassignment as a feature.** We keep the *finding* (batch ≡ plane, which is why stage 1 collapses to 13%) as an explanation in the pitch, not as a proposed change. |
| A5 | **Adding gateways, satellites, planes or slots is out of scope.** One gateway. | Not built. The engine stays generic over N gateways and N clients anyway — that costs nothing and protects us against a surprising input file. |
| A6 | **The jury's file has the same format with different ground-site coordinates**, same gateway. | Nothing may hardcode ids or counts. Flagged two frontend fixtures that violate this ([API_CONTRACT §9](API_CONTRACT.md#9-changes-from-frontendbackend_apimd)). |
| A7 | **An engineer looks first for long outages and gateway dependency.** "Уязвимые аппараты не заложены." | Outage windows are first-class in the run summary. Added `gateway_dependency`. Criticality stays — the case PDF lists it as an optional extra — but it does not lead. |
| A8 | The UI must let the user **jump to a specific outage and see how the station connects at that moment.** | `outage_windows` carry `start_s`; `GET /snapshot?t_s=` serves that instant. |
| A9 | **An automatic recommendation should rank on availability**, "например, среднее по клиентским станциям". | Optimizer objective is configurable: `worst_first` (default) or `mean_first`. See D3. |
| A10 | **No channel capacity, latency, hardware reliability, failure-detection or reconfiguration delays** are modelled. | Not built. Explicitly out of scope. |
| A11 | **`geometry.py` may be replaced or rewritten** as long as the documented formulas and rules hold. | We vendor it unchanged instead — strictly safer, and it makes "корректность расчётов" unarguable. |
| A12 | Organisers were unsure whether the script returns inter-satellite links. | **It does** — `snapshot()["edges"]`. Verified. Worth saying out loud at a consultation. |
| A13 | A manual failure-injection tool is required: pick a satellite, set an interval inside the day or from a moment to the end. | `ConfigModel.failures` with `start_s` / `end_s`. |
| A14 | Deliverables: a deployed link live **from code freeze until the end of all defences**, plus a 20–30 s sped-up screencast. Presentation should name which criteria it covers. | Team task — tracked in [STATE.md](STATE.md). |

---

## B. Architecture

**B1. `src/engine/` is pure.** No FastAPI, no SQLAlchemy, no redis. It is
importable and testable alone.
*Why:* "Качество кода: разделение расчётной логики и интерфейса" is a graded
criterion, `pytest -m unit` needs no infrastructure, and a technical reviewer can
read the whole calculation without installing a database.

**B2. `geometry.py` is vendored byte-for-byte and checksum-tested.**
*Why:* our physics is then literally theirs. The test earned its keep
immediately — `ruff format` reformatted the file and the test caught it, which is
why it is now excluded from both the linter and the formatter.

**B3. Simulation is synchronous; only the optimizer is a job.**
*Why:* measured. A full 720-instant run is **0.15 s**. A job queue would add
latency, a polling loop and a failure mode in front of the jury, in exchange for
nothing. The optimizer evaluates hundreds of runs (~25 s) and genuinely needs it.

**B4. The job registry is in-process, not Celery/ARQ.**
*Why:* one job kind, a single process, a demo. A broker is another thing that can
fail on stage. Trade-off accepted and written down in the module: jobs do not
survive a restart and would need replacing for horizontal scaling.

**B5. Runs are content-addressed** — `sim_` + blake2b of the effective scenario
plus the strategy.
*Why:* makes `POST /simulations` idempotent, so dragging a slider back returns the
previous run instead of littering the table, and snapshot cache keys cannot go
stale.

**B6. Route records are not persisted.** Only the effective scenario and the
summary are stored; routes and snapshots are recomputed on demand and cached.
*Why:* 2160 records ≈ 400 KB per run against 0.15 s to regenerate. Keeps the
database boring.

**B7. Redis is a cache that may be absent.** Every read and write is wrapped and
swallows connection errors; `/api/health` reports it as `degraded`, not `error`.
*Why:* a cache that can take the service down during a defence is worse than no
cache.

**B8. No authentication, no RBAC, no object storage, no scheduler.** Dropped from
the template rather than carried along switched off.
*Why:* the jury opens a URL and must be able to use the tool. Auth code can be
restored from `template/backend/src/{core/security.py,service/auth,api/v1/auth}`.

---

## C. Calculation

**C1. Shortest-hop BFS is the default; Dijkstra on distance is selectable.**
*Why:* the case leaves the algorithm to us and A1 confirms any valid path counts.
Fewest relays is the honest reading for a store-and-forward network and is stable
under floating-point noise. Having both lets us answer "why this algorithm?"
during the defence by *showing* that availability is identical and only the
chosen path differs.

**C2. Adjacency lists are sorted by `(distance, neighbour id)`.**
*Why:* determinism. Two engineers comparing variants must not see different routes
because a dict iterated differently.

**C3. Client ground sites never relay.**
*Why:* stated in the case. `snapshot()` happily emits client↔satellite edges in
both directions, and a naive BFS will route `C65 → S12 → C70 → S30 → gateway`.
Easy to miss, so it has a dedicated test.

**C4. Four no-route reasons, checked outward from the client.**
*Why:* the case demands the distinction. Checking from the client first means a
village with nothing overhead is told exactly that, rather than being told the
gateway is unreachable — which is also true but less useful.

**C5. Edge outages are reported separately** (`leading_outage_s`,
`trailing_outage_s`, `max_bounded_outage_s`).
*Why:* the case says gaps at the ends of the horizon are accounted for separately.
A gap still open when the run ends has an unknown true length, so comparing it
against gaps that opened and closed inside the window would be dishonest.

**C6. Fractions are counts of instants, not integrals over time.**
*Why:* the case fixes the grid and compares variants on it. 720 instants,
right edge excluded.

---

## D. Product

**D1. Manual controls are the requirement; the optimizer is the bonus.**
*Why:* "Проектирование и сравнение конфигураций" is worth **15 points** and is
about the engineer choosing. Automatic search is listed in the PDF as optional
("дополнительно могут быть реализованы"). Never trade the first for the second.

**D2. The optimizer honours locked parameters.**
*Why:* this is what resolves "why keep manual controls if the tool can optimise?"
A real constellation project carries constraints the tool cannot see — launch
windows, agreed RAAN slots, contracts already signed. An engineer pins those and
optimises around them. Cheap to implement, and it makes both halves necessary.

**D3. Objective defaults to `worst_first`, with `mean_first` available.**
*Why:* the case text says "не менее 90% **для каждого** наземного пункта", which
argues for the worst client; the organisers suggested a mean at the Q&A (A9). The
difference is real — a mean can hide one failing village — so it is a switch, not
a guess. **Open question, see O1.**

**D4. Changing the environment marks the run as a sensitivity study.**
*Why:* the case says altitude, ISL range and elevation mask are held fixed when
comparing design variants. We still allow sweeping them, because the ISL finding
is our strongest result, but every such run carries `environment_modified: true`
and the comparison text says so.

**D5. Day/night weighting and per-client priority weights are NOT the primary
metric.**
*Why:* the official availability figure is a flat fraction of instants. Reporting
a weighted number as "availability" would read as an incorrect calculation and
risk the 15-point "корректность расчётов" criterion. If built, they must be an
additional, clearly-labelled metric alongside the official one, defaulting off.
Also note the confusion worth avoiding: `geometry.sunlight()` is about a
*satellite* being in Earth's shadow (on-board power), which is a different thing
from daylight at a ground site — that is just longitude and time.

**D6. Mid-flight orbit changes are not modelled.**
*Why:* the schema has one `raan_deg` and one `phase_deg` per plane for the whole
run — there is no way to express a time-varying element, and the export must
round-trip the official schema. It is also physically wrong at this timescale: a
plane change at 550 km is about the most expensive manoeuvre there is, and
phasing drift plays out over weeks, not within a 24-hour horizon. RAAN and phase
here are *design* parameters, not manoeuvres. Good answer to give if asked.

**D7. UI direction: a modern dashboard, with three specific borrowings from CAD.**
*Why:* the graded criterion is "Эксперт должен суметь пройти основные сценарии" —
a reviewer with minutes and no training. A Blender-style interface optimises for
daily users and has a learning curve, which is the opposite of what is being
scored. Worth borrowing anyway, because each is cheap and reads as instrument
rather than decoration:
1. a **numeric field next to every slider** — engineers type 56.5°, they do not drag;
2. a **status bar** with hard numbers (`t=09:37 · active 48/48 · route 3 hops`);
3. a **satellite list / outliner** — needed regardless, to select a satellite to
   fail without hunting for it on the globe.
Not worth borrowing: menu bars, floating panels, docking.
Also steal the other team's **three-state timeline legend** (`есть путь` /
`виден, нет пути` / `нет спутника`) — it renders the case's central point
visually and costs nothing. Our API already serves exactly those three states.

---

## E. Findings worth presenting

**E1. The ISL threshold is 2700.44 km, and it is a cliff, not a slope.**
At 16 satellites per plane the in-plane spacing is 22.5°, so neighbours sit
`2 · 6921 · sin(11.25°) = 2700.44 km` apart. `geometry.py` requires
`dist < isl_range_km` strictly, so:

| ISL range | Worst-client availability |
|---:|---:|
| 2000 km | 62.2% |
| 2400 km | 76.4% |
| 2700 km | 85.6% |
| **2750 km** | **96.7%** ✅ |
| 3000 km | 96.7% |

Below the chord the along-orbit mesh does not form at all and the constellation
fragments. This is a requirement on the hardware — "the terminal must reach at
least 2700 km" — not a parameter to tune. Confirmed live: the API returns an
`S01→S16` edge of exactly `2700.440237347246` km.

**E2. Launch stage 2 is also not enough.** 61.8 / 62.5 / 66.0%. Only full
deployment reaches the target.

**E3. The organisers' RAAN spacing is already a local optimum.** 730 candidates
explored around `0/60/120°` on the outage scenario found nothing better. Their
configuration is good, and saying so is a more credible result than inventing an
improvement.

**E4. The gateway last hop is not the bottleneck.** All 48 satellites deliver to
`G_MUR` at some point and the busiest carries only 2.4% — so when connectivity
fails it is the mesh, not the doorway.

**E5. Visibility vs availability, in one line:** in `04_link_range` a satellite is
in view 97.8% of the day while a route exists only 77.5% of it. That 20-point gap
is the case in a single slide.

---

## O. Open questions

Ask at the expert consultation — two slots per checkpoint, one tracker and one
expert, booked through the platform.

**O1.** For the automatic recommendation: rank on the **worst-client** daily
availability or on the **mean** across clients? The case text implies per-client;
the Q&A suggested a mean. *(Currently a switch, `worst_first` by default.)*

**O2.** Which trade-off serves the user better — higher minimum daily
availability, or a shorter longest outage? The organisers took this away to
answer later and have not come back.

**O3.** Does tuning `isl_range_km` count as a legitimate design recommendation,
or only as a sensitivity study? It is the only way to reach 90% in scenario 04,
so the framing matters. *(Currently flagged `environment_modified`.)*

**O4.** Is there an acceptable maximum continuous outage? The organisers said
none is specified and it "должна проектироваться" — so is there an industry figure
worth citing in the recommendation?

**O5.** Is there a sensible maximum number of relays in a route? Measured: with
one satellite failed, the genuine shortest path can reach **15 hops** because the
client and the gateway see disjoint parts of the mesh. BFS is returning the true
minimum, so this is a modelling question, not a bug — but presenting a 15-relay
path as a recommendation invites the question.

**O6.** How large might the jury's scenario be? Guard rails currently allow 500
satellites and 5000 steps; the official validator permits a 48-hour horizon.
