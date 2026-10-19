"""Structured-profile tools. Each returns the data for the model AND a card for the UI."""

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.tools.base import BaseTool, NoArgs, ToolResult
from app.tools.context import ToolContext


class _ProfileTool(BaseTool):
    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    @property
    def profile(self) -> dict[str, Any]:
        return self.ctx.kb.content.profile


class GetProfileTool(_ProfileTool):
    name = "get_profile"
    description = (
        "Get the owner's introduction: name, title, short bio, location, availability and "
        "highlights. Use for 'who are you', 'tell me about yourself', or a first hello."
    )
    args_schema: ClassVar[type[BaseModel]] = NoArgs
    ui_card = "profile"

    def label(self, args: dict[str, Any]) -> str:
        return "Pulling up my intro…"

    async def run(self) -> ToolResult:
        p = self.profile
        card = {
            key: p.get(key)
            for key in (
                "name",
                "title",
                "tagline",
                "bio",
                "location",
                "availability",
                "avatar",
                "highlights",
                "socials",
            )
        }
        return ToolResult(data=card, ui=card)


class GetSkillsArgs(BaseModel):
    category: str | None = Field(
        default=None, description="Optional skill category to filter by, e.g. 'Backend'."
    )


class GetSkillsTool(_ProfileTool):
    name = "get_skills"
    description = "Get the owner's skills grouped by category (tech stack, tools, languages)."
    args_schema: ClassVar[type[BaseModel]] = GetSkillsArgs
    ui_card = "skills"

    def label(self, args: dict[str, Any]) -> str:
        return "Listing my skills…"

    async def run(self, category: str | None = None) -> ToolResult:
        groups = self.profile.get("skills", [])
        if category:
            wanted = category.strip().lower()
            matching = [g for g in groups if wanted in g.get("category", "").lower()]
            groups = matching or groups  # an unknown category shows everything rather than nothing
        return ToolResult(data={"skills": groups}, ui={"skills": groups})


class GetExperienceTool(_ProfileTool):
    name = "get_experience"
    description = (
        "Get the owner's work experience (roles, companies, dates, highlights) and education."
    )
    args_schema: ClassVar[type[BaseModel]] = NoArgs
    ui_card = "experience"

    def label(self, args: dict[str, Any]) -> str:
        return "Opening my experience timeline…"

    async def run(self) -> ToolResult:
        data = {
            "experience": self.profile.get("experience", []),
            "education": self.profile.get("education", []),
        }
        return ToolResult(data=data, ui=data)


class GetResumeTool(_ProfileTool):
    name = "get_resume"
    description = "Get the owner's resume/CV download link with a one-paragraph summary."
    args_schema: ClassVar[type[BaseModel]] = NoArgs
    ui_card = "resume"

    def label(self, args: dict[str, Any]) -> str:
        return "Fetching my resume…"

    async def run(self) -> ToolResult:
        p = self.profile
        latest = (p.get("experience") or [{}])[0]
        card = {
            "name": p.get("name"),
            "title": p.get("title"),
            "resumeUrl": p.get("resumeUrl"),
            "summary": p.get("bio"),
            "currentRole": (
                f"{latest.get('role')} at {latest.get('company')}" if latest.get("role") else None
            ),
            "topSkills": [s for g in p.get("skills", [])[:2] for s in g.get("items", [])[:4]],
        }
        return ToolResult(data=card, ui=card)


class GetContactTool(_ProfileTool):
    name = "get_contact"
    description = (
        "Get the owner's contact details and social links (email, LinkedIn, GitHub, booking link). "
        "Use when someone wants to reach out, hire, or connect."
    )
    args_schema: ClassVar[type[BaseModel]] = NoArgs
    ui_card = "contact"

    def label(self, args: dict[str, Any]) -> str:
        return "Getting my contact details…"

    async def run(self) -> ToolResult:
        p = self.profile
        socials = {k: v for k, v in (p.get("socials") or {}).items() if v}
        card = {
            "name": p.get("name"),
            "email": p.get("email"),
            "location": p.get("location"),
            "availability": p.get("availability"),
            "calendlyUrl": p.get("calendlyUrl") or None,
            "socials": socials,
        }
        return ToolResult(data=card, ui=card)
