FROM python:3.13-slim

WORKDIR /app

ENV POETRY_NO_INTERACTION=1 \
    POETRY_VIRTUALENVS_CREATE=false \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir "poetry==2.3.2"

COPY pyproject.toml poetry.lock* ./
RUN poetry install --only main --no-root

COPY src ./src
COPY entry.sh .

# The official case scenarios are bind-mounted at /app/data by compose and
# seeded into Postgres on startup.
ENV PYTHONPATH=/app/src \
    SCENARIO_SEED_DIR=/app/data

RUN chmod +x entry.sh

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/ping', timeout=5)"

ENTRYPOINT ["./entry.sh"]
