from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    def __repr__(self) -> str:
        columns = ", ".join(f"{name}={getattr(self, name)!r}" for name in self.__mapper__.columns)
        return f"<{self.__class__.__name__}({columns})>"
