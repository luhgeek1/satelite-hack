from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "data"
CASE_GEOMETRY = REPO_ROOT / "case" / "Расчетный модуль" / "geometry.py"


@pytest.fixture(scope="session")
def data_dir() -> Path:
    return DATA_DIR


@pytest.fixture(scope="session")
def full_constellation():
    from engine import load_scenario

    return load_scenario(DATA_DIR / "01_full_constellation.json")
