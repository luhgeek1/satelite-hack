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
| A14 | Deliverables: a deployed link live **from code freeze until the end of all defences**, plus a 20-30 s sped-up screencast. Presentation should name which criteria it covers. | Team task — tracked in [STATE.md](STATE.md). |

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

**B9. Scenario files are checked by our own pass, with `geometry.validate` as
the arbiter.** The organisers' validator stops at the first problem and names it
in a few words ("Invalid satellite"); we used to guess a field from that text
and often guessed wrong — a bad `phase_deg` reported as `raan_deg`, a gateway
outage as a failure, and never which of 48 satellites. `engine/scenario_check.py`
now walks the document, collects every problem with its JSON path, a stable code
and the values involved, and `geometry.validate` runs afterwards so we never
accept what it refuses. A randomised test breaks the official files 3000 times
in each direction to keep the two in step.

Where we are deliberately stricter: `meta.id`, `meta.title` and a site's `name`
are required (the case defines them; without `meta` the import used to fail with
a 500), identifiers must be strings, and `true` is not a launch batch. Where we
used to be stricter and no longer are: a launch stage with nothing launched is
valid, because the official validator accepts it; it comes back as a warning.

**B10. An exported result file imports as its scenario.** The service hands out
`cosmo-A-result-1.0` files, and loading one back is the first thing a person
tries with it; its `effective_scenario` is complete, so that is what we store.

**B11. The step limit is 8640.** The official validator allows a 48-hour
horizon; at 5000 steps a two-day file at 30 s was refused. A 5760-step run
simulates in 1.6 s and 17 280 in 5.3 s, so 8640 (48 h at 20 s, 24 h at 10 s,
about 2.5 s) keeps a run synchronous. Resilience sweeps scale with it too.

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

**D13. The comparison shows the answer first, then the evidence, and fits its
axis to the data.** The verdict names the leading variant and the sites still
under the target; the five compared metrics follow as tiles; the per-site chart
is a dumbbell per ground site on an axis starting one 5-point step below the
lowest figure plotted, not at zero and not at the target.
*Why:* three clients are three categories, not a series — the line chart implied
a trend between C65 and C70 that does not exist, and on a 0-100% axis every
variant is a flat line across the top, so the 1.7 pp a whole optimisation buys
was invisible. Fitting the axis to the data costs the "how far above the target
are we" reading, which the verdict sentence and the tiles already give in
figures. The threshold is still drawn whenever it falls inside the window.
*Also:* the tiles translate the five metric keys the compare endpoint returns
and fall back to its wording for anything else, so the service keeps one
vocabulary while the page speaks the user's language. Its recommendation
sentence is still English prose on a Russian page — the headline above it
carries the verdict, and structuring that sentence is a backend change nobody
has needed yet.

**D14. Every saved variant is listed on the comparison page, ranked.**
*Why:* two dropdowns tell an engineer what a variant is called and nothing about
where it stands. The standings are the record of what has been tried — which is
what a jury asks for — and they make the pair a one-click choice instead of two
menu hunts. They also stop the page being a third full of margin.

**D12. Picking a terminal with nothing in view draws the three footprints that
come closest to it.** Drawn exactly as a picked node's own footprint is — same
circle, same fill, same edge, each in its node's colour — with the terminal
outside all of them.
*Why:* "no satellite in view" is a sentence in a panel; the hole the terminal
sits in is a picture, and it answers the next question — how far short the
constellation falls — without a second click. It is the one no-route reason that
is purely geometric, so it is the only one that gets the treatment: drawing
circles for a broken mesh or a downed gateway would point at the wrong cause.
*What is left out:* nodes whose circle does reach the terminal. The drawing
claims "these do not reach", and a covering circle would contradict it — that
case is the surroundings hiding the sky, and the masked link already says so in
its own colour. On the flat map a footprint that swallows a pole is skipped as
well: equirectangular projects it as a band across the full width, which reads
as a huge zone rather than as a circle that misses. The globe keeps it.

**D13. An outage window is drawn on the timeline, not typed into a form.**
Drag across the strip — with the right button at any time, or with the primary
one after the window button is pressed — and the span turns red with handles on
both edges. A picker opens above it, centred, with the gateways and the
satellites as two sections and a search under them.
*Why:* every question the case asks about an outage is a question about a span
of the day, and the day is already drawn along the bottom of the screen. The
forms in the panel ask for the same window as two hour fields, which is the
same information one step further from the thing it describes. The strip also
answers immediately: the bands under the window redraw, so the cost of the
outage appears where it was declared.
*Why a mode as well as the right button:* a right-drag is not discoverable, and
on a trackpad it is a two-finger press-and-drag that many people have never
made. The button says the gesture exists. It hands the strip back as a scrubber
as soon as a window is drawn, so nobody is left holding a tool they cannot put
down.
*Why sections rather than one list:* a gateway outage and a satellite failure
are different arguments about the network, and the operator arrives knowing
which one they mean. Search sits under the sections because it searches inside
the section. Rows toggle: the picker is a list of switches, so what was taken
down over the window goes back the same way.
*Several windows at once:* the interesting question is rarely about one span —
"the gateway is down at dawn and a plane is out at noon" is two of them, and
the day has to hold both to be worth drawing. Each band is dragged and resized
on its own; the one the picker points at is the brighter one. A node can be
down over more than one window, which the engine already supports: it collects
the failed set per step from the whole list, so repeating an id with a
different span is a second outage rather than a conflict. Two windows that do
overlap are one outage, and the later one replaces the earlier — otherwise the
same node would be listed as failed twice over the same minute.

