import os

# Must be set before app settings are first read (get_settings is cached).
os.environ.setdefault("ENVIRONMENT", "test")
os.environ["EMBEDDINGS_ENABLED"] = "false"  # tests never download the embedding model
os.environ["INTERNAL_SERVICE_KEY"] = "test-internal-key-0123456789abcdef"
os.environ["GROQ_API_KEY"] = "test-groq-key"
# A fixed copy of the content, so editing the real profile never breaks the tests.
os.environ["CONTENT_DIR"] = os.path.join(os.path.dirname(__file__), "fixtures", "content")

from collections.abc import AsyncIterator, Iterator  # noqa: E402
from types import SimpleNamespace  # noqa: E402
from typing import Any  # noqa: E402

import pytest  # noqa: E402

from app.rag.knowledge_base import KnowledgeBase  # noqa: E402


@pytest.fixture
async def kb() -> KnowledgeBase:
    base = KnowledgeBase()
    await base.build()
    return base


def text_chunks(text: str, size: int = 7) -> list[Any]:
    """Stream `text` as chat.completion.chunk-like objects, `size` characters at a time."""
    return [
        SimpleNamespace(
            choices=[
                SimpleNamespace(delta=SimpleNamespace(content=text[i : i + size], tool_calls=None))
            ],
            usage=None,
            model_extra={},
        )
        for i in range(0, len(text), size)
    ]


def tool_call_chunks(calls: list[tuple[str, str, str]]) -> list[Any]:
    """Stream tool calls [(id, name, json_args)], with arguments split over two chunks."""
    out = []
    for index, (call_id, name, args) in enumerate(calls):
        half = len(args) // 2
        for part, first in ((args[:half], True), (args[half:], False)):
            out.append(
                SimpleNamespace(
                    choices=[
                        SimpleNamespace(
                            delta=SimpleNamespace(
                                content=None,
                                tool_calls=[
                                    SimpleNamespace(
                                        index=index,
                                        id=call_id if first else None,
                                        function=SimpleNamespace(
                                            name=name if first else None, arguments=part
                                        ),
                                    )
                                ],
                            )
                        )
                    ],
                    usage=None,
                    model_extra={},
                )
            )
    return out


class _Stream:
    def __init__(self, chunks: list[Any]) -> None:
        self._chunks = chunks

    def __aiter__(self) -> AsyncIterator[Any]:
        return self._gen()

    async def _gen(self) -> AsyncIterator[Any]:
        for chunk in self._chunks:
            yield chunk


class FakeLLM:
    """Stands in for openai.AsyncOpenAI. Each scripted step is a chunk list or an exception."""

    def __init__(self, steps: list[Any]) -> None:
        self._steps: Iterator[Any] = iter(steps)
        self.calls: list[dict[str, Any]] = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self._create))

    async def _create(self, **kwargs: Any) -> _Stream:
        self.calls.append(kwargs)
        step = next(self._steps)
        if isinstance(step, BaseException):
            raise step
        return _Stream(step)
