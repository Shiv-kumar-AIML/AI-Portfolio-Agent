"""HTTP client for the api gateway's /internal/* routes (GitHub stats, visitor messages).

The api owns live data and side effects (cached GitHub calls with its token, the messages table,
notifications); this service only asks for them, authenticated with the internal service key.
"""

from typing import Any
from urllib.parse import quote

import httpx

from app.core.config import get_settings

_client: httpx.AsyncClient | None = None


class GatewayError(Exception):
    def __init__(
        self, message: str, *, status: int | None = None, payload: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.payload = payload or {}


def _get_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        settings = get_settings()
        _client = httpx.AsyncClient(
            base_url=settings.API_GATEWAY_URL.rstrip("/"),
            timeout=httpx.Timeout(10.0),
            headers={"X-Internal-Service-Key": settings.INTERNAL_SERVICE_KEY.get_secret_value()},
        )
    return _client


async def close_gateway_client() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None


class GatewayClient:
    async def _request(self, method: str, path: str, **kwargs: Any) -> Any:
        try:
            response = await _get_client().request(method, path, **kwargs)
        except httpx.HTTPError as exc:
            raise GatewayError(f"api gateway unreachable: {exc.__class__.__name__}") from exc
        if response.status_code >= 400:
            payload: dict[str, Any] = {}
            try:
                body = response.json()
                payload = body if isinstance(body, dict) else {}
                detail = payload.get("message", response.text)
            except ValueError:
                detail = response.text
            raise GatewayError(
                f"api gateway returned {response.status_code}: {detail}",
                status=response.status_code,
                payload=payload,
            )
        return response.json()

    async def github_activity(self) -> dict[str, Any]:
        result: dict[str, Any] = await self._request("GET", "/internal/github")
        return result

    async def github_repo(self, name: str) -> dict[str, Any]:
        # The api validates the name and only serves the owner's own repos; quote it all the same.
        result: dict[str, Any] = await self._request(
            "GET", f"/internal/github/repos/{quote(name, safe='')}"
        )
        return result

    async def send_message(
        self, *, name: str, email: str, message: str, session_id: str | None
    ) -> dict[str, Any]:
        result: dict[str, Any] = await self._request(
            "POST",
            "/internal/messages",
            json={"name": name, "email": email, "message": message, "sessionId": session_id},
        )
        return result
