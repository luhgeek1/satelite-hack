from database.relational_db import UoW


class EnsureUoW:
    def __init__(self, *args, uow: UoW, **kwargs) -> None:
        super().__init__(*args, **kwargs)
        self.uow = uow
