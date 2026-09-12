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
| A4 | **Launch budget and batch composition should not be changed — "это никак не оценивается".** Allowed only as a justified bonus once everything else is done. | **Dropped batch-reassignment as a feature.** The second session went further (A16): a launch physically fills one ring, so the "spread a launch across rings" advice is gone from the pitch too. The diagnosis (stage 1 = one plane = no cross-plane links = 13%) stays as an explanation. |
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

### Second session, 12 September 2026 ([`transcript.txt`](../transcript.txt); the case owner, Андрей Цветков, was present)

| # | Answer | What we did about it |
|---|---|---|
| A15 | **RAAN and phase take any value in [0, 360). No other constraint** — no fuel, no collision model. | Panel sliders and the optimizer bounds run the full circle. The phase *search* still sweeps one slot spacing when the plane is uniform and unbroken, because a shift of one slot relabels the satellites without moving the geometry; any failure window on the plane widens it back to 360°. |
| A16 | **One launch puts its satellites on one ring.** "Спутники из одной стадии зафиксированы на одно кольцо." | **Dropped the batch-reshuffle recommendation** (the old BRIEF §5 "insight 1"). The diagnosis stays — stage 1 is a single plane with no cross-plane links, hence 13% — but the advice is now: orient that one plane with the optimizer, and say plainly that 90% needs the third launch. |
| A17 | `sunlight()` is auxiliary; on-board energy belongs to another hackathon case. | Not used, confirmed. D5 already said so. |
| A18 | **Terrain, urban build-up and sea level are the "задача со звёздочкой, которая приветствовалась бы".** The case owner described a checkbox that applies a relief model. | Built: per-site surroundings, see D9 and E6. |
| A19 | Defence: **4 min talk + 2 min questions + 1 technical minute.** The technical jury starts reading the repository at code freeze, apart from the defence, and the service must be usable outside the slot. | Root [README.md](../README.md) written for that reader. The pitch is cut to four minutes. |
| A20 | Competitors to know: **Satlink Calculator** and **Satellite Communications Toolbox** (MathWorks). "Не надо копировать — надо видеть, кто конкурент." | Positioning note in E7. The azimuth/elevation horizon mask in D9 is the vocabulary those tools use. |
| A21 | One gateway, three clients, all routed to that gateway. The model is not tied to the north: latitude −90…90, longitude −180…180. | Already the case. |

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
nothing. The optimizer evaluates hundreds of runs (17 s for the default search,
minutes for the exhaustive one) and genuinely needs it.

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

**C7. The optimizer walks one angle at a time, not the full grid.**
*Why:* enumerating three planes x RAAN and phase costs `steps ** 6` full-day
simulations, and the budget that makes it affordable also makes it coarse: four
samples per axis tries RAAN only at 0, 90, 180 and 270 degrees. Coordinate
descent holds every other angle still and sweeps one finely, which costs
`starts * passes * axes * steps`. Measured on `01_full_constellation`, all three
planes free:

| Search | Worst availability | Longest outage | Runs | Wall clock |
| --- | --- | --- | --- | --- |
| Baseline (as flown) | 96.667% | 480 s | — | — |
| Grid, 4 per axis | 97.361% | 360 s | 4109 | 285 s |
| Descent, 12 per axis, 1 start | **98.333%** | **240 s** | **158** | **17 s** |
| Descent, 12 per axis, 3 starts | 98.333% | 240 s | 532 | 58 s |

The cheap search is the default because it is also the better one. The grid stays
available as "Exhaustive" for anyone who wants the guarantee that nothing inside
its resolution was skipped.

*Caveat:* a descent settles wherever it stops improving, so it can miss an optimum
across a ridge the grid would have sampled. That is what the independent starts
are for, and they are drawn from a fixed seed — the jury must get the same
recommendation from the same file twice.

**C8. Fan-out leaves two cores free and pins numpy to one thread per worker.**
*Why:* an unbounded pool took every core and made the machine running the demo
unusable for minutes. Worse, numpy opens a thread pool inside each worker, so
eight processes asked for eighty threads on ten cores: pinning took a 729-point
search from 77 s to 54 s. Measured scaling is only about 2x over eight workers —
the work is bound by memory traffic, not arithmetic — so cutting the number of
runs matters far more than adding cores. Memory is not the constraint: about
34 MB per worker, ~300 MB for a full search.

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

