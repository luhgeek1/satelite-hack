# Current state

Updated 2026-09-12. Keep this current — it is what a fresh session reads to know
where the work stands.

---

## Done

### Backend — runnable end to end

60 tests green (41 unit, 19 integration), ruff clean.

| Area | Status |
|---|---|
| Calculation engine | ✅ matches all twelve reference figures across the four official scenarios |
| `geometry.py` | ✅ vendored byte-for-byte, checksum-tested |
| Routing | ✅ BFS + Dijkstra, client-no-relay rule, four no-route reasons, deterministic |
| Metrics | ✅ visibility, availability, outage windows, edge-of-horizon handling, hop stats |
| Scenario import / validate | ✅ field-precise errors, JSON body and multipart upload |
| Configuration overrides | ✅ launch stage, RAAN, phase, failures, gateway outages, environment |
| Simulation API | ✅ synchronous, content-addressed, idempotent |
| Snapshot / ephemeris / availability strip / route timeline | ✅ cached |
| Official export `cosmo-A-result-1.0` | ✅ 2160 records, round-trips |
| Variants + comparison | ✅ changed-parameter diff, metric rows, recommendation sentence |
| Resilience (criticality) | ✅ ~2.3 s across a process pool |
| Gateway dependency | ✅ |
| Sensitivity sweep | ✅ finds the 2700 km threshold |
| Optimizer | ✅ job + progress, parameter locks, configurable objective |
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
| Verified in a browser | ✅ real metrics render, failure injection flips the UI in 60 ms and reconciles at ~2.5 s |

### Documentation

| File | Purpose |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Working agreement — hard rules, architecture, conventions |
| [`CLAUDE.md`](../CLAUDE.md) | Claude Code entry point, points at AGENTS.md |
| [`docs/API_CONTRACT.md`](API_CONTRACT.md) | Frontend ↔ backend contract |
| [`docs/DECISIONS.md`](DECISIONS.md) | Every decision with its reason + open questions |
| [`backend/README.md`](../backend/README.md) | How to run and test |
| [`simple.md`](../simple.md) | The case in plain language, for anyone joining |
| [`BRIEF.md`](../BRIEF.md) | Case analysis, graded criteria, questions |

---

## Next

### Backend

1. **Nothing blocking.** The API covers every mandatory case requirement.
2. Optimizer search quality — the coarse grid is coarse. A finer grid or a proper
   local search would find improvements the current one misses. Low priority:
   E3 suggests the baseline is already near-optimal.
3. Prune old runs (`SimulationRunInterface.prune` exists, nothing calls it yet).
4. Deployment: pick a host, get the public URL live. **A14 requires it to stay up
   from code freeze until the end of all defences.**

### Frontend

Everything on the mandatory path is wired to the API. What is left:

1. **Click an outage to jump the timeline to it.** The bands are drawn and
   `outage_windows` carry `start_s`; the click handler is not there yet. The
   organisers named this flow explicitly (A8), so it is the highest-value gap.
2. Partial failure windows in the UI — the config and the backend both support
   `start_s`/`end_s`, only the whole-day case is exposed.
3. A sensitivity view over the ISL sweep; the endpoint and the finding both
   exist, nothing renders them.
4. Keyboard access pass over the new dropdowns.

### Team deliverables

- Public URL, live from code freeze to the end of all defences.
- Repository with a run instruction.
- Presentation that **names which criteria each part covers** — the organisers
  warned the jury may otherwise miss it.
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

Target 90% per client. Full simulation: ~0.15 s.
