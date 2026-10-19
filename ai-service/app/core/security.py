"""Internal service authentication: only the api gateway may call this service."""

import hmac
from typing import Annotated

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


def is_valid_internal_key(provided: str | None) -> bool:
    """Constant-time comparison — a plain `==` leaks how many leading characters matched."""
    expected = get_settings().INTERNAL_SERVICE_KEY.get_secret_value()
    if not expected or not provided:
        return False
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))


async def verify_internal_key(
    x_internal_service_key: Annotated[str | None, Header(alias="X-Internal-Service-Key")] = None,
) -> None:
    if not is_valid_internal_key(x_internal_service_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid internal service key",
        )
