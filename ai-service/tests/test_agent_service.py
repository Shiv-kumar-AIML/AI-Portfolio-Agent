import json
from typing import Any
from unittest.mock import AsyncMock

import httpx
import openai

from app.core.config import get_settings
from app.schemas.chat import ChatMessage
from app.services.agent_service import AgentService
from app.tools import ToolContext, build_tools
from tests.conftest import FakeLLM, text_chunks, tool_call_chunks


def _agent(kb, llm: FakeLLM, gateway: Any = None) -> AgentService:  # type: ignore[no-untyped-def]
    ctx = ToolContext(kb=kb, gateway=gateway or AsyncMock(), session_id="s1")
    return AgentService(client=llm, tools=build_tools(ctx), profile=kb.content.profile)  # type: ignore[arg-type]


async def _collect(agent: AgentService, question: str = "hi") -> list[dict[str, Any]]:
    return [f async for f in agent.run([ChatMessage(role="user", content=question)])]


def _text(frames: list[dict[str, Any]]) -> str:
    return "".join(f["delta"] for f in frames if f["type"] == "content")


async def test_plain_answer_streams_text_and_suggestions(kb) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM([text_chunks('Hey there!\n<suggestions>["Projects?", "Skills?"]</suggestions>')])
    frames = await _collect(_agent(kb, llm))
    assert _text(frames) == "Hey there!\n"
    assert {"type": "suggestions", "items": ["Projects?", "Skills?"]} in frames
    assert frames[-1]["type"] == "done" and frames[-1]["steps"] == 1
    assert "tools" in llm.calls[0]
    assert llm.calls[0]["messages"][0]["role"] == "system"


async def test_tool_call_emits_card_then_answer(kb) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(
        [
            tool_call_chunks([("c1", "get_projects", '{"tag": "RAG"}')]),
            text_chunks("Here are my RAG projects."),
        ]
    )
    frames = await _collect(_agent(kb, llm), "show rag projects")
    types = [f["type"] for f in frames]
    assert types[:3] == ["tool_start", "tool_result", "tool_end"]
    card = frames[1]
    assert card["card"] == "projects"
    assert all("RAG" in p["tags"] for p in card["data"]["projects"])
    assert _text(frames) == "Here are my RAG projects."
    # The second call carries the assistant tool_calls message and the tool's JSON result.
    second = llm.calls[1]["messages"]
    assert second[-2]["tool_calls"][0]["function"]["name"] == "get_projects"
    assert second[-1]["role"] == "tool" and json.loads(second[-1]["content"])["projects"]


async def test_search_knowledge_collects_sources(kb) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM(
        [
            tool_call_chunks([("c1", "search_knowledge", '{"query": "remote work relocation"}')]),
            text_chunks("Yes, remote-first."),
        ]
    )
    frames = await _collect(_agent(kb, llm))
    sources = next(f for f in frames if f["type"] == "sources")["sources"]
    assert sources and all({"id", "title", "snippet"} <= s.keys() for s in sources)
    assert not any(f["type"] == "tool_result" for f in frames)  # search has no card


async def test_reads_run_together_and_writes_alone(kb) -> None:  # type: ignore[no-untyped-def]
    gateway = AsyncMock()
    gateway.send_message.return_value = {"id": "m1"}
    args = json.dumps(
        {"name": "Ana", "email": "ana@example.com", "message": "Let's talk about a role"}
    )
    llm = FakeLLM(
        [
            tool_call_chunks(
                [
                    ("a", "get_skills", "{}"),
                    ("b", "get_contact", "{}"),
                    ("c", "send_message", args),
                    ("d", "get_profile", "{}"),
                ]
            ),
            text_chunks("Sent!"),
        ]
    )
    frames = await _collect(_agent(kb, llm, gateway))
    order = [(f["type"], f["id"]) for f in frames if f["type"] in ("tool_start", "tool_end")]
    assert order == [
        ("tool_start", "a"),
        ("tool_start", "b"),
        ("tool_end", "a"),
        ("tool_end", "b"),
        ("tool_start", "c"),
        ("tool_end", "c"),
        ("tool_start", "d"),
        ("tool_end", "d"),
    ]
    gateway.send_message.assert_awaited_once_with(
        name="Ana", email="ana@example.com", message="Let's talk about a role", session_id="s1"
    )


async def test_invalid_tool_arguments_go_back_to_the_model(kb) -> None:  # type: ignore[no-untyped-def]
    gateway = AsyncMock()
    llm = FakeLLM(
        [
            tool_call_chunks(
                [
                    (
                        "c1",
                        "send_message",
                        '{"name": "Ana", "email": "not-an-email", "message": "hello there"}',
                    )
                ]
            ),
            text_chunks("Could you double-check your email?"),
        ]
    )
    frames = await _collect(_agent(kb, llm, gateway))
    assert {"type": "tool_end", "id": "c1", "name": "send_message", "ok": False} in frames
    gateway.send_message.assert_not_awaited()
    tool_msg = llm.calls[1]["messages"][-1]
    assert "Invalid arguments" in json.loads(tool_msg["content"])["error"]


async def test_rate_limit_falls_back_to_the_smaller_model(kb) -> None:  # type: ignore[no-untyped-def]
    response = httpx.Response(429, request=httpx.Request("POST", "https://x"))
    llm = FakeLLM(
        [openai.RateLimitError("slow down", response=response, body=None), text_chunks("ok")]
    )
    frames = await _collect(_agent(kb, llm))
    settings = get_settings()
    assert [c["model"] for c in llm.calls] == [settings.LLM_MODEL, settings.LLM_FALLBACK_MODEL]
    assert _text(frames) == "ok"
    assert frames[-1]["model"] == settings.LLM_FALLBACK_MODEL


async def test_step_limit_forces_a_text_answer(kb) -> None:  # type: ignore[no-untyped-def]
    max_steps = get_settings().AGENT_MAX_STEPS
    steps: list[Any] = [
        tool_call_chunks([(f"c{i}", "get_profile", "{}")]) for i in range(max_steps)
    ]
    steps.append(text_chunks("Final answer."))
    llm = FakeLLM(steps)
    frames = await _collect(_agent(kb, llm))
    assert "tools" not in llm.calls[-1]
    assert _text(frames) == "Final answer."


async def test_empty_reply_gets_a_fallback_message(kb) -> None:  # type: ignore[no-untyped-def]
    frames = await _collect(_agent(kb, FakeLLM([[]])))
    assert "rephrase" in _text(frames)


async def test_unknown_project_slug_lists_valid_ones(kb) -> None:  # type: ignore[no-untyped-def]
    tools = build_tools(ToolContext(kb=kb, gateway=AsyncMock()))
    result = await tools["get_project_details"]({"slug": "nope"})
    assert not result.ok and "doc-qa-rag" in result.data["error"]
    found = await tools["get_project_details"]({"slug": "doc-qa-rag"})
    assert found.ok and "Approach" in found.data["writeUp"] and found.sources
