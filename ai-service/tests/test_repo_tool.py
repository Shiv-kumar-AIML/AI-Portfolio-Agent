from typing import Any

from app.services.gateway_client import GatewayError
from app.tools.context import ToolContext
from app.tools.repo_tools import GetRepoDetailsTool


class FakeGateway:
    def __init__(self, result: dict[str, Any] | None = None, error: GatewayError | None = None):
        self.result = result
        self.error = error
        self.calls: list[str] = []

    async def github_repo(self, name: str) -> dict[str, Any]:
        self.calls.append(name)
        if self.error:
            raise self.error
        assert self.result is not None
        return self.result


def make_tool(gateway: FakeGateway) -> GetRepoDetailsTool:
    return GetRepoDetailsTool(ToolContext(kb=None, gateway=gateway, session_id=None))  # type: ignore[arg-type]


async def test_returns_repo_details_with_a_readme_citation() -> None:
    gateway = FakeGateway({"name": "aureus_rag", "readme": "# Aureus\nHybrid RAG.", "files": []})
    result = await make_tool(gateway)({"repo": " aureus_rag "})
    assert result.ok
    assert gateway.calls == ["aureus_rag"]
    assert result.data["name"] == "aureus_rag"
    assert result.sources[0]["id"] == "github:aureus_rag"
    assert result.sources[0]["snippet"].startswith("# Aureus")


async def test_unknown_repo_returns_the_real_repo_names() -> None:
    gateway = FakeGateway(
        error=GatewayError("404", status=404, payload={"available": ["aureus_rag", "BERU_AGENT"]})
    )
    result = await make_tool(gateway)({"repo": "nope"})
    assert not result.ok
    assert result.data["availableRepos"] == ["aureus_rag", "BERU_AGENT"]


async def test_github_outage_is_reported_as_data_not_raised() -> None:
    result = await make_tool(FakeGateway(error=GatewayError("down", status=503)))({"repo": "x"})
    assert not result.ok
    assert "unavailable" in result.data["error"]


async def test_label_names_the_repo() -> None:
    assert (
        make_tool(FakeGateway()).label({"repo": "BERU_AGENT"})
        == "Reading the BERU_AGENT repo on GitHub…"
    )
