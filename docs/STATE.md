# Current state

Updated 2026-09-12. Keep this current — it is what a fresh session reads to know
where the work stands.

---

## Done

### Backend — runnable end to end

84 tests green (63 unit, 21 integration), ruff clean.

| Area | Status |
|---|---|
| Calculation engine | ✅ matches all twelve reference figures across the four official scenarios |
| `geometry.py` | ✅ vendored byte-for-byte, checksum-tested |
| Routing | ✅ BFS + Dijkstra, client-no-relay rule, four no-route reasons, deterministic |
| Metrics | ✅ visibility, availability, outage windows, edge-of-horizon handling, hop stats |
| Scenario import / validate | ✅ field-precise errors, JSON body and multipart upload |
| Configuration overrides | ✅ launch stage, RAAN, phase 0–360, failures, gateway outages, site surroundings, environment |
| Site surroundings | ✅ per-site profile / mask / azimuth horizon / altitude, only ever removes links, reference figures untouched (DECISIONS D9, E6) |
| Simulation API | ✅ synchronous, content-addressed, idempotent |
| Snapshot / ephemeris / availability strip / route timeline | ✅ cached |
| Official export `cosmo-A-result-1.0` | ✅ 2160 records, round-trips |
| Variants + comparison | ✅ changed-parameter diff, metric rows, recommendation sentence |
| Resilience (criticality) | ✅ ~2.3 s across a process pool |
| Gateway dependency | ✅ |
| Sensitivity sweep | ✅ finds the 2700 km threshold |
| Optimizer | ✅ coordinate descent by default, full grid still selectable, job + progress, parameter locks, configurable objective |
| Fan-out cost | ✅ two cores left free, numpy pinned to one thread per worker, one pool per search |
| Database | ✅ Postgres + Alembic, Redis as an optional cache |
| Docker | ✅ `docker compose up -d --build` |

### Frontend — rewritten on Next.js + Feature-Sliced Design

| Area | Status |
|---|---|
| Stack | ✅ Next.js 15 App Router, React 19, TanStack Query v5, Tailwind v4 |
| Architecture | ✅ FSD: app → views → widgets → features → entities → shared |
| API layer | ✅ typed client, endpoints, query keys; `/api/*` rewritten to the backend so CORS never applies |
| Live data | ✅ scenarios, simulation, snapshots, availability series, resilience, optimizer job, variants, comparison |
| Optimistic updates | ✅ failure injection, variant save/delete, scenario import — each with rollback |
| Globe / flat map | ✅ ported to the new domain model, plane colours derived from the scenario |
| WebGL failure | ✅ caught, falls back to the flat map instead of taking the page down |
| Routes | ✅ every client's path drawn in its own colour, focused one emphasised; sites clickable on globe and map |
| Network health | ✅ per-client hop count or no-route reason, stranded clients named outright |
| Satellite card | ✅ names the clients it carries right now, each chain clickable |
| Optimizer UI | ✅ depth picker, run count and time estimate before the click, time remaining during; phase period derived from the plane's slots |
| Site surroundings UI | ✅ picker on every site card, effective horizon, share of the day hidden, dashed masked links on globe and map |
| Gateway outages UI | ✅ whole day / from now / window, same as satellite failures |
| Quick failure | ✅ the card's one-click failure starts at the timeline position |
| Localization | ✅ Russian and English through one dictionary |
| Verified in a browser | ✅ real metrics render, failure injection flips the UI in 60 ms and reconciles at ~2.5 s |

### Documentation

| File | Purpose |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Working agreement — hard rules, architecture, conventions |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code entry point, points at AGENTS.md |
| [`docs/API_CONTRACT.md`](API_CONTRACT.md) | Frontend ↔ backend contract |
| [`docs/DECISIONS.md`](DECISIONS.md) | Every decision with its reason + open questions |
| [`README.md`](../README.md) | Root entry for the jury: live links, one-command run, demo script, criteria map |
| [`backend/README.md`](../backend/README.md) | How to run and test |
| [`simple.md`](../simple.md) | The case in plain language, for anyone joining |
| [`BRIEF.md`](../BRIEF.md) | Case analysis, graded criteria, questions |

---

## Next

### Backend

