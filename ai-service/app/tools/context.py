"""Per-turn dependencies handed to every tool."""

from dataclasses import dataclass

from app.rag.knowledge_base import KnowledgeBase
from app.services.gateway_client import GatewayClient


@dataclass(frozen=True)
class ToolContext:
    kb: KnowledgeBase
    gateway: GatewayClient
    session_id: str | None = None
