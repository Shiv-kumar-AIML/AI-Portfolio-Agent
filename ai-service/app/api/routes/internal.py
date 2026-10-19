"""Internal routes, called only by the api gateway with X-Internal-Service-Key."""

import json
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from app.core.logging import get_logger
from app.core.security import verify_internal_key
from app.rag.knowledge_base import knowledge_base
from app.schemas.chat import ChatRequest
from app.services.agent_service import AgentService
from app.services.gateway_client import GatewayClient
from app.services.llm_client import LLMNotConfiguredError, get_llm_client
from app.tools import ToolContext, build_tools

logger = get_logger(__name__)

router = APIRouter(
    prefix="/internal", tags=["Internal"], dependencies=[Depends(verify_internal_key)]
)


def _sse(frame: dict[str, Any]) -> str:
    return f"data: {json.dumps(frame, ensure_ascii=False)}\n\n"


def build_agent(session_id: str | None) -> AgentService:
    if not knowledge_base.ready:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Knowledge base is still loading")
    try:
        client = get_llm_client()
    except LLMNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    ctx = ToolContext(kb=knowledge_base, gateway=GatewayClient(), session_id=session_id)
    return AgentService(
        client=client, tools=build_tools(ctx), profile=knowledge_base.content.profile
    )


@router.post("/chat/stream")
async def chat_stream(body: ChatRequest) -> StreamingResponse:
    if body.messages[-1].role != "user":
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "The last message must be from the user"
        )
    agent = build_agent(body.session_id)

    async def frames() -> AsyncIterator[str]:
        try:
            async for frame in agent.run(body.messages):
                yield _sse(frame)
        except Exception:
            logger.exception("Agent turn crashed")
            yield _sse({"type": "error", "message": "Something went wrong generating a reply."})

    return StreamingResponse(
        frames(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/reindex")
async def reindex() -> dict[str, Any]:
    """Reload content/ and rebuild the hybrid index (after editing profile.json or knowledge/)."""
    await knowledge_base.build()
    return knowledge_base.status()


@router.post("/search")
async def search(body: dict[str, Any]) -> dict[str, Any]:
    """Debug endpoint: raw hybrid-retrieval results for a query (used by the api's admin route)."""
    query = str(body.get("query", "")).strip()
    if not query:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "query is required")
    if not knowledge_base.ready:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Knowledge base is still loading")
    hits = knowledge_base.retriever.search(query, top_k=int(body.get("top_k", 5)))
    return {
        "dense_retrieval": knowledge_base.retriever.dense_enabled,
        "hits": [
            {
                "id": h.chunk.id,
                "section": h.chunk.section,
                "score": round(h.score, 5),
                "lexical_rank": h.lexical_rank,
                "dense_rank": h.dense_rank,
                "text": h.chunk.body,
            }
            for h in hits
        ],
    }
