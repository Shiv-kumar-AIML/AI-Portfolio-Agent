"""RAG tool: hybrid search over everything the owner has written."""

from typing import Any, ClassVar

from pydantic import BaseModel, Field

from app.core.config import get_settings
from app.tools.base import BaseTool, ToolResult
from app.tools.context import ToolContext


class SearchKnowledgeArgs(BaseModel):
    query: str = Field(
        description="A focused search query in plain words, e.g. 'evaluation of the RAG project'.",
        min_length=2,
        max_length=300,
    )
    project: str | None = Field(
        default=None,
        description="Optional project slug to search only that project's write-up.",
    )


class SearchKnowledgeTool(BaseTool):
    name = "search_knowledge"
    description = (
        "Search the owner's knowledge base (bio, project deep-dives, experience, FAQ) with hybrid "
        "keyword + semantic retrieval. Use it for any detailed or open question — how something was "
        "built, decisions, results, opinions, availability — that the structured tools don't answer. "
        "Call it again with a different query if the first results don't cover the question."
    )
    args_schema: ClassVar[type[BaseModel]] = SearchKnowledgeArgs

    def __init__(self, ctx: ToolContext) -> None:
        self.ctx = ctx

    def label(self, args: dict[str, Any]) -> str:
        query = str(args.get("query", "")).strip()
        return f"Searching my notes for “{query[:60]}”…" if query else "Searching my notes…"

    async def run(self, query: str, project: str | None = None) -> ToolResult:
        hits = self.ctx.kb.retriever.search(query, top_k=get_settings().RAG_TOP_K, project=project)
        if not hits:
            return ToolResult(data={"results": [], "note": "Nothing relevant found."})
        results = []
        sources = []
        for hit in hits:
            citation = {
                "id": hit.chunk.id,
                "title": hit.chunk.title,
                "section": hit.chunk.section,
            }
            results.append({**citation, "text": hit.chunk.body})
            sources.append(
                {**citation, "snippet": hit.chunk.body[:240], "score": round(hit.score, 4)}
            )
        return ToolResult(data={"results": results}, sources=sources)
