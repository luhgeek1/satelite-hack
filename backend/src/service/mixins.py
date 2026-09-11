from database.relational_db import UoW


class EnsureUoW:
    """Mixin guaranteeing a unit of work on the service."""

    def __init__(self, *args, uow: UoW, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.uow = uow
