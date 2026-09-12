from pydantic import BaseModel, ConfigDict


class WireModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CamelModel(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)
