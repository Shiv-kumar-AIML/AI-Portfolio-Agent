"""The process-wide knowledge base: loaded content + its hybrid index.

Built once at startup (off the event loop — embedding is CPU work) and rebuilt on
`POST /internal/reindex`. A rebuild swaps the whole snapshot at once, so a search running during a
reindex always sees one consistent version.
"""

import asyncio
import time
from dataclasses import dataclass

from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.rag.chunker import chunk_content
from app.rag.content import Content, load_content
from app.rag.embedder import Embedder, FastEmbedEmbedder
from app.rag.retriever import HybridRetriever

logger = get_logger(__name__)


@dataclass(frozen=True)
class Snapshot:
    content: Content
    retriever: HybridRetriever
    built_at: float


class KnowledgeBase:
    def __init__(self) -> None:
        self._snapshot: Snapshot | None = None
        self._embedder: Embedder | None = None
        self._embedder_failed = False
        self._lock = asyncio.Lock()

    @property
    def ready(self) -> bool:
        return self._snapshot is not None

    @property
    def snapshot(self) -> Snapshot:
        if self._snapshot is None:
            raise RuntimeError("Knowledge base is not built yet")
        return self._snapshot

    @property
    def content(self) -> Content:
        return self.snapshot.content

    @property
    def retriever(self) -> HybridRetriever:
        return self.snapshot.retriever

    def _get_embedder(self, settings: Settings) -> Embedder | None:
        if not settings.EMBEDDINGS_ENABLED or self._embedder_failed:
            return None
        if self._embedder is None:
            try:
                self._embedder = FastEmbedEmbedder(
                    settings.EMBEDDING_MODEL, cache_dir=settings.FASTEMBED_CACHE_DIR
                )
            except Exception:
                # e.g. no network to download the model on first run — keep serving with BM25.
                logger.exception("Could not load embedding model — retrieval will be BM25 only")
                self._embedder_failed = True
                return None
        return self._embedder

    def _build_sync(self, settings: Settings, embedder: Embedder | None) -> Snapshot:
        started = time.monotonic()
        content = load_content(settings.CONTENT_DIR)
        chunks = chunk_content(content)
        retriever = HybridRetriever(chunks, embedder or self._get_embedder(settings))
        logger.info(
            "Knowledge base built: %d docs, %d chunks, dense=%s in %.1fs",
            len(content.docs),
            len(chunks),
            retriever.dense_enabled,
            time.monotonic() - started,
        )
        return Snapshot(content=content, retriever=retriever, built_at=time.time())

    async def build(self, embedder: Embedder | None = None) -> Snapshot:
        async with self._lock:
            snapshot = await asyncio.to_thread(self._build_sync, get_settings(), embedder)
            self._snapshot = snapshot
            return snapshot

    def status(self) -> dict[str, object]:
        if self._snapshot is None:
            return {"ready": False}
        return {
            "ready": True,
            "documents": len(self._snapshot.content.docs),
            "chunks": len(self._snapshot.retriever.chunks),
            "dense_retrieval": self._snapshot.retriever.dense_enabled,
            "built_at": self._snapshot.built_at,
        }


knowledge_base = KnowledgeBase()
