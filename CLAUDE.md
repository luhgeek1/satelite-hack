# CLAUDE.md

**Read [`AGENTS.md`](AGENTS.md) first.** It holds the working agreement for this
repository — hard rules, architecture, wire conventions, commands. This file only
adds what is specific to working here with Claude Code.

## Orientation, in order

1. [`AGENTS.md`](AGENTS.md) — rules and architecture. Non-negotiable.
2. [`docs/STATE.md`](docs/STATE.md) — what exists right now and what is next.
3. [`docs/DECISIONS.md`](docs/DECISIONS.md) — every decision with its reason, and
   the open questions. Check here before re-litigating a choice.
4. [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) — the frontend↔backend contract.
5. [`simple.md`](simple.md) / [`BRIEF.md`](BRIEF.md) — the case in plain language,
   and the graded criteria.

## Before you change anything

- `make test` must be green before and after. 84 tests.
- Never edit `backend/src/engine/geometry.py`. It is the organisers' file,
  vendored byte-for-byte and checksum-tested.
- Never adjust the expected values in `tests/unit/test_reference_metrics.py` to
  make a test pass. Those twelve numbers are the contract with the jury.
- Never hardcode a ground-site id, satellite count or time step. The jury
  uploads a file with different coordinates.

## Committing

Read [`AGENTS.md`](AGENTS.md) §6 before your first commit in a session, and
follow it for every commit after.

The short version: commit in logical blocks **as you work**, not once at the
end. English imperative subjects. No `Co-Authored-By` trailers, no tool
attribution. A task that produces a data layer, some widgets and a wiring step
is several commits, not one.

## Working notes

- Source of truth order: **official case PDFs → `geometry.py` → the Q&A
  transcript → our measurements → product decisions**. `recommendation.md` is an
  early third-party analysis and contains at least one wrong figure
  (`04_link_range` availability); prefer `BRIEF.md` and the reference tests.
- The backend venv is at `backend/.venv` on Python 3.13. System `python3` is
  3.11 and will not run this project.
- Integration tests need `make test-up` first; they talk to postgres on 55432
  and redis on 56379 so they never collide with a dev stack.
- When adding an endpoint: domain model → service method → router, then a test
  at whichever level the logic lives. Routers stay thin.
- Record any decision worth remembering in `docs/DECISIONS.md` with its reason,
  and update `docs/STATE.md` when the shape of the work changes.
