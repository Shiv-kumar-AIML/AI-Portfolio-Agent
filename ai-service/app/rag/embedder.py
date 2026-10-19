"""Dense embeddings with fastembed (ONNX on CPU) — the semantic half of hybrid retrieval."""

from typing import Protocol, cast

import numpy as np
import numpy.typing as npt

Matrix = npt.NDArray[np.float32]


class Embedder(Protocol):
    def embed_documents(self, texts: list[str]) -> Matrix: ...

    def embed_query(self, text: str) -> Matrix: ...


def _normalize(matrix: Matrix) -> Matrix:
    norms = np.linalg.norm(matrix, axis=-1, keepdims=True)
    return (matrix / np.clip(norms, 1e-12, None)).astype(np.float32)


class FastEmbedEmbedder:
    """Wraps fastembed's TextEmbedding. bge models expect a query instruction prefix, which
    `query_embed` adds — documents go through `passage_embed` without it."""

    def __init__(self, model_name: str, cache_dir: str | None = None) -> None:
        from fastembed import TextEmbedding  # heavy import (onnxruntime) — only when enabled

        self._model = TextEmbedding(model_name=model_name, cache_dir=cache_dir)

    def embed_documents(self, texts: list[str]) -> Matrix:
        return _normalize(np.array(list(self._model.passage_embed(texts)), dtype=np.float32))

    def embed_query(self, text: str) -> Matrix:
        vectors = _normalize(np.array(list(self._model.query_embed(text)), dtype=np.float32))
        return cast(Matrix, vectors[0])
