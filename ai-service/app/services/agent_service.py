"""The agent loop: stream a reply, run the tools the model asks for, repeat until it answers.

Each turn yields frames for the SSE stream (see docs/STREAM_CONTRACT.md):

  {"type": "tool_start", "id", "name", "label"}   a tool is about to run (label = progress line)
  {"type": "tool_result", "id", "name", "card", "data"}   a card for the UI (only tools with one)
  {"type": "tool_end", "id", "name", "ok"}
  {"type": "content", "delta"}                     visible reply text, as tokens arrive
  {"type": "sources", "sources": [...]}            RAG citations used this turn
  {"type": "suggestions", "items": [...]}          follow-up chips written by the model
  {"type": "done", "model", "steps", "usage"}
  {"type": "error", "message"}

Safety rules: read tools in one model message run together; a write tool runs alone, in the model's
order. A turn stops offering tools after AGENT_MAX_STEPS rounds or AGENT_TURN_MAX_SECONDS, so the
final round must answer in text.
"""

import asyncio
import json
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

import openai

from app.agent.suggestions import SuggestionStreamFilter
from app.core.config import Settings, get_settings
from app.core.logging import get_logger
from app.prompts.system import build_system_prompt
from app.schemas.chat import ChatMessage
from app.tools.base import BaseTool, ToolResult

logger = get_logger(__name__)

Frame = dict[str, Any]

MAX_TOOL_CALLS_PER_STEP = 6
MAX_SOURCES = 6
EMPTY_REPLY = "Sorry — I couldn't put an answer together for that. Could you rephrase it?"


@dataclass
class _ToolCall:
    id: str
    name: str
    arguments: str = ""


@dataclass
class _StepResult:
    text: str = ""
    tool_calls: list[_ToolCall] = field(default_factory=list)
    streamed_visible: bool = False


@dataclass
class _Usage:
    prompt_tokens: int = 0
    completion_tokens: int = 0

    def add(self, usage: Any) -> None:
        if not usage:
            return
        get = usage.get if isinstance(usage, dict) else lambda k, d=0: getattr(usage, k, d)
        self.prompt_tokens += int(get("prompt_tokens", 0) or 0)
        self.completion_tokens += int(get("completion_tokens", 0) or 0)


def _is_tool_use_failure(exc: openai.BadRequestError) -> bool:
    """Groq answers 400 `tool_use_failed` when the model emitted a malformed tool call."""
    return "tool_use_failed" in str(exc) or "Failed to call a function" in str(exc)


