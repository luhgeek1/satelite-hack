# AGENTS.md — working agreement for this repository

Canonical instructions for any coding agent or new contributor. `CLAUDE.md`
points here; keep the content in this file so the two never drift.

---

## 1. What this project is

A web service for the КосмоХакатон 2026 case **«Проектирование устойчивой
спутниковой группировки»**.

A design engineer loads a satellite-constellation scenario, changes the
deployment stage / plane orientation / phasing / satellite failures, runs a
24-hour simulation, and sees whether each northern ground site keeps an
**end-to-end route to the gateway** — and where and why it does not.

The one sentence that governs every product decision:

> A satellite overhead is not connectivity. The metric is whether an unbroken
> chain `client → satellite → … → satellite → gateway` exists at each instant.

Newcomer-friendly explanation: [`simple.md`](simple.md).
Case analysis and grading criteria: [`BRIEF.md`](BRIEF.md).

---

## 2. Hard rules

These are not style preferences. Breaking any of them loses points.

1. **`src/engine/geometry.py` is vendored byte-for-byte from the case archive.
   Never edit it.** `tests/unit/test_geometry_vendored.py` asserts the checksum.
   It is excluded from ruff's linter *and* formatter in `pyproject.toml`.
   If the organisers ship a new archive, re-copy the file and re-run the
   reference tests as a deliberate act.

2. **The twelve reference metrics in `tests/unit/test_reference_metrics.py` are
   the contract with the technical jury.** If a refactor moves any of them, the
   refactor is wrong. Do not "update the expected values" to make a test pass.

