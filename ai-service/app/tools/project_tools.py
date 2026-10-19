"""Project tools: the project list and a single project's deep-dive."""

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext

_DEEP_DIVE_MAX_CHARS = 4000


class GetProjectsArgs(BaseModel):
    tag: str | None = Field(
        default=None,
        description="Optional tag or technology to filter by, e.g. 'RAG' or 'PyTorch'.",
    )
    featured_only: bool = Field(default=False, description="Only the owner's featured projects.")


class GetProjectsTool(BaseTool):
    name = "get_projects"
    description = (
        "List the owner's projects (title, one-line summary, tags, stack, metrics, links). Use for "
        "'show me your projects' or 'what have you built with X'. Each project has a `slug` for "
        "get_project_details."
    )
    args_schema: ClassVar[type[BaseModel]] = GetProjectsArgs
    ui_card = "projects"

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        tag = args.get("tag")
        return f"Finding my {tag} projects…" if tag else "Loading my projects…"

    async def run(self, tag: str | None = None, featured_only: bool = False) -> ToolResult:
        projects = list(self.ctx.kb.content.profile.get("projects", []))
        if featured_only:
            projects = [p for p in projects if p.get("featured")]
        note = None
        if tag:
            wanted = tag.strip().lower()
            matching = [
                p
                for p in projects
                if any(wanted in t.lower() for t in [*p.get("tags", []), *p.get("stack", [])])
            ]
            if matching:
                projects = matching
            else:
                note = f"No project is tagged '{tag}'; showing all projects instead."
        data: dict[str, Any] = {"projects": projects}
        if note:
            data["note"] = note
        return ToolResult(data=data, ui={"projects": projects})


class GetProjectDetailsArgs(BaseModel):
    slug: str = Field(description="The project's slug, as returned by get_projects.")


class GetProjectDetailsTool(BaseTool):
    name = "get_project_details"
    description = (
        "Get one project's full deep-dive: problem, approach, architecture, results, stack and links. "
        "Use when the visitor asks about a specific project."
    )
    args_schema: ClassVar[type[BaseModel]] = GetProjectDetailsArgs
    ui_card = "project"

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        return "Opening the project write-up…"

    async def run(self, slug: str) -> ToolResult:
        content = self.ctx.kb.content
        project = content.project(slug.strip())
        if project is None:
            slugs = [p.get("slug") for p in content.profile.get("projects", [])]
            return ToolResult(
                data={"error": f"Unknown project slug '{slug}'. Valid slugs: {slugs}"}, ok=False
            )
        doc = content.project_doc(project["slug"])
        write_up = doc.body[:_DEEP_DIVE_MAX_CHARS] if doc else None
        return ToolResult(
            data={**project, "writeUp": write_up or "No long-form write-up for this project yet."},
            ui=project,
            sources=(
                [
                    {
                        "id": f"{doc.doc_id}#doc",
                        "title": doc.title,
                        "section": "",
                        "snippet": doc.body[:240],
                    }
                ]
                if doc
                else []
            ),
        )
