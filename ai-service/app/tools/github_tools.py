"""Live GitHub activity, fetched (and cached) by the api gateway."""

from typing import Any, ClassVar

from pydantic import BaseModel

from app.services.gateway_client import GatewayError
from app.tools.base import BaseTool, NoArgs, ToolResult
from app.tools.context import ToolContext


class GetGithubActivityTool(BaseTool):
    name = "get_github_activity"
    description = (
        "Get the owner's live GitHub stats: public repos, followers, total stars, top languages and "
        "recently updated repositories. Use for questions about open source, code, or GitHub."
    )
    args_schema: ClassVar[type[BaseModel]] = NoArgs
    ui_card = "github"

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        return "Checking my GitHub…"

    async def run(self) -> ToolResult:
        try:
            stats = await self.ctx.gateway.github_activity()
        except GatewayError as exc:
            return ToolResult(
                data={"error": f"GitHub stats are unavailable right now ({exc})."}, ok=False
            )
        return ToolResult(data=stats, ui=stats)