**D8. A slider drag refreshes the run on release and at most every 550 ms in
between.** *Why:* a pure trailing debounce held the timeline and the metrics on
the last committed geometry for as long as the pointer kept moving, and then
jumped — which reads as a frozen panel rather than a live one. A run is ~150 ms,
so a floor of 550 ms buys a strip that follows the hand at under two requests a
second. The pointer coming off the control commits immediately, since the end of
a gesture is not a pause in one. The strip keeps the previous day's bands while
the next run is in flight: dropping to an empty series was the single most
visible stall in the panel.

---

**D9. Hosting: Fly.io in `fra`, three apps, dedicated cores for the API.**
`orbitguard-backend` (two `performance-2x` machines — 2 dedicated cores, 4 GB —
sized in `backend/fly.toml`), `orbitguard-db` (Fly Postgres 18, one machine,
1 GB) and `orbitguard-redis` (256 MB). The backend runs `alembic upgrade head`
on every boot, so a database that is down takes the API down with it.

*Why 1 GB for Postgres:* the default 256 MB machine was OOM-killing `postgres`
within hours (12 Sep 2026) — `postgres-flex` runs repmgr and a monitor beside
the server and the VM had 207 MB usable. It idles at ~270 MB after the bump.

*Why dedicated cores:* a sweep pins every core it is given for tens of seconds,
which is the one workload shared vCPUs are worst at. Fly throttles a shared
vCPU to its baseline quota once the burst balance is gone, and the same
resilience sweep measured **832 s** on `shared-cpu-2x` against **20 s** on
dedicated cores.

*Why only two cores:* budget, not physics. Measured on the deployed machine, one
full-day simulation costs **749 ms** against **164 ms** on an M-series laptop —
the Fly core is 4.5x slower — and the fan-out scales almost linearly here:
**1.97x** on two workers, **2.67x** on three, **3.95x** on four. C8's "about 2x
over eight workers" was measured on a laptop whose efficiency cores flatten the
curve, and it does not describe this hardware. So cores buy optimizer time
directly: a 86-configuration search takes ~33 s on two and ~16 s on four.
`performance-2x` costs $2.15 a machine a day, `performance-4x` twice that.
Raising the size is only half the change — `OPTIMIZER_MAX_WORKERS` and
`ANALYSIS_MAX_WORKERS` are pinned at 2 and would leave the new cores idle.

*Why the size lives in `fly.toml`:* `fly deploy` resizes machines to the
`[[vm]]` block, so a size set from the dashboard is silently undone by the next
push to `main`. D10 covers what the slow sweep did to the API.

**D10. A request hands its database connection back before it computes.**
`UoW.release()` is called after the scenario is loaded and before the engine
runs, and `MAX_CONCURRENT_ANALYSES` caps how many sweeps hold the cores at once.
*Why:* a session keeps its connection checked out until the transaction ends, so
a twenty-second sweep pinned one connection for twenty seconds. Fifteen
concurrent sweeps exhausted the pool and **every** endpoint began failing with
`QueuePool limit of size 5 overflow 10 reached` — production showed nineteen
transactions idle for up to fourteen minutes. The cap matters because each
request opens its own process pool: unbounded, twenty pools on two cores starve
each other, the client retries, and the queue grows faster than it drains. The
database also sets `idle_in_transaction_session_timeout = 120s` as a backstop,
which is why the engine now runs with `pool_pre_ping`.

**D11. A job poll is routed to the machine running it, not shared between
machines.** The owning machine id is part of the job id, and a poll that lands
on the wrong machine is returned to Fly's proxy with
`fly-replay: prefer_instance=<machine>`, which re-runs the request in the right
place.
*Why:* `JobRegistry` is a dict in one process. The moment the app ran on two
machines, roughly half of every search's progress polls hit the machine that had
never heard of the job and got a 404 — the progress bar stalled near 1% and the
API looked dead, while the logs showed one machine answering 200 twenty times
and the other 404 fifteen times for the same id (12 Sep 2026).
*Why not a shared store or a broker:* there is exactly one job kind and the work
itself cannot move — the process pool doing the search lives on the machine that
started it. Putting state in Redis would make the poll answerable anywhere but
would not move the search, so it buys nothing a replay does not, and costs a
moving part that can fail during a defence. `prefer_instance` rather than
`instance` so a job whose machine has been replaced still gets an honest 404,
and a request the proxy has already moved is never moved again.

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

