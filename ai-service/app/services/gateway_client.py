"""HTTP client for the api gateway's /internal/* routes (GitHub stats, visitor messages).

The api owns live data and side effects (cached GitHub calls with its token, the messages table,
notifications); this service only asks for them, authenticated with the internal service key.
"""

from typing import Any

import httpx

from app.core.config import get_settings

_client: httpx.AsyncClient | None = None


class GatewayError(Exception):
    pass


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
            try:
                detail = response.json().get("message", response.text)
            except ValueError:
                detail = response.text
            raise GatewayError(f"api gateway returned {response.status_code}: {detail}")
        return response.json()

    async def github_activity(self) -> dict[str, Any]:
        result: dict[str, Any] = await self._request("GET", "/internal/github")
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
