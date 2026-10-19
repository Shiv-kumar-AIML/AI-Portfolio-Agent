"""Tool registry."""

from app.tools.base import BaseTool, ToolResult
from app.tools.contact_tools import SendMessageTool
from app.tools.context import ToolContext
from app.tools.github_tools import GetGithubActivityTool
from app.tools.knowledge_tools import SearchKnowledgeTool
from app.tools.profile_tools import (
    GetContactTool,
    GetExperienceTool,
    GetProfileTool,
    GetResumeTool,
    GetSkillsTool,
)
from app.tools.project_tools import GetProjectDetailsTool, GetProjectsTool

TOOL_CLASSES: tuple[type[BaseTool], ...] = (
    SearchKnowledgeTool,
    GetProfileTool,
    GetProjectsTool,
    GetProjectDetailsTool,
    GetSkillsTool,
    GetExperienceTool,
    GetResumeTool,
    GetContactTool,
    GetGithubActivityTool,
    SendMessageTool,
)


def build_tools(ctx: ToolContext) -> dict[str, BaseTool]:
    tools: dict[str, BaseTool] = {}
    for cls in TOOL_CLASSES:
        tools[cls.name] = cls(ctx)  # type: ignore[call-arg]
    return tools


__all__ = ["TOOL_CLASSES", "BaseTool", "ToolContext", "ToolResult", "build_tools"]