**E3. Re-phasing improves every official scenario — the earlier "already optimal"
finding was an artefact of a coarse search.** This entry previously claimed that
730 grid candidates around `0/60/120°` found nothing better on the outage
scenario, and concluded the organisers' spacing was a local optimum. That
conclusion was wrong: the grid sampled RAAN only every 90°, which steps over the
optimum rather than finding it. A coordinate descent at 12 samples per angle, 158
runs, improves all four:

| Scenario | Worst availability | Longest outage |
|---|---|---|
| 01 full constellation | 96.67% → **98.33%** | 480 s → **240 s** |
| 02 first launch | 12.64% → 13.89% | 47760 s → 49440 s |
| 03 satellite outages | 79.31% → **80.83%** | 1440 s → **1080 s** |
| 04 link range | 62.22% → **70.28%** | 10680 s → 12720 s |

Two honest qualifications to carry into the defence:

- **Nothing reaches 90% that did not already.** Re-phasing is real engineering
  headroom, not a fix for a constellation that is too small or a link budget that
  is too short. Scenario 02 moves by a point and stays hopeless; 04 gains eight
  points and still misses. That is the correct conclusion and a stronger one than
  a rescue story.
- **In 02 and 04 the longest outage gets worse while availability improves.** The
  objective is lexicographic and availability leads, so outage is only a
  tiebreak — the search will trade a longer worst gap for more covered instants.
  If a judge asks, that is deliberate (C7), and `mean_first` or a reordered key
  would trade differently.

**E4. The gateway last hop is not the bottleneck.** All 48 satellites deliver to
`G_MUR` at some point and the busiest carries only 2.4% — so when connectivity
fails it is the mesh, not the doorway.

**E5. Visibility vs availability, in one line:** in `04_link_range` a satellite is
in view 97.8% of the day while a route exists only 77.5% of it. That 20-point gap
is the case in a single slide.

---

**E6. The gateway's surroundings matter more than any client's.** Measured on
`01_full_constellation`, everything else as flown:

| Surroundings | C65 | C70 | C72 | Longest outage |
|---|---:|---:|---:|---|
| Baseline, open field everywhere | 96.7% | 98.8% | 98.9% | 8 min |
| C65 in taiga (15°) | 81.8% | 98.8% | 98.9% | 66 min |
| C65 in a city (25°) | **40.7%** | 98.8% | 98.9% | **138 min** |
| C65 on a valley floor (30°) | 26.2% | 98.8% | 98.9% | 162 min |
| Gateway in taiga (15°) | 92.2% | 94.3% | 94.4% | 38 min |
| **Gateway in a city (25°)** | **45.7%** | **46.5%** | **46.5%** | **116 min** |

Two things to say out loud. First, a near-polar constellation at 550 km is seen
from 65° N mostly low in the sky, so a 25° local horizon costs a client more than
half its day — the terminal mask alone (10°) badly understates what a real
rooftop delivers. Second, the gateway is the one site every route ends at, so its
surroundings cap every client at once: put the Murmansk antenna between
buildings and the whole network drops to 46%, put it in the open and the
constellation is fine. That is a siting requirement, and it is the kind of
conclusion the case owner asked for: physical, specific, and traceable to a
calculation the jury can rerun.

**E7. Where this sits against the tools the case owner named.** Satlink
Calculator is a link-budget calculator: one link, one moment, no constellation
and no routing. Satellite Communications Toolbox (MathWorks) does constellation
access analysis with azimuth/elevation masks and terrain, but it is a library
for engineers who write scripts, priced per seat, with no notion of "does this
village reach the gateway through the mesh". We sit between them: the
constellation-level, route-level question, with the site-level realism (D9)
borrowed from the toolbox vocabulary, in a browser the jury can open without
installing anything. Not a replacement for either; the piece neither of them has.

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

**O7.** What local horizon figures does the customer use for its own terminals
in built-up and forested sites? Our profile defaults (15° / 25° / 30°) are typical
values with a stated rationale, not measurements; a figure from the operator
would replace them.

*Closed by the second session:* whether RAAN/phase carry further constraints
(none, A15); whether a launch may be split across rings (no, A16); whether
`sunlight()` matters (no, A17).
