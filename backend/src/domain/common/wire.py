"""Base models for everything crossing the wire.

The whole API speaks the official case dialect: `snake_case` keys, angles in
degrees, times in **seconds from the start of the run** (`t_s`). That is a
deliberate choice over the prettier camelCase/minutes pairing, because the
scenario we import, the result we export and the payloads in between then all
use one vocabulary — and `t_s` is the only unit that stays exact when a jury
file arrives with, say, `step_s: 90`.
"""

from pydantic import BaseModel, ConfigDict


class WireModel(BaseModel):
    """Strict by default: an unknown key in a request is a mistake worth naming."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CamelModel(BaseModel):
    """Escape hatch for payloads that must mirror a third-party camelCase shape."""

    model_config = ConfigDict(extra="ignore", populate_by_name=True)
