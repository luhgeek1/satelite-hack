.PHONY: help install dev front front-clean up down logs test test-unit test-integration test-up test-down lint format migrate seed api-spec

BACKEND := backend
FRONTEND := frontend
PY      := $(BACKEND)/.venv/bin/python
TEST_DB := postgresql+asyncpg://postgres:secret@localhost:55432/orbitguard_test
TEST_REDIS := redis://localhost:56379/0
TEST_ENV := DATABASE_URL="$(TEST_DB)" REDIS_URL="$(TEST_REDIS)"

help:
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

install:  ## Create the backend venv and install dependencies
	cd $(BACKEND) && uv venv --python 3.13 .venv
	cd $(BACKEND) && uv pip install --python .venv/bin/python -r <(uv pip compile pyproject.toml --all-extras -q -o -) || \
		uv pip install --python .venv/bin/python fastapi "uvicorn[standard]" pydantic-settings sqlalchemy alembic asyncpg greenlet redis orjson numpy python-multipart httpx pytest pytest-asyncio ruff

up:  ## Start the full stack (frontend + backend + postgres + redis) in Docker
	cp -n .env.example .env || true
	cp -n frontend/.env.example frontend/.env.local || true
	docker compose up -d --build


down:  ## Stop the stack
	docker compose down --remove-orphans

logs:  ## Tail backend logs
	docker compose logs -f --tail=200 backend

front:  ## Run the frontend dev server against the API
	cd $(FRONTEND) && npm run dev

front-clean:  ## Same, after discarding the Next build cache
	cd $(FRONTEND) && npm run dev:clean

dev:  ## Run the API locally against the test infrastructure
	cd $(BACKEND)/src && $(TEST_ENV) SCENARIO_SEED_DIR=../../data PYTHONPATH=. \
		../.venv/bin/uvicorn main:app --reload --port 8080

migrate:  ## Apply migrations to the test database
	cd $(BACKEND)/src && $(TEST_ENV) PYTHONPATH=. ../.venv/bin/alembic upgrade head

test-up:  ## Start throwaway postgres + redis for integration tests
	docker compose -f docker-compose.test.yml -p orbitguard-test up -d

test-down:  ## Remove the test infrastructure
	docker compose -f docker-compose.test.yml -p orbitguard-test down -v

test-unit:  ## Engine tests only — no infrastructure needed
	cd $(BACKEND) && .venv/bin/python -m pytest -q -m unit

test-integration:  ## API tests — needs `make test-up` first
	cd $(BACKEND) && $(TEST_ENV) .venv/bin/python -m pytest -q -m integration

test:  ## Everything
	cd $(BACKEND) && $(TEST_ENV) .venv/bin/python -m pytest -q

lint:  ## Check formatting and lint rules
	cd $(BACKEND) && .venv/bin/ruff check src tests

format:  ## Apply formatting
	cd $(BACKEND) && .venv/bin/ruff format src tests && .venv/bin/ruff check --fix src tests

api-spec:  ## Dump the OpenAPI document to docs/openapi.json
	cd $(BACKEND)/src && PYTHONPATH=. ../.venv/bin/python -c "\
import json, sys; from main import create_app; \
json.dump(create_app(check_db_on_startup=False, seed_scenarios=False).openapi(), sys.stdout, indent=2, ensure_ascii=False)" \
		> ../../docs/openapi.json
	@echo "wrote docs/openapi.json"
