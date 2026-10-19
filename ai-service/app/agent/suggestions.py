"""Splits the model's trailing `<suggestions>["…"]</suggestions>` block out of a streamed reply.

The model writes its follow-up chips in the same generation (no second LLM call). While streaming,
any tail of the text that could be the start of the opening tag is held back, so the visitor never
sees a half-written `<sugg` flash on screen.
"""

import json
import re

OPEN_TAG = "<suggestions>"
CLOSE_TAG = "</suggestions>"
MAX_SUGGESTIONS = 3
MAX_SUGGESTION_CHARS = 80


def _partial_tag_suffix(text: str) -> int:
    """Length of the longest suffix of `text` that is a prefix of OPEN_TAG."""
    for size in range(min(len(text), len(OPEN_TAG) - 1), 0, -1):
        if OPEN_TAG.startswith(text[-size:]):
            return size
    return 0


def parse_suggestions(raw: str) -> list[str]:
    raw = raw.replace(CLOSE_TAG, "").strip()
    items: list[str] = []
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            items = [str(x) for x in parsed]
    except json.JSONDecodeError:
        # Small models sometimes skip the JSON: fall back to quoted strings or one per line.
        items = re.findall(r'"([^"]+)"', raw) or [
            ln.strip("-• ").strip() for ln in raw.splitlines()
        ]
    cleaned = []
    for item in items:
        item = " ".join(item.split())
        if item and len(item) <= MAX_SUGGESTION_CHARS and item not in cleaned:
            cleaned.append(item)
    return cleaned[:MAX_SUGGESTIONS]


class SuggestionStreamFilter:
    def __init__(self) -> None:
        self._pending = ""  # visible text not yet released
        self._captured: str | None = None  # text after OPEN_TAG, once seen

    def feed(self, delta: str) -> str:
        """Add a streamed chunk; return the text that is safe to show now."""
        if self._captured is not None:
            self._captured += delta
            return ""
        self._pending += delta
        tag_at = self._pending.find(OPEN_TAG)
        if tag_at != -1:
            visible = self._pending[:tag_at]
            self._captured = self._pending[tag_at + len(OPEN_TAG) :]
            self._pending = ""
            return visible
        hold = _partial_tag_suffix(self._pending)
        visible = self._pending[: len(self._pending) - hold]
        self._pending = self._pending[len(visible) :]
        return visible

    def finish(self) -> tuple[str, list[str]]:
        """End of stream: (remaining visible text, parsed suggestions)."""
        remaining, self._pending = self._pending, ""
        suggestions = parse_suggestions(self._captured) if self._captured is not None else []
        return remaining, suggestions
