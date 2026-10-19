"""Health endpoints (unauthenticated, not exposed publicly — nginx never routes to this service)."""

from typing import Any

from fastapi import APIRouter, Response, status

from app.rag.knowledge_base import knowledge_base

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health() -> dict[str, str]:
    """Liveness: the process answers."""
    return {"status": "ok"}


@router.get("/health/ready")
async def ready(response: Response) -> dict[str, Any]:
    """Readiness: the knowledge base is built."""
    kb = knowledge_base.status()
    if not kb.get("ready"):
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return {"status": "ready" if kb.get("ready") else "starting", "knowledge_base": kb}
