"""Hybrid retriever: BM25 + dense cosine similarity, merged with reciprocal-rank fusion.

RRF uses only each list's ranks, never raw scores, so the two very differently scaled signals combine
without any tuning: score(d) = Σ 1 / (RRF_K + rank_in_list(d)). A chunk ranked well by both wins;
a chunk found by only one still surfaces. If embeddings are unavailable the retriever degrades to
BM25 alone instead of failing.
"""

from dataclasses import dataclass

import numpy as np

from app.core.logging import get_logger
from app.rag.bm25 import BM25
from app.rag.chunker import Chunk
from app.rag.embedder import Embedder, Matrix

logger = get_logger(__name__)

RRF_K = 60
CANDIDATES_PER_LIST = 20


@dataclass(frozen=True)
class SearchHit:
    chunk: Chunk
    score: float  # fused RRF score
    lexical_rank: int | None
    dense_rank: int | None


class HybridRetriever:
    def __init__(self, chunks: list[Chunk], embedder: Embedder | None = None) -> None:
        self.chunks = chunks
        self._bm25 = BM25([c.text for c in chunks])
        self._embedder = embedder
        self._vectors: Matrix | None = None
        if embedder is not None and chunks:
            try:
                self._vectors = embedder.embed_documents([c.text for c in chunks])
            except Exception:
                logger.exception("Embedding the corpus failed — falling back to BM25 only")
                self._embedder = None

    @property
    def dense_enabled(self) -> bool:
        return self._vectors is not None

    def _lexical_ranking(self, query: str, allowed: list[int]) -> list[int]:
        scores = self._bm25.scores(query)
        ranked = sorted((i for i in allowed if scores[i] > 0), key=lambda i: -scores[i])
        return ranked[:CANDIDATES_PER_LIST]

    def _dense_ranking(self, query: str, allowed: list[int]) -> list[int]:
        if self._vectors is None or self._embedder is None:
            return []
        try:
            query_vector = self._embedder.embed_query(query)
        except Exception:
            logger.exception("Query embedding failed — using BM25 only for this query")
            return []
        similarities = self._vectors[allowed] @ query_vector
        order = np.argsort(-similarities)[:CANDIDATES_PER_LIST]
        return [allowed[int(i)] for i in order]

    def search(self, query: str, top_k: int = 5, project: str | None = None) -> list[SearchHit]:
        allowed = [i for i, c in enumerate(self.chunks) if project is None or c.project == project]
        if not allowed or not query.strip():
            return []

        lexical = self._lexical_ranking(query, allowed)
        dense = self._dense_ranking(query, allowed)

        fused: dict[int, float] = {}
        lexical_rank: dict[int, int] = {}
        dense_rank: dict[int, int] = {}
        for rank, idx in enumerate(lexical, start=1):
            fused[idx] = fused.get(idx, 0.0) + 1.0 / (RRF_K + rank)
            lexical_rank[idx] = rank
        for rank, idx in enumerate(dense, start=1):
            fused[idx] = fused.get(idx, 0.0) + 1.0 / (RRF_K + rank)
            dense_rank[idx] = rank

        best = sorted(fused, key=lambda i: -fused[i])[:top_k]
        return [
            SearchHit(
                chunk=self.chunks[i],
                score=fused[i],
                lexical_rank=lexical_rank.get(i),
                dense_rank=dense_rank.get(i),
            )
            for i in best
        ]
