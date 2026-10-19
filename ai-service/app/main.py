"""FastAPI application entry point."""

import asyncio
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.routes import health, internal
from app.core.config import get_settings
from app.core.logging import get_logger, setup_logging
from app.rag.knowledge_base import knowledge_base
from app.services.gateway_client import close_gateway_client

logger = get_logger(__name__)


async def _build_knowledge_base() -> None:
    try:
        await knowledge_base.build()
    except Exception:
        logger.exception("Building the knowledge base failed — /health/ready stays 503")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    logger.info(
        "Starting portfolio ai-service (env=%s, host=%s, port=%d, model=%s)",
        settings.ENVIRONMENT,
        settings.HOST,
        settings.PORT,
        settings.LLM_MODEL,
    )
    if not settings.GROQ_API_KEY.get_secret_value():
        logger.warning("GROQ_API_KEY is not set — chat requests will return 503")
    # Build in the background so the process answers /health immediately; /health/ready flips
    # once the index is in place (embedding the corpus takes a few seconds on CPU).
    build_task = asyncio.create_task(_build_knowledge_base())
    yield
    build_task.cancel()
    await close_gateway_client()


def create_app() -> FastAPI:
    settings = get_settings()
    setup_logging(settings.LOG_LEVEL)
    docs = settings.is_development  # internal-only service: no public schema outside dev
    application = FastAPI(
        title="Portfolio AI Service",
        description="Internal tool-calling agent + hybrid RAG for the portfolio",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/docs" if docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if docs else None,
    )
    application.include_router(health.router)
    application.include_router(internal.router)
    return application


app = create_app()

if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.is_development,
        reload_dirs=["app"] if settings.is_development else None,
    )
