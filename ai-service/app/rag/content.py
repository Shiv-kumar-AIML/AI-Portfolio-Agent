"""Loads the owner's content: the structured profile and the long-form knowledge markdown.

`content/` is the single source of truth shared with the api gateway (mounted read-only in Docker).
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class MarkdownDoc:
    doc_id: str  # path relative to knowledge/, without extension — e.g. "projects/doc-qa-rag"
    title: str
    body: str
    meta: dict[str, str] = field(default_factory=dict)

    @property
    def project(self) -> str | None:
        return self.meta.get("project")


@dataclass(frozen=True)
class Content:
    profile: dict[str, Any]
    docs: list[MarkdownDoc]

    def project(self, slug: str) -> dict[str, Any] | None:
        for project in self.profile.get("projects", []):
            if project.get("slug") == slug:
                return dict(project)
        return None

    def project_doc(self, slug: str) -> MarkdownDoc | None:
        return next((d for d in self.docs if d.project == slug), None)


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    """Split a `---` frontmatter block of flat `key: value` lines from the body."""
    if not text.startswith("---"):
        return {}, text
    end = text.find("\n---", 3)
    if end == -1:
        return {}, text
    meta: dict[str, str] = {}
    for line in text[3:end].strip().splitlines():
        key, sep, value = line.partition(":")
        if sep:
            meta[key.strip()] = value.strip().strip("\"'")
    return meta, text[end + 4 :].lstrip("\n")


def load_content(content_dir: Path) -> Content:
    profile_path = content_dir / "profile.json"
    profile: dict[str, Any] = json.loads(profile_path.read_text(encoding="utf-8"))
    profile.pop("_note", None)

    docs: list[MarkdownDoc] = []
    knowledge_dir = content_dir / "knowledge"
    for path in sorted(knowledge_dir.rglob("*.md")):
        meta, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        doc_id = path.relative_to(knowledge_dir).with_suffix("").as_posix()
        docs.append(
            MarkdownDoc(doc_id=doc_id, title=meta.get("title", doc_id), body=body, meta=meta)
        )
    return Content(profile=profile, docs=docs)
