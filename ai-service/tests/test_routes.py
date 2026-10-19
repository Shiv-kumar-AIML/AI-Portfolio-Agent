import json
import time

import pytest
from fastapi.testclient import TestClient

from app.api.routes import internal
from app.main import app
from app.rag.knowledge_base import knowledge_base
from tests.conftest import FakeLLM, text_chunks

KEY = {"X-Internal-Service-Key": "test-internal-key-0123456789abcdef"}


@pytest.fixture
def client():  # type: ignore[no-untyped-def]
    with TestClient(app) as c:
        # lifespan builds the knowledge base in the background (on the app's own loop); wait for it
        deadline = time.monotonic() + 20
        while not knowledge_base.ready and time.monotonic() < deadline:
            c.get("/health")
            time.sleep(0.05)
        assert knowledge_base.ready, "knowledge base did not build"
        yield c


def test_health_is_open(client) -> None:  # type: ignore[no-untyped-def]
    assert client.get("/health").json() == {"status": "ok"}
    assert client.get("/health/ready").json()["knowledge_base"]["ready"] is True


def test_internal_routes_need_the_service_key(client) -> None:  # type: ignore[no-untyped-def]
    body = {"messages": [{"role": "user", "content": "hi"}]}
    assert client.post("/internal/chat/stream", json=body).status_code == 401
    assert (
        client.post(
            "/internal/chat/stream", json=body, headers={"X-Internal-Service-Key": "wrong"}
        ).status_code
        == 401
    )


def test_chat_stream_returns_sse_frames(client, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    llm = FakeLLM([text_chunks("Hello!")])
    monkeypatch.setattr(internal, "get_llm_client", lambda: llm)
    body = {"messages": [{"role": "user", "content": "hi"}], "session_id": "abc"}
    with client.stream("POST", "/internal/chat/stream", json=body, headers=KEY) as res:
        assert res.status_code == 200
        assert res.headers["content-type"].startswith("text/event-stream")
        frames = [json.loads(line[6:]) for line in res.iter_lines() if line.startswith("data: ")]
    assert "".join(f.get("delta", "") for f in frames) == "Hello!"
    assert frames[-1]["type"] == "done"


def test_last_message_must_be_from_the_user(client) -> None:  # type: ignore[no-untyped-def]
    body = {"messages": [{"role": "assistant", "content": "hi"}]}
    assert client.post("/internal/chat/stream", json=body, headers=KEY).status_code == 422


def test_search_debug_endpoint(client) -> None:  # type: ignore[no-untyped-def]
    res = client.post("/internal/search", json={"query": "demand forecasting"}, headers=KEY)
    assert res.status_code == 200
    assert res.json()["hits"][0]["id"].startswith(("profile#project-demand", "projects/demand"))