class AgentService:
    def __init__(
        self,
        client: openai.AsyncOpenAI,
        tools: dict[str, BaseTool],
        profile: dict[str, Any],
        settings: Settings | None = None,
    ) -> None:
        self.client = client
        self.tools = tools
        self.profile = profile
        self.settings = settings or get_settings()
        self.usage = _Usage()

    def _initial_messages(self, history: list[ChatMessage]) -> list[dict[str, Any]]:
        recent = history[-self.settings.MAX_HISTORY_MESSAGES :]
        return [
            {"role": "system", "content": build_system_prompt(self.profile)},
            *({"role": m.role, "content": m.content} for m in recent),
        ]

    async def _stream_step(
        self,
        kwargs: dict[str, Any],
        text_filter: SuggestionStreamFilter,
        result: _StepResult,
        separator: str,
    ) -> AsyncIterator[Frame]:
        """One model call. Yields content frames; fills `result` with the text and tool calls."""
        stream = await self.client.chat.completions.create(**kwargs)
        calls: dict[int, _ToolCall] = {}
        async for chunk in stream:
            self.usage.add(
                getattr(chunk, "usage", None)
                or (chunk.model_extra or {}).get("x_groq", {}).get("usage")
            )
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            if delta.content:
                result.text += delta.content
                visible = text_filter.feed(delta.content)
                if visible:
                    if not result.streamed_visible and separator:
                        visible = separator + visible.lstrip()
                    result.streamed_visible = True
                    yield {"type": "content", "delta": visible}
            for tc in delta.tool_calls or []:
                call = calls.setdefault(tc.index, _ToolCall(id="", name=""))
                if tc.id:
                    call.id = tc.id
                if tc.function and tc.function.name:
                    call.name += tc.function.name
                if tc.function and tc.function.arguments:
                    call.arguments += tc.function.arguments
        result.tool_calls = [calls[i] for i in sorted(calls)]
        for i, call in enumerate(result.tool_calls):
            call.id = call.id or f"call_{i}"

    async def _execute(self, call: _ToolCall) -> ToolResult:
        tool = self.tools.get(call.name)
        if tool is None:
            return ToolResult(data={"error": f"Unknown tool '{call.name}'."}, ok=False)
        try:
            args = json.loads(call.arguments) if call.arguments.strip() else {}
        except json.JSONDecodeError:
            return ToolResult(data={"error": "Tool arguments were not valid JSON."}, ok=False)
        try:
            return await tool(args)
        except Exception:
            logger.exception("Tool %s crashed", call.name)
            return ToolResult(data={"error": f"{call.name} failed unexpectedly."}, ok=False)

    def _label(self, call: _ToolCall) -> str:
        tool = self.tools.get(call.name)
        if tool is None:
            return "Thinking…"
        try:
            args = json.loads(call.arguments or "{}")
        except json.JSONDecodeError:
            args = {}
        return tool.label(args if isinstance(args, dict) else {})

    async def _run_tools(
        self, calls: list[_ToolCall], results: dict[str, ToolResult]
    ) -> AsyncIterator[Frame]:
        """Run calls in the model's order: consecutive reads together, each write alone."""
        batches: list[list[_ToolCall]] = []
        for call in calls:
            tool = self.tools.get(call.name)
            if tool is not None and tool.is_write:
                batches.append([call])
            elif batches and not any(
                (t := self.tools.get(c.name)) is not None and t.is_write for c in batches[-1]
            ):
                batches[-1].append(call)
            else:
                batches.append([call])

        for batch in batches:
            for call in batch:
                yield {
                    "type": "tool_start",
                    "id": call.id,
                    "name": call.name,
                    "label": self._label(call),
                }
            outcomes = await asyncio.gather(*(self._execute(c) for c in batch))
            for call, outcome in zip(batch, outcomes, strict=True):
                results[call.id] = outcome
                tool = self.tools.get(call.name)
                if outcome.ok and outcome.ui is not None and tool is not None and tool.ui_card:
                    yield {
                        "type": "tool_result",
                        "id": call.id,
                        "name": call.name,
                        "card": tool.ui_card,
                        "data": outcome.ui,
                    }
                yield {"type": "tool_end", "id": call.id, "name": call.name, "ok": outcome.ok}

    async def run(self, history: list[ChatMessage]) -> AsyncIterator[Frame]:
        s = self.settings
        messages = self._initial_messages(history)
        schemas = [tool.schema() for tool in self.tools.values()]
        deadline = time.monotonic() + s.AGENT_TURN_MAX_SECONDS
        model = s.LLM_MODEL
        sources: dict[str, dict[str, Any]] = {}
        suggestions: list[str] = []
        any_visible = False
        tool_failures = 0
        steps = 0

        while True:
            offer_tools = (
                steps < s.AGENT_MAX_STEPS and time.monotonic() < deadline and tool_failures < 2
            )
            kwargs: dict[str, Any] = {
                "model": model,
                "messages": messages,
                "temperature": s.LLM_TEMPERATURE,
                "max_tokens": s.LLM_MAX_OUTPUT_TOKENS,
                "stream": True,
            }
            if offer_tools:
                kwargs["tools"] = schemas
                kwargs["tool_choice"] = "auto"

            text_filter = SuggestionStreamFilter()
            step = _StepResult()
            try:
                async for frame in self._stream_step(
                    kwargs, text_filter, step, "\n\n" if any_visible else ""
                ):
                    yield frame
            except openai.RateLimitError:
                if model != s.LLM_FALLBACK_MODEL and not step.streamed_visible:
                    logger.warning(
                        "Rate-limited on %s — falling back to %s", model, s.LLM_FALLBACK_MODEL
                    )
                    model = s.LLM_FALLBACK_MODEL
                    continue
                yield {
                    "type": "error",
                    "message": "I'm getting a lot of questions right now — please try again in a minute.",
                }
                return
            except openai.BadRequestError as exc:
                if _is_tool_use_failure(exc) and not step.streamed_visible:
                    tool_failures += 1
                    logger.warning("Malformed tool call from %s (attempt %d)", model, tool_failures)
                    continue  # retry; after two failures the next round is offered no tools
                logger.exception("LLM rejected the request")
                yield {"type": "error", "message": "Something went wrong generating a reply."}
                return
            except (openai.APIConnectionError, openai.APITimeoutError):
                logger.exception("LLM unreachable")
                yield {
                    "type": "error",
                    "message": "The AI model is unreachable right now. Please try again.",
                }
                return
            except openai.APIError:
                logger.exception("LLM API error")
                yield {"type": "error", "message": "Something went wrong generating a reply."}
                return

            steps += 1
            remaining, step_suggestions = text_filter.finish()
            if remaining:
                if not step.streamed_visible and any_visible:
                    remaining = "\n\n" + remaining.lstrip()
                step.streamed_visible = True
                yield {"type": "content", "delta": remaining}
            any_visible = any_visible or step.streamed_visible

            if not step.tool_calls:
                suggestions = step_suggestions
                break

            calls = step.tool_calls[:MAX_TOOL_CALLS_PER_STEP]
            messages.append(
                {
                    "role": "assistant",
                    "content": step.text or None,
                    "tool_calls": [
                        {
                            "id": c.id,
                            "type": "function",
                            "function": {"name": c.name, "arguments": c.arguments or "{}"},
                        }
                        for c in calls
                    ],
                }
            )
            results: dict[str, ToolResult] = {}
            async for frame in self._run_tools(calls, results):
                yield frame
            for call in calls:
                outcome = results[call.id]
                for src in outcome.sources:
                    sources.setdefault(src["id"], src)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.id,
                        "content": json.dumps(outcome.data, ensure_ascii=False, default=str)[
                            : s.TOOL_RESULT_MAX_CHARS
                        ],
                    }
                )

        if not any_visible:
            yield {"type": "content", "delta": EMPTY_REPLY}
        if sources:
            yield {"type": "sources", "sources": list(sources.values())[:MAX_SOURCES]}
        if suggestions:
            yield {"type": "suggestions", "items": suggestions}
        yield {
            "type": "done",
            "model": model,
            "steps": steps,
            "usage": {
                "prompt_tokens": self.usage.prompt_tokens,
                "completion_tokens": self.usage.completion_tokens,
            },
        }
