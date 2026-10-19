"""Read one of the owner's GitHub repositories in depth (README, file list, languages)."""

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.services.gateway_client import GatewayError
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext


class GetRepoDetailsArgs(BaseModel):
    repo: str = Field(
        description=(
            "Exact repository name, as listed in get_github_activity's allRepos "
            "(e.g. the name of a repo, not a URL)."
        ),
        min_length=1,
        max_length=100,
    )


class GetRepoDetailsTool(BaseTool):
    name = "get_repo_details"
    description = (
        "Read one of the owner's public GitHub repositories: its README, file structure, languages, "
        "topics and dates. Use when a visitor asks how a specific project works, what it is built "
        "with, or about code that is not covered by get_project_details. Call get_github_activity "
        "first if you don't know the exact repo name — its allRepos lists every repo."
    )
    args_schema: ClassVar[type[BaseModel]] = GetRepoDetailsArgs

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        repo = str(args.get("repo") or "").strip()
        return f"Reading the {repo} repo on GitHub…" if repo else "Reading a repo on GitHub…"

    async def run(self, repo: str) -> ToolResult:
        try:
            details = await self.ctx.gateway.github_repo(repo.strip())
        except GatewayError as exc:
            if exc.status == 404:
                return ToolResult(
                    data={
                        "error": f"There is no public repo named '{repo}'.",
                        "availableRepos": exc.payload.get("available", []),
                    },
                    ok=False,
                )
            return ToolResult(data={"error": f"GitHub is unavailable right now ({exc})."}, ok=False)
        readme = details.get("readme") or ""
        return ToolResult(
            data=details,
            sources=[
                {
                    "id": f"github:{details.get('name', repo)}",
                    "title": f"GitHub · {details.get('name', repo)}",
                    "section": "README" if readme else "Repository",
                    "snippet": (readme or details.get("description") or "")[:240],
                }
            ],
        )
