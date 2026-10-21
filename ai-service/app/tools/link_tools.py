"""Open one of the owner's links in the visitor's ShivOS browser."""

from typing import Any, ClassVar
from urllib.parse import urlsplit

from pydantic import BaseModel, Field

from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext


class OpenLinkArgs(BaseModel):
    url: str = Field(
        description=(
            "The full https URL to open, copied exactly from a tool result (a GitHub repo or "
            "profile URL, a LinkedIn URL, a project demo link)."
        ),
        min_length=8,
        max_length=300,
    )


def _github_user(url: str) -> str:
    parts = urlsplit(url)
    if parts.hostname not in ("github.com", "www.github.com"):
        return ""
    return parts.path.strip("/").split("/")[0].lower()


class OpenLinkTool(BaseTool):
    name = "open_link"
    description = (
        "Open a link in a new tab of the browser on the visitor's screen. First OFFER it (e.g. "
        "'Want me to open the repo on GitHub?') and only call this after the visitor says yes. "
        "Only the owner's own links can be opened: their GitHub profile or repos, LinkedIn, other "
        "socials, project demos and the resume — copy the URL from a tool result."
    )
    args_schema: ClassVar[type[BaseModel]] = OpenLinkArgs
    ui_card = "open_link"

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        return "Opening the browser…"

    def _allowed(self, url: str) -> bool:
        profile = self.ctx.kb.content.profile
        known: set[str] = {v for v in (profile.get("socials") or {}).values() if v}
        if profile.get("resumeUrl"):
            known.add(profile["resumeUrl"])
        for project in profile.get("projects") or []:
            known.update(v for v in (project.get("links") or {}).values() if v)
        if url.rstrip("/") in {k.rstrip("/") for k in known}:
            return True
        # any repo of the owner's GitHub account (the profile's username or socials link)
        owners = {
            (profile.get("githubUsername") or "").lower(),
            _github_user((profile.get("socials") or {}).get("github") or ""),
        } - {""}
        return _github_user(url) in owners

    async def run(self, url: str) -> ToolResult:
        url = url.strip()
        if urlsplit(url).scheme != "https" and not url.startswith("/"):
            return ToolResult(data={"error": "Only https links can be opened."}, ok=False)
        if not self._allowed(url):
            return ToolResult(
                data={"error": "That link is not one of the owner's; only their own links open."},
                ok=False,
            )
        opened = {"url": url, "status": "opened in the visitor's browser"}
        return ToolResult(data=opened, ui={"url": url})
