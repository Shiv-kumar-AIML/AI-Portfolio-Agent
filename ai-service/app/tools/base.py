"""Tool framework: every agent tool is a BaseTool with a Pydantic argument schema."""

from dataclasses import dataclass, field
from typing import Any, ClassVar

from pydantic import BaseModel, ValidationError


@dataclass
class ToolResult:
    """What one tool call produced.

    `data` goes back to the model (as JSON). `ui` — when set — is streamed to the frontend as a
    `tool_result` frame and rendered as that tool's card, so the model does not have to restate it.
    `sources` are RAG citations collected into the turn's `sources` frame.
    """

    data: Any
    ui: Any = None
    sources: list[dict[str, Any]] = field(default_factory=list)
    ok: bool = True


class BaseTool:
    name: ClassVar[str]
    description: ClassVar[str]
    args_schema: ClassVar[type[BaseModel]]
    # Write tools change something outside the conversation; the agent runs them alone, in order.
    is_write: ClassVar[bool] = False
    # Card the frontend renders for this tool's `ui` payload (None = no card).
    ui_card: ClassVar[str | None] = None

    def label(self, args: dict[str, Any]) -> str:
        """The progress line shown in the chat while this tool runs."""
        return "Working on it…"

    async def run(self, *args: Any, **kwargs: Any) -> ToolResult:
        raise NotImplementedError

    async def __call__(self, raw_args: Any) -> ToolResult:
        """Validate the model's arguments, then run. Errors come back as data the model can act on
        instead of exceptions that would end the turn."""
        if not isinstance(raw_args, dict):
            return ToolResult(data={"error": "Arguments must be a JSON object."}, ok=False)
        try:
            args = self.args_schema.model_validate(raw_args)
        except ValidationError as exc:
            problems = "; ".join(
                f"{'.'.join(str(p) for p in err['loc']) or 'arguments'}: {err['msg']}"
                for err in exc.errors()
            )
            return ToolResult(
                data={"error": f"Invalid arguments for {self.name}: {problems}"}, ok=False
            )
        return await self.run(**args.model_dump())

    @classmethod
    def schema(cls) -> dict[str, Any]:
        """OpenAI/Groq function-tool schema."""
        params = cls.args_schema.model_json_schema()
        params.pop("title", None)
        for prop in params.get("properties", {}).values():
            prop.pop("title", None)
        return {
            "type": "function",
            "function": {"name": cls.name, "description": cls.description, "parameters": params},
        }


class NoArgs(BaseModel):
    pass
