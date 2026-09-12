from http import HTTPStatus
from typing import Any


class DomainError(Exception):
    status_code: int = 400
    error_code: str = "DOMAIN_ERROR"
    default_detail: str = "Domain operation failed"

    def __init__(
        self,
        detail: str | None = None,
        *,
        details: Any | None = None,
        error_code: str | None = None,
    ) -> None:
        self.detail = detail or self.default_detail
        self.details = details
        self.error_code = error_code or self.error_code
        super().__init__(self.detail)


class BadRequestError(DomainError):
    status_code = 400
    error_code = "BAD_REQUEST"
    default_detail = "Bad request"


class NotFoundError(DomainError):
    status_code = 404
    error_code = "NOT_FOUND"
    default_detail = "Not found"


class ConflictError(DomainError):
    status_code = 409
    error_code = "CONFLICT"
    default_detail = "Conflict"


class UnprocessableEntityError(DomainError):
    status_code = 422
    error_code = "UNPROCESSABLE_ENTITY"
    default_detail = "Unprocessable entity"


class PayloadTooLargeError(DomainError):
    status_code = 413
    error_code = "PAYLOAD_TOO_LARGE"
    default_detail = "Payload too large"


class ScenarioValidationError(UnprocessableEntityError):
    error_code = "SCENARIO_INVALID"
    default_detail = "Scenario failed validation"

    def __init__(self, detail: str, *, field: str | None = None) -> None:
        super().__init__(detail, details={"field": field} if field else None)
        self.field = field


def status_title(status_code: int) -> str:
    try:
        return HTTPStatus(status_code).phrase
    except ValueError:
        return "Error"
