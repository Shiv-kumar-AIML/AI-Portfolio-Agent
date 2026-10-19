import numpy as np

from app.rag.bm25 import BM25, tokenize
from app.rag.chunker import chunk_markdown, chunk_profile
from app.rag.content import MarkdownDoc, parse_frontmatter
from app.rag.retriever import HybridRetriever


def test_frontmatter_is_split_from_body() -> None:
    meta, body = parse_frontmatter("---\ntitle: Hello\nproject: demo\n---\n\n# Hi\ntext")
    assert meta == {"title": "Hello", "project": "demo"}
    assert body.startswith("# Hi")


def test_markdown_chunks_follow_headings_and_drop_repeated_title() -> None:
    doc = MarkdownDoc(
        doc_id="projects/demo",
        title="Demo",
        body="# Demo\nintro text\n\n## Approach\nstep one\n\n### Details\nfine print\n\n## Results\nwon",
        meta={"project": "demo"},
    )
    chunks = chunk_markdown(doc)
    assert [c.section for c in chunks] == ["", "Approach", "Approach › Details", "Results"]
    assert all(c.project == "demo" for c in chunks)
    assert chunks[1].text.startswith("Demo — Approach\n")


def test_h1_that_shortens_the_title_is_dropped_from_sections() -> None:
    doc = MarkdownDoc(
        doc_id="d", title="Agent (this website)", body="# Agent\nintro\n\n## How\nsteps"
    )
    assert [c.section for c in chunk_markdown(doc)] == ["", "How"]


def test_long_sections_are_windowed_with_overlap() -> None:
    paragraphs = [f"paragraph {i} " + "x" * 300 for i in range(6)]
    doc = MarkdownDoc(doc_id="d", title="D", body="## S\n" + "\n\n".join(paragraphs))
    chunks = chunk_markdown(doc, max_chars=700)
    assert len(chunks) > 1
    for first, second in zip(chunks, chunks[1:], strict=False):
        last_para = first.body.split("\n\n")[-1]
        assert second.body.startswith(last_para)  # one-paragraph overlap


def test_profile_chunks_one_per_entity() -> None:
    profile = {
        "name": "Ada",
        "title": "ML Engineer",
        "bio": "Builds things.",
        "skills": [{"category": "ML", "items": ["PyTorch"]}],
        "experience": [{"company": "Acme", "role": "Engineer", "start": "2024", "end": None}],
        "education": [{"institution": "Uni", "degree": "BSc"}],
        "projects": [{"slug": "p1", "title": "P1", "tags": ["RAG"], "stack": []}],
    }
    ids = [c.id for c in chunk_profile(profile)]
    assert ids == [
        "profile#bio",
        "profile#skills-ML",
        "profile#exp-Acme",
        "profile#edu-Uni",
        "profile#project-p1",
    ]
    edu = next(c for c in chunk_profile(profile) if c.id == "profile#edu-Uni")
    assert "where I studied" in edu.text  # contextual hint is searchable
    assert "where I studied" not in edu.body  # …but not shown as the citation


def test_tokenizer_stems_and_drops_stopwords() -> None:
    assert tokenize("What projects have you deployed?") == ["project", "deploy"]
    assert tokenize("studied") == tokenize("study")


def test_bm25_ranks_the_matching_document_first() -> None:
    bm25 = BM25(["forecasting with xgboost", "rag chatbot with embeddings", "react frontend"])
    scores = bm25.scores("xgboost forecast")
    assert scores.index(max(scores)) == 0
    assert scores[2] == 0


class _FakeEmbedder:
    """Maps each text to a one-hot vector by its first keyword."""

    vocab = ["forecast", "rag", "react"]

    def _vec(self, text: str) -> np.ndarray:
        v = np.array([1.0 if k in text.lower() else 0.0 for k in self.vocab], dtype=np.float32)
        return v / (np.linalg.norm(v) or 1.0)

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return np.stack([self._vec(t) for t in texts])

    def embed_query(self, text: str) -> np.ndarray:
        return self._vec(text)


def _chunks(texts: list[str]):  # type: ignore[no-untyped-def]
    from app.rag.chunker import Chunk

    return [
        Chunk(
            id=str(i),
            doc_id="d",
            title="t",
            section="",
            text=t,
            body=t,
            project="p" if i == 0 else None,
        )
        for i, t in enumerate(texts)
    ]


def test_hybrid_retrieval_fuses_both_rankings() -> None:
    chunks = _chunks(["forecast sales", "rag pipeline", "react app"])
    retriever = HybridRetriever(chunks, _FakeEmbedder())
    assert retriever.dense_enabled
    hits = retriever.search("rag", top_k=2)
    assert hits[0].chunk.id == "1"
    assert hits[0].lexical_rank == 1 and hits[0].dense_rank == 1


def test_retrieval_filters_by_project() -> None:
    retriever = HybridRetriever(_chunks(["forecast sales", "forecast again"]), None)
    assert [h.chunk.id for h in retriever.search("forecast", project="p")] == ["0"]


def test_retriever_degrades_to_bm25_when_embedding_fails() -> None:
    class Broken(_FakeEmbedder):
        def embed_documents(self, texts: list[str]) -> np.ndarray:
            raise RuntimeError("model missing")

    retriever = HybridRetriever(_chunks(["forecast sales", "rag pipeline"]), Broken())
    assert not retriever.dense_enabled
    assert retriever.search("rag")[0].chunk.id == "1"


async def test_knowledge_base_builds_from_repo_content(kb) -> None:  # type: ignore[no-untyped-def]
    status = kb.status()
    assert status["ready"] and status["chunks"] > 10
    assert kb.content.project("doc-qa-rag") is not None
    hits = kb.retriever.search("hybrid retrieval recall evaluation")
    assert any(h.chunk.project == "doc-qa-rag" for h in hits)
