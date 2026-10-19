"""Turns content into retrievable chunks.

Markdown is split on headings (a chunk never spans two sections) and long sections are windowed on
paragraph boundaries with a one-paragraph overlap. The structured profile becomes one chunk per
"thing" a visitor asks about — each project, each job, each skill group — so a question like
"what did you do at X?" retrieves exactly that job.
"""

import re
from dataclasses import dataclass
from typing import Any

from app.rag.content import Content, MarkdownDoc

MAX_CHUNK_CHARS = 900
_HEADING = re.compile(r"^(#{1,3})\s+(.+?)\s*#*\s*$")


@dataclass(frozen=True)
class Chunk:
    id: str
    doc_id: str
    title: str  # document title
    section: str  # heading path inside the document, "" for the top
    text: str  # what is embedded / searched: title + section + body
    body: str  # the section text alone, shown as the citation snippet
    project: str | None = None


def _windows(paragraphs: list[str], max_chars: int) -> list[str]:
    """Greedy paragraph packing; each new window starts with the previous window's last paragraph."""
    windows: list[list[str]] = []
    current: list[str] = []
    size = 0
    for para in paragraphs:
        if current and size + len(para) > max_chars:
            windows.append(current)
            current = [current[-1]] if len(current) > 1 else []
            size = sum(len(p) for p in current)
        current.append(para)
        size += len(para)
    if current:
        windows.append(current)
    return ["\n\n".join(w) for w in windows]


def chunk_markdown(doc: MarkdownDoc, max_chars: int = MAX_CHUNK_CHARS) -> list[Chunk]:
    sections: list[tuple[list[str], list[str]]] = []  # (heading path, lines)
    path: list[str] = []
    lines: list[str] = []

    def flush() -> None:
        if any(line.strip() for line in lines):
            sections.append((list(path), list(lines)))
        lines.clear()

    for line in doc.body.splitlines():
        match = _HEADING.match(line)
        if match:
            flush()
            level = len(match.group(1))
            path[:] = path[: level - 1] + [match.group(2)]
        else:
            lines.append(line)
    flush()

    chunks: list[Chunk] = []
    for heading_path, section_lines in sections:
        # Drop the H1 when it only repeats the document title ("AI Agent" under "AI Agent (this site)").
        shown = [h for i, h in enumerate(heading_path) if not (i == 0 and doc.title.startswith(h))]
        section = " › ".join(shown)
        paragraphs = [p.strip() for p in "\n".join(section_lines).split("\n\n") if p.strip()]
        for body in _windows(paragraphs, max_chars):
            header = f"{doc.title} — {section}" if section else doc.title
            chunks.append(
                Chunk(
                    id=f"{doc.doc_id}#{len(chunks)}",
                    doc_id=doc.doc_id,
                    title=doc.title,
                    section=section,
                    text=f"{header}\n{body}",
                    body=body,
                    project=doc.project,
                )
            )
    return chunks


# Profile entries are short and list-like, which both BM25 and a small embedding model match poorly
# against natural questions ("where did you study?" never says "B.Tech"). Each chunk gets a line
# naming the questions it answers — contextual enrichment, applied to the searched text only.
_SECTION_HINTS = {
    "bio": "About me, who I am, introduction, summary, background, availability, location.",
    "skills": "Skills, technologies, tech stack, tools and languages I use.",
    "exp": "Work experience, job, career, role, company, responsibilities.",
    "edu": "Education, where I studied, university, college, degree, academic background.",
    "project": "Project I built, portfolio work, case study.",
    "achievements": "Achievements, awards, certifications, accomplishments.",
    "fun": "Fun facts, hobbies, interests outside work, personal life.",
}


def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items if item)


def chunk_profile(profile: dict[str, Any]) -> list[Chunk]:
    name = profile.get("name", "the owner")
    entries: list[tuple[str, str, str, str | None]] = []  # (key, section, body, project)

    entries.append(
        (
            "bio",
            "Bio",
            "\n".join(
                filter(
                    None,
                    [
                        f"{name} — {profile.get('title', '')}. {profile.get('tagline', '')}",
                        profile.get("bio", ""),
                        f"Location: {profile.get('location', '')}",
                        f"Availability: {profile.get('availability', '')}",
                        _bullets(profile.get("highlights", [])),
                    ],
                )
            ),
            None,
        )
    )
    for group in profile.get("skills", []):
        entries.append(
            (
                f"skills-{group.get('category', '')}",
                f"Skills › {group.get('category', '')}",
                ", ".join(group.get("items", [])),
                None,
            )
        )
    for job in profile.get("experience", []):
        period = f"{job.get('start', '')} – {job.get('end') or 'present'}"
        body = "\n".join(
            filter(
                None,
                [
                    f"{job.get('role', '')} at {job.get('company', '')} ({period}, "
                    f"{job.get('location', '')})",
                    job.get("summary", ""),
                    _bullets(job.get("highlights", [])),
                    f"Stack: {', '.join(job.get('stack', []))}",
                ],
            )
        )
        entries.append(
            (f"exp-{job.get('company', '')}", f"Experience › {job.get('company', '')}", body, None)
        )
    for edu in profile.get("education", []):
        body = (
            f"{edu.get('degree', '')}, {edu.get('institution', '')} "
            f"({edu.get('start', '')} – {edu.get('end', '')}). {edu.get('notes', '')}"
        )
        entries.append((f"edu-{edu.get('institution', '')}", "Education", body.strip(), None))
    for project in profile.get("projects", []):
        metrics = ", ".join(f"{m['label']}: {m['value']}" for m in project.get("metrics", []))
        body = "\n".join(
            filter(
                None,
                [
                    f"Project: {project.get('title', '')} ({project.get('year', '')}, "
                    f"{project.get('status', '')})",
                    project.get("tagline", ""),
                    f"Tags: {', '.join(project.get('tags', []))}",
                    f"Stack: {', '.join(project.get('stack', []))}",
                    f"Metrics: {metrics}" if metrics else "",
                ],
            )
        )
        entries.append(
            (
                f"project-{project.get('slug', '')}",
                f"Projects › {project.get('title', '')}",
                body,
                project.get("slug"),
            )
        )
    if profile.get("achievements"):
        entries.append(("achievements", "Achievements", _bullets(profile["achievements"]), None))
    if profile.get("funFacts"):
        entries.append(("fun-facts", "Fun facts", _bullets(profile["funFacts"]), None))

    title = f"{name}'s profile"
    return [
        Chunk(
            id=f"profile#{key}",
            doc_id="profile",
            title=title,
            section=section,
            text=f"{title} — {section}\n{_SECTION_HINTS.get(key.split('-')[0], '')}\n{body}",
            body=body,
            project=project,
        )
        for key, section, body, project in entries
        if body.strip()
    ]


def chunk_content(content: Content) -> list[Chunk]:
    chunks = chunk_profile(content.profile)
    for doc in content.docs:
        chunks.extend(chunk_markdown(doc))
    return chunks
