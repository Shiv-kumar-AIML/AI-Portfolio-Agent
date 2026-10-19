# Portfolio AI Service

An internal FastAPI service that runs the portfolio's AI agent: a Groq-hosted open model (gpt-oss) that
calls tools, with hybrid RAG over `../content`. Only the api gateway calls it, using
`X-Internal-Service-Key`.

```text
app/
├── main.py                 app factory; builds the knowledge base in the background at startup
├── core/                   settings, logging, internal-key check
├── api/routes/             /health, /health/ready, /internal/{chat/stream,reindex,search}
├── services/
│   ├── agent_service.py    the agent loop (streaming, parallel reads / serial writes, fallbacks)
│   ├── llm_client.py       OpenAI SDK pointed at Groq's OpenAI-compatible endpoint
│   └── gateway_client.py   calls the api's /internal/* (GitHub stats, visitor messages)
├── tools/                  10 tools — each a Pydantic schema + run(); optional UI card
├── rag/
│   ├── content.py          loads profile.json + knowledge/**/*.md
│   ├── chunker.py          heading-aware markdown chunks + one chunk per profile entity
│   ├── bm25.py             Okapi BM25 (lexical)
│   ├── embedder.py         fastembed bge-small (dense, ONNX on CPU)
│   ├── retriever.py        reciprocal-rank fusion of both rankings
│   └── knowledge_base.py   the process-wide index, rebuilt on /internal/reindex
├── agent/suggestions.py    splits the model's <suggestions> block out of the stream
└── prompts/system.py       the system prompt
```

## Run locally

```bash
cp .env.example .env          # add GROQ_API_KEY (free at console.groq.com) and INTERNAL_SERVICE_KEY
uv sync --extra dev
uv run python -m app.main     # http://127.0.0.1:8000/docs (development only)
```

The first start downloads the embedding model (~70 MB). The Docker image bakes it in. If the model
can't load, retrieval falls back to BM25 only and the service keeps working.

## Test

```bash
uv run pytest                 # offline: the LLM is a scripted fake (tests/conftest.py)
uv run ruff check app tests && uv run ruff format --check app tests && uv run mypy app
```

## Behaviour worth knowing

- **Agent loop**: read tools in one model message run concurrently, and `send_message` (the only
  write) runs alone. After `AGENT_MAX_STEPS` rounds or `AGENT_TURN_MAX_SECONDS`, the model gets no
  tools and has to answer in text.
- **Groq specifics**: a 429 switches the turn to `LLM_FALLBACK_MODEL`. A `tool_use_failed` 400
  (malformed tool call) is retried, and after two failures the model answers without tools.
- **Debugging retrieval**: `POST /internal/search {"query": "..."}` (or `POST /api/admin/search`
  through the api) shows each hit's BM25 rank, dense rank and fused score.
- **Stream format**: see [docs/STREAM_CONTRACT.md](docs/STREAM_CONTRACT.md).
