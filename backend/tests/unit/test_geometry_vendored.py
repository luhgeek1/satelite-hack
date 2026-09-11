"""`src/engine/geometry.py` must stay byte-identical to the case archive.

Our physics is the organisers' physics; the moment this test fails, either the
copy drifted or the archive was updated, and both need a human decision rather
than a silent divergence in the numbers we show the jury.
"""

import hashlib
from pathlib import Path

import pytest

from tests.conftest import CASE_GEOMETRY

pytestmark = pytest.mark.unit

VENDORED = Path(__file__).resolve().parent.parent.parent / "src" / "engine" / "geometry.py"


@pytest.mark.skipif(not CASE_GEOMETRY.exists(), reason="case archive not present")
def test_vendored_geometry_matches_case_archive():
    ours = hashlib.sha256(VENDORED.read_bytes()).hexdigest()
    theirs = hashlib.sha256(CASE_GEOMETRY.read_bytes()).hexdigest()
    assert ours == theirs, (
        "engine/geometry.py has drifted from the case archive. "
        "Re-copy it rather than editing: the reference metrics depend on it."
    )