3. **`src/engine/` may not import FastAPI, SQLAlchemy, redis or anything from
   `service/`, `api/`, `domain/`, `database/`.** The engine has to stay runnable
   and testable on its own — that is a graded criterion ("разделение расчётной
   логики и интерфейса") and it is what keeps `pytest -m unit` infra-free.

4. **Client ground sites never relay traffic.** `snapshot()` emits
   client↔satellite edges in both directions; refusing to route *through* a
   client is routing's job. Covered by `test_client_sites_never_relay`.

5. **Nothing may hardcode `C65` / `C70` / `C72`, `S01…S48`, `P1…P3`, `G_MUR`,
   48 satellites, 3 planes, one gateway, or a 120 s step.** The jury will upload
   a file of the same format with **different ground-site coordinates**
   (confirmed at the Q&A). Every count and identifier comes from the scenario.

6. **No authentication.** The jury opens a URL and must be able to use the tool
   immediately. Do not add a login screen.

7. **Site surroundings may only remove ground links.** `engine/site_conditions.py`
   applies `max(scenario mask, local mask)` on top of what `geometry.snapshot()`
   admits; it must never admit a link the organisers' geometry rejects, and a
   neutral site must be skipped so the reference figures stay byte-identical.
   `tests/unit/test_site_conditions.py` pins both.

---

## 3. Wire conventions

The API speaks the official case dialect so that the scenario we import, the
result we export, and everything in between use one vocabulary.

| Thing | Convention |
|---|---|
| Keys | `snake_case` |
| Time | **seconds from the start of the run**, field `t_s` |
| Angles | degrees |
| Distance | kilometres |
| Availability / visibility | **fraction 0…1**, never percent |
| Outage durations | seconds |
| Identifiers | verbatim from the scenario, never renumbered |

Percent formatting is the frontend's job. `t_s` rather than minutes because the
official export uses `t_s` and a jury file may use a step that does not divide
into whole minutes.

---

## 4. Architecture

```
api/v1/      thin routers — validation and HTTP shape only
service/     orchestration: resolve scenario → apply config → call engine → persist
domain/      Pydantic models; this is the API contract expressed in code
database/    SQLAlchemy tables + interfaces + UoW; redis as a pure cache
engine/      pure calculation, no framework imports
             geometry.py  vendored, never edited
             scenario / routing / simulate / metrics   the mandatory path
             site_conditions.py                        terrain / buildings / altitude per site
             analysis / optimizer                      criticality, sweeps, search
             parallel.py                               how much machine a fan-out may take
```

Dependencies point downward only. A service may import from `engine`, `domain`
and `database`; none of those may import from `service` or `api`.

### Conventions carried from the team template

- One router file per resource area; leaf routers declare **absolute** paths
  (`path="/simulations/{run_id}"`), aggregators only group them. FastAPI rejects
  an empty prefix combined with an empty path.
- Services are constructed in `service/<area>/__init__.py` via a
  `get_<area>_service()` dependency that wires the interfaces.
- Data access lives in `*_interface.py` next to the table; services never write
  raw queries.
- Errors are raised as `core.errors.DomainError` subclasses and rendered as
  RFC 9457 problem documents by `core/error_handling.py`. Never raise bare
  `HTTPException` from a service.

### Deliberate omissions from the template

Auth, RBAC, object storage, notifications, the scheduler, Centrifugo and the ML
service were dropped rather than carried along switched off. Auth code can be
re-added from `template/backend/src/{core/security.py,service/auth,api/v1/auth}`
if it is ever needed.

---

## 5. Performance facts that shaped the design

Measured on the official scenario, and the reason the service looks the way it
does. Re-check these before assuming something needs to be asynchronous.

| Operation | Cost |
|---|---|
| Full 720-instant simulation, 48 satellites, 3 clients | **~0.15-0.24 s** |
| Edges in one snapshot | ~81 |
| One snapshot as JSON | ~13 KB |
| Whole-day ephemeris (positions only) | 1 MB → **324 KB gzipped** |
| All 720 snapshots with edges | 8.6 MB — too big for one response |
| 48-satellite criticality sweep | 6.7 s serial, **~2.3 s** across a process pool |
| Optimizer, one coordinate descent, 3 planes free | 158 candidates, **~17 s** |
| Optimizer, full grid at 4 samples per axis | 4109 candidates, **~285 s** |
| Parallel speed-up over 8 workers | only **~2x** — bound by memory traffic, not arithmetic |
| Memory during a search | ~34 MB per worker, ~300 MB total |

Consequences:

- `POST /simulations` is **synchronous**. No job queue.
- Only the optimizer uses the job protocol (`service/analysis/jobs.py`,
  in-process, deliberately not Celery).
- Runs are **content-addressed**: the id is a hash of the effective scenario plus
  the routing strategy, so re-running an identical configuration is idempotent.
- Route records are **not** persisted — regenerating costs 0.15 s, storing costs
  ~400 KB per run.
- CPU work goes through `asyncio.to_thread`, never inline on the event loop.
- **Cut candidates before adding cores.** Eight workers buy about 2x, so halving
  the search is worth more than doubling the machine. `engine/parallel.py` caps
  the pool at `cpu_count - 2` and pins numpy to one thread per worker; an
  unbounded pool made the machine running the demo unusable and was *slower*.
- Memory is never the constraint here. A deployment should be sized on cores.

---

## 6. Commits

Commit the way a careful engineer does: in logical blocks, as the work happens.
Not one commit at the end holding everything.

- **One idea per commit.** A slice of behaviour that makes sense on its own and
  leaves the tree working. Size follows the idea — 50 lines or 400, whichever
  the idea takes. What is wrong is a commit that bundles unrelated changes
  because they happened on the same afternoon.
- **Commit as you go**, not in one sweep at the end. If a task produces a data
  layer, three widgets and a wiring step, that is four or more commits.
- **Subject in English**, imperative mood, no trailing period, under ~72
  characters. `Add optimistic failure injection`, not `added stuff`.
- **Body explains why**, when the reason is not obvious from the diff. Wrap at
  ~80 columns. Skip the body for genuinely self-evident changes.
- **No `Co-Authored-By` trailers** and no tool attribution of any kind.
- Never mix a refactor with a behaviour change. Land the refactor, then the
  behaviour.
- Run `make test` (and `npm run lint` for frontend work) before committing.

## 7. Commands

```bash
make help              # list targets
make install           # backend/.venv on Python 3.13 (system python is 3.11)
make test-up           # postgres :55432, redis :56379
make migrate
make dev               # uvicorn --reload on :8080
make test              # 84 tests: 63 unit + 21 integration
make lint / make format
make up / make down    # full Docker stack
```

Always run `make test` before committing. `make test-unit` alone needs no
infrastructure and catches most regressions.

---

## 8. Open questions

Tracked in [`docs/DECISIONS.md`](docs/DECISIONS.md) §Open. Ask these at the
expert consultation (2 slots per checkpoint: one tracker, one expert).

1. Ranking for the automatic recommendation: best **worst-client** availability
   or best **mean**? The case text says "не менее 90% для каждого пункта"; the
   organisers suggested a mean at the Q&A. Currently configurable,
   `worst_first` by default.
2. Which trade-off serves the user better: higher minimum daily availability, or
   a shorter longest outage? The organisers took this away to answer later.
3. Whether tuning `isl_range_km` counts as a legitimate recommendation or only
   as a sensitivity study. Currently flagged as `environment_modified`.
4. What local horizon figures the customer uses for terminals in built-up and
   forested sites (our profile defaults are typical values, not measurements).
