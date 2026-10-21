# AI Portfolio

A portfolio site where visitors talk to an AI version of me. It's an agent with 10 tools and hybrid
RAG over my own notes. It answers questions about my projects, skills and experience, shows the
results as cards, cites its sources, and can pass a visitor's message on to me.

```text
browser ──► nginx ──► frontend   React + Vite + shadcn/ui (static)
              │
              └─────► api        Express + TypeScript gateway: rate limits, validation, Postgres,
                       │         GitHub stats, contact messages, SSE proxy, live-browser relay
                       ├───────► browser   Playwright Chromium: the mini-OS browser's pages,
                       │                   streamed as frames over a WebSocket  (internal only)
                       ▼
                     ai-service  FastAPI: Groq (gpt-oss) agent loop + hybrid RAG   (internal only)
                       │  ▲
                       └──┘ tools call the api's /internal/* with X-Internal-Service-Key

content/   profile.json + knowledge/*.md — the single source of truth, mounted into api + ai-service
```

| Service | Stack | Owns |
|---|---|---|
| [`frontend/`](frontend/) | React 19, Vite, Tailwind 4, shadcn/ui, motion | UI, streaming chat, tool cards |
| [`api/`](api/) | Express 5, TypeScript, Prisma, Postgres, zod, Swagger | Public API, rate limits, messages, chat logs, GitHub, admin |
| [`ai-service/`](ai-service/) | Python 3.12, FastAPI, OpenAI SDK → Groq, fastembed, uv | Agent loop, tools, retrieval |
| [`browser/`](browser/) | Node, Playwright (Chromium), ws, zod | The live browser inside the mini-OS |

## Quick start (Docker)

```bash
cp api/.env.example api/.env
cp ai-service/.env.example ai-service/.env
cp browser/.env.example browser/.env
# 1. put a free Groq key in ai-service/.env  (https://console.groq.com/keys)
# 2. set the SAME INTERNAL_SERVICE_KEY in all three files:  openssl rand -hex 32
docker compose -f docker-compose.local.yml up --build
```

Then open http://localhost:3061. The api is on :3060 (Swagger at `/api-docs`) and the ai-service
is on 127.0.0.1:3063.

## Quick start (without Docker)

```bash
# Postgres: any local instance; set DATABASE_URL in api/.env
cd api && npm install && npx prisma migrate deploy && npm run dev        # :5010
cd ai-service && uv sync --extra dev && uv run python -m app.main          # :8000
cd browser && npm install && npx playwright install chromium && npm run dev  # :8090
cd frontend && npm install && npm run dev                                  # :5173
```

## Make it yours

1. Edit **`content/profile.json`**: name, title, socials, `githubUsername`, skills, experience and
   projects. Everything in it is placeholder data.
2. Rewrite **`content/knowledge/*.md`**. These are the long-form notes the agent searches: project
   deep-dives, FAQ, about. Give each project page `project: <slug>` in its frontmatter.
3. Replace `frontend/public/avatar.svg`, add `frontend/public/resume.pdf`, and update
   `frontend/index.html`'s title and meta tags.
4. Rebuild the index without restarting:
   `curl -X POST localhost:3060/api/admin/reindex -H "Authorization: Bearer $ADMIN_TOKEN"`.

## What's in it

- **Agent**: streams tokens, runs read tools in parallel and the write tool alone, has step and
  time limits, falls back to a smaller model on a rate limit, retries malformed tool calls, and
  writes its own suggestion chips.
- **Hybrid RAG**: heading-aware chunking, BM25 plus bge-small embeddings, reciprocal-rank fusion,
  contextual hints on profile chunks, and source citations in the UI. If the embedding model can't
  load, it falls back to BM25 alone.
- **Tools**: `search_knowledge`, `get_profile`, `get_projects`, `get_project_details`, `get_skills`,
  `get_experience`, `get_resume`, `get_contact`, `get_github_activity` (live, cached),
  `get_repo_details`, `open_link` (opens a link in the mini-OS browser once the visitor agrees) and
  `send_message`, which saves to Postgres and can notify a Discord or Slack webhook.
- **Live browser**: the mini-OS has a real browser. Each visitor gets an isolated Chromium context
  on the server, its screen streamed as JPEG frames and their mouse and keyboard replayed. It only
  opens GitHub, LinkedIn and the hosts of the links in `profile.json` (plus `BROWSER_EXTRA_HOSTS`),
  never anything on the server's own network, and sessions are capped, idle-timed-out and limited
  per IP. When it's busy or down, the mini-OS shows previews built from the api instead.
- **Gateway**: per-IP burst and daily chat limits, zod validation, a contact-form honeypot,
  chat analytics (questions, tools used, latency), and owner admin routes for the inbox, stats,
  reindex and retrieval debugging.
- **Security**: the ai-service has no public route, internal and admin secrets are compared in
  constant time, model output is rendered as markdown with no raw HTML, and every container
  runs as non-root.

## Tests

```bash
cd ai-service && uv run pytest     # agent loop, tools, RAG, suggestions, routes (offline)
cd api && npm test                 # routes, proxy, validation, GitHub, admin (mocked DB/fetch)
cd browser && npm test             # allowlist, protocol
cd frontend && npm test            # SSE parser, chat state, browser URLs, live-browser client
```

CI runs all three on every PR (`.github/workflows/`).

## Deploy

Run `docker compose -f docker-compose.production.yml up -d --build` on any VM. Only nginx
(`nginx/production.conf`) is published, on port 80. Put TLS in front of it (Caddy, Cloudflare,
or the commented 443 block in that file).