1. **Nothing blocking.** The API covers every mandatory case requirement.
2. Prune old runs (`SimulationRunInterface.prune` exists, nothing calls it yet).
3. Deployment: live on Fly.io at `https://orbitguard-backend.fly.dev`, two
   `performance-2x` machines (see D9 and D10 in DECISIONS.md). **A14 requires it
   to stay up from code freeze until the end of all defences.** Budget CPU, not
   RAM: a search needs about 34 MB per worker but is bound by core count and
   memory traffic. Dedicated cores are not a luxury here — on shared vCPUs Fly
   throttles to the baseline quota once the burst balance is gone, and a
   resilience sweep took 832 s instead of 20 s.
   Two things to check when the deployed API misbehaves. If it dies on boot,
   look at `orbitguard-db` first: it is the one dependency that stops the
   migration step. If every endpoint is slow or failing at once, look for
   transactions left `idle in transaction` on the database — that is the
   signature of a sweep holding its connection while it computes.

### Frontend

Everything on the mandatory path is wired to the API, including the flows the
organisers named: jump to an outage and see how the site connects at that
instant, partial failure windows, and the parameter sweep that turns a low
availability figure into a hardware requirement.

What is left:

1. Azimuth horizon profiles can only come from a file; the UI edits the uniform
   mask. A polar plot editor would complete the surroundings feature.
2. Keyboard access pass over the scenario and variant dropdowns.
3. A route inspector — `/simulations/{id}/routes/{client_id}` is typed and
   unused; it would let the whole day's paths be scrubbed without refetching
   snapshots.
4. The two optimizer entry points carry different labels — "Optimize deployment"
   on the simulation tab, "Optimize configuration" on the resilience tab — for
   the same job with the same settings. Worth naming consistently before the
   defence. A lock set on the resilience tab also silently applies to the
   simulation button, with nothing on that tab to show it.
5. Deployment. **A14 requires the link to stay up from code freeze until the
   end of all defences.**

### Team deliverables

- Public URL, live from code freeze to the end of all defences.
- Repository with a run instruction.
- Presentation that **names which criteria each part covers** — the organisers
  warned the jury may otherwise miss it. **Four minutes** of talk, then two of
  questions (A19); the old five-minute script has to lose a minute.
- The technical jury reads the repository from code freeze, apart from the
  defence: the root README is what they open first.
- A 20–30 s sped-up screencast of the interface.
- Book the two consultation slots per checkpoint (one tracker, one expert) and
  take the open questions from [DECISIONS.md](DECISIONS.md#o-open-questions).

---

## Numbers to keep at hand

Measured, reproducible via `make test`.

| Scenario | C65 | C70 | C72 | Longest outage |
|---|---:|---:|---:|---|
| 01 full constellation | 96.7% | 98.8% | 98.9% | 8 / 2 / 2 min |
| 02 first launch | 27.2% | 15.8% | 12.6% | 572 / 658 / 796 min |
| 03 ten failures | 79.3% | 80.8% | 82.5% | 24 / 24 / 20 min |
| 04 ISL 2000 km | 77.5% | 62.2% | 65.1% | 94 / 178 / 4 min |

Target 90% per client. Full simulation: ~0.15–0.24 s — the unit every other cost
is counted in.

### What surroundings do to scenario 01

| Surroundings | C65 | C70 | C72 | Longest outage |
|---|---:|---:|---:|---|
| Open field everywhere (as flown) | 96.7% | 98.8% | 98.9% | 8 min |
| C65 in a city (25° local horizon) | 40.7% | 98.8% | 98.9% | 138 min |
| Gateway in a city | 45.7% | 46.5% | 46.5% | 116 min |
| Gateway in taiga (15°) | 92.2% | 94.3% | 94.4% | 38 min |

The gateway's surroundings cap every client at once. See DECISIONS E6.

### What the optimizer does to scenario 01

All three planes free, ranked on the worst-served client:

| | Worst availability | Longest outage | Runs | Wall clock |
|---|---:|---:|---:|---|
| Baseline, as flown | 96.667% | 480 s | — | — |
| Grid, 4 samples per axis | 97.361% | 360 s | 4109 | 285 s |
| **Coordinate descent** | **98.333%** | **240 s** | **158** | **17 s** |

The headline for the defence is the outage, not the percentage: the longest gap
halves with the same 48 satellites, only re-phased. See [DECISIONS.md](DECISIONS.md)
C7 for why the cheap search is also the better one.