---

**D15. The launch stage is a moment, not a setting, and the interface now says
so.** A ring keeps the angles it launched with, so there is one design and three
moments in it, not three configurations. The panel used to show one launch at a
time in the group above the angle sliders, which read as "each stage has its own
settings" — physically wrong (a plane change at 550 km is the most expensive
manoeuvre there is, see D6) and the single biggest source of confusion in the
tool. All three launches are now listed at once with what each delivers, the row
is the switch, and every ring carries the launch that commits it.
*Why no fourth tab:* the graded criterion is "Эксперт должен суметь пройти
основные сценарии в интерфейсе" — a reviewer with minutes and no training. A
fourth tab is one more place to find and understand, and deployment is not a
separate activity: angles are always chosen *for* some launch. Making it
prominent inside the simulation tab serves the same end at a lower cost.
*What a saved variant means, as a result:* the whole campaign. The angles in it
apply to every stage, so a variant is a plan and not a snapshot.

**D16. A launch is a draft or a decision, and the session keeps which.** Locks
were a per-plane switch held in component state on the resilience tab: invisible
from the deployment group, lost on reload, and read by a "plan from launch N"
button that therefore always said launch 1 (nothing locked ⇒ the first free
launch is the first one). The campaign is now planned the way it happens — one
launch settled at a time. `committedStages` lives in the persisted session; a
fixed launch is held against every search and against the scales, and only an
explicit *Withdraw* frees it. Planning launch N holds every fixed launch *and*
every launch before N, because by the time N is designed those have flown.
Fixing launch 1 does not discard what a search proposed for launches 2-3: those
stay as a draft and are the starting point of the next step.
*Which scales move:* a ring of a fixed launch is locked (drawn with a lock); a
ring that flies after the launch on screen is disabled because it is not in the
picture, and its legend row jumps to its own launch. Merely dimming them, as
before, is how a stray drag moved a ring nobody was looking at.
*Why keep two angles per plane in the resilience tab:* it serves constraints the
campaign cannot see — an agreed slot, one angle fixed by contract. It starts
from whatever the campaign holds and may hold more.
*Why the scales stay grouped by parameter, not by plane:* the question the
block answers is how far rings sit from each other, and one ruler per angle
answers it by alignment (see the spread dial, which reads the same relation).

