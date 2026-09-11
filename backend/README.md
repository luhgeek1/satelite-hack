# OrbitGuard backend

Simulation and routing API for the КосмоХакатон 2026 case *«Проектирование
устойчивой спутниковой группировки»*.

## Run it

```bash
# From the repository root — full stack in Docker
cp .env.example .env
docker compose up -d --build
open http://localhost:8080/api/docs
```

Local development against throwaway infrastructure:

```bash
make install      # backend/.venv on Python 3.13
make test-up      # postgres on :55432, redis on :56379
make migrate
make dev          # uvicorn with --reload on :8080
```

## Tests

```bash
make test-unit         # engine only, no infrastructure
make test-integration  # full API, needs `make test-up`
make test              # both
```

`tests/unit/test_reference_metrics.py` pins the calculation to twelve reference
figures across the four official scenarios. If a change moves any of them, the
change is wrong — see [docs/DECISIONS.md](../docs/DECISIONS.md).

## Layout

```
src/
  engine/      pure calculation — no FastAPI, no SQLAlchemy, importable alone
    geometry.py    the organisers' module, vendored byte-for-byte
    scenario.py    load, validate, apply configuration overrides
    routing.py     graph search + the four no-route reasons
    simulate.py    the time-grid loop
    metrics.py     availability, visibility, outage windows
    analysis.py    per-satellite criticality, gateway dependency
    optimizer.py   configuration search and environment sweeps
    export.py      official cosmo-A-result-1.0 document
  domain/      Pydantic wire models — the API contract in code
  database/    SQLAlchemy tables, interfaces, unit of work, redis cache
  service/     orchestration between the API and the engine
  api/v1/      routers
```

The engine imports nothing from the layers above it. That separation is what
`pytest -m unit` relies on, and it is what a technical reviewer can read without
having to install a database.
