"""The one write tool: deliver a visitor's message to the owner."""

from typing import Any, ClassVar

from pydantic import BaseModel, EmailStr, Field

from app.services.gateway_client import GatewayError
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext


class SendMessageArgs(BaseModel):
    name: str = Field(
        description="The visitor's name, exactly as they typed it.", min_length=1, max_length=100
    )
    email: EmailStr = Field(description="The visitor's email address, exactly as they typed it.")
    message: str = Field(
        description="The message to deliver, in the visitor's own words.",
        min_length=5,
        max_length=2000,
    )


class SendMessageTool(BaseTool):
    name = "send_message"
    description = (
        "Send a message from the visitor to the owner's inbox. ONLY call this after the visitor has "
        "typed their name, their email and what they want to say in this conversation, and has "
        "asked you to send it. Never invent or guess any of the three."
    )
    args_schema: ClassVar[type[BaseModel]] = SendMessageArgs
    is_write = True
    ui_card = "message_sent"

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        return "Sending your message…"

    async def run(self, name: str, email: str, message: str) -> ToolResult:
        try:
            await self.ctx.gateway.send_message(
                name=name, email=email, message=message, session_id=self.ctx.session_id
            )
        except GatewayError as exc:
            return ToolResult(data={"error": f"The message could not be sent ({exc})."}, ok=False)
        receipt = {"name": name, "email": email, "status": "delivered"}
        return ToolResult(data=receipt, ui=receipt)