**D17. A guided tour replaces the first-visit bubbles.** Three controls used to
introduce themselves unprompted, at different moments and in no order. The
criterion is a reviewer with minutes and no training (A-series, "пройти основные
сценарии"), so the studio now opens with an eight-step tour: one element lit,
the rest dimmed and unclickable, one sentence each — globe, network health,
day strip, the interval tool, deployment, planes, saving a variant, and the lamp
that replays it. The deployment group has its own six-step tour behind its own
lamp, because its question is different: what to do with three launches. Steps
point at `data-tour` anchors and are skipped when their element is absent (a
collapsed panel, a phone), so the tour never points at an empty corner. The
remaining hints are hover-only. Marked as seen when it opens, not when it ends:
being met by the same overlay on every reload is worse than missing a step.

**D18. The resilience tab answers one question first: does the design survive
losing any one satellite.** It is a 10-point criterion ("какие направления
затронуты, где маршрут выживает, как растут перерывы, карта критичных
аппаратов"), so closing the tab was never on the table — but it was answering
it badly. Criticality was scaled against the worst satellite of the same run,
so the official full constellation showed eight red "КРИТ 100" satellites whose
loss costs 2.36 pt with the target still met. Measured (2026-09-12): at launch 3
the worst client is 96.7 % and 94.3 % after the most damaging single loss, and
no satellite breaks the target alone; at launch 2 it is 61.8 % → 59.3 %.
*What changed:* a verdict card on the map, per launch stage (the same switch as
deployment); an absolute scale — red only when a loss alone breaks the target,
"noticeable" from 1 pt, "slight" from 0.25 pt; each ranked row opens onto every
client's loss and **how much longer its longest outage gets** (new
`per_client_outage_growth_s`, computed from the knockouts already run); and one
button fails the satellite for the day and opens the simulation onto it, so the
rerouting is watched, not read. The backend's relative `criticality` stays in
the wire model for compatibility; the UI no longer reads it.
*Finding worth presenting:* the quick search that lifts the full constellation
from 96.7 % to 98.2 % also lifts the worst-after-any-single-failure figure from
94.3 % to 95.8 % — the better design is also the more robust one.
*Finding that shaped a decision:* re-phasing after the ten failures of scenario
03 buys +1 pt (79.3 → 80.3 %), and freeing RAAN as well buys nothing more. Spare
margin comes from satellites, not angles — which is why the tab does not carry a
"recover by re-phasing" search of its own.

**D19. One angle search, stoppable, with an honest price.** The search could be
started from the network card, the deployment group and the resilience tab
under three names, with a per-angle lock grid on the last. It now lives beside
the launch it plans (D16), as the one filled button in the panel, with *Quick*
(one descent) or *Thorough* (three starts) and a quote in full days and minutes.
*Timing, measured on production (performance-2x, 2 dedicated cores):* one full
day ≈ 0.45 s; quick six-axis search 158 runs, 72 s; thorough 676 runs, ≈ 5 min;
the exhaustive grid 4 109 runs, ≈ 30 min; resilience 21 s; one sensitivity sweep
3 s. The UI had quoted the laptop's 0.11 s per run — a quarter of the real wait.
*Grid removed:* refused by the service with 400, as is any search quoted above
`OPTIMIZER_MAX_RUNS` (1 000), because it held both cores for half an hour and
scored worse than the descent (C7).
*Stop that stops:* cancelling the asyncio task only stopped the coroutine
awaiting the thread; the search and its process pool ran to completion. The
engine now polls a stop flag after every configuration and tears the pool down
with `cancel_futures`; `DELETE /jobs/{id}` asks for it and the job settles on
`cancelled`. Verified on production: a thorough search stopped 3.1 s after the
request, and a sensitivity sweep issued immediately afterwards took its usual
3.0 s.
*Sensitivity:* each parameter is its own cached query, so switching tabs no
longer shows the previous parameter's points; the sweeps for the configuration
the page opens on start as soon as it settles (not on every slider move — three
analyses per drag would queue on two cores).

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

**E8. Even RAAN spacing is a condition for the end state, and a greedy
deployment plan destroys it.**

RAAN and phase are fixed when a plane is launched (D6), but each launch chooses
its own: P1 is committed at month 0, P2 at month 3, P3 at month 6. So the
engineer makes three decisions, each knowing the ones already flying. Measured
on `01_full_constellation`, worst-client availability at each stage:

| Angles | RAAN gaps (mod 180°) | Stage 1 | Stage 2 | Stage 3 |
|---|---|---:|---:|---:|
| As flown, 0/60/120 | 60 / 60 / 60 | 12.64% | 61.81% | 96.67% |
| All three tuned for the end state | 60 / 60 / 60 | 12.36% | 58.33% | **98.33%** |
| Greedy: each launch tuned for its own stage | 30 / 90 / 60 | **13.89%** | **65.69%** | 84.31% |
| P1 tuned for stage 1, then P2+P3 chosen together | 60 / 60 / 60 | **13.89%** | 58.33% | 97.78% |

Three conclusions, in order of how much they are worth saying out loud.

- **Planes must be evenly spread in RAAN, and 180° is the period.** A plane
  covers its ascending and descending passes alike, so two planes 180° apart
  trace the same swath. Every configuration above that reaches 96% or better has
  gaps of exactly 60/60/60; the one that does not reaches 84.31%. This is the
  same kind of statement as the 2700 km ISL threshold (E1): a condition for the
  architecture to work, not a parameter to tune.
- **Tuning the first launch is free.** Pinning P1 where stage 1 wants it (60°)
  and then choosing P2 and P3 together still reaches 97.78% — the search simply
  restores even spacing around the pin. So the first three months can be
  improved at no cost to the end state.
- **Tuning the second launch greedily is not.** Choosing P2 for stage 2 alone
  buys 3.9 points for three months and costs 13.5 points for the rest of the
  constellation's life, because it is the choice that breaks the spacing.

*Correction:* an earlier version of this entry claimed the greedy plan fails by
putting two planes on the same RAAN. That was an artefact of the measurement —
it left P2 and P3 at their file values instead of re-optimising them against the
committed P1, which is what an engineer would actually do. The re-measured
failure above is a subtler and stronger result.

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
satellites and 8640 steps (B11); the official validator permits a 48-hour horizon
at any step.

**O7.** Is a deployment plan scored on the end state, on the worst stage, or
weighted by how long each stage is flown? The case says only "не менее 90% для
каждого наземного пункта" about the end state and is silent on the months in
between. See E8 — the three answers give different angles.

**O8.** What local horizon figures does the customer use for its own terminals
in built-up and forested sites? Our profile defaults (15° / 25° / 30°) are typical
values with a stated rationale, not measurements; a figure from the operator
would replace them.

*Closed by the second session:* whether RAAN/phase carry further constraints
(none, A15); whether a launch may be split across rings (no, A16); whether
`sunlight()` matters (no, A17).
