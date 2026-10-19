---
title: AI Portfolio Agent (this website)
project: ai-portfolio-agent
---

# AI Portfolio Agent

This website is itself a project: instead of a static page, visitors chat with an AI agent that
knows about my work.

## Architecture

Three services, each with its own container:

- **frontend** — React + Vite + shadcn/ui. Streams the agent's answer and renders tool results as
  rich cards (projects, skills, experience timeline, GitHub activity, contact).
- **api** — Express + TypeScript gateway. Public endpoints, rate limiting, input validation,
  contact-message storage in PostgreSQL, GitHub stats with caching, and an SSE proxy to the AI
  service.
- **ai-service** — Python FastAPI. Runs the agent loop on Groq (open-weight gpt-oss models) through an
  OpenAI-compatible client, and owns the retrieval index.

The AI service is never exposed publicly; it is only reachable by the api over the internal
Docker network with a shared service key.

## Retrieval (RAG)

Markdown files and the structured profile are split into heading-aware chunks. Each query is
answered with hybrid retrieval: BM25 keyword search and dense embeddings (fastembed,
`BAAI/bge-small-en-v1.5`, ONNX on CPU), merged with reciprocal-rank fusion. The answer cites the
chunks it used.

## Agent

The model can call ten tools — knowledge search, profile, projects, project details, skills,
experience, resume, GitHub activity, contact info, and sending me a message. Read tools run in
parallel; the one write tool (sending a message) runs alone and only with details the visitor
typed. Each reply ends with suggested follow-up questions.

## What I learned

Placeholder — e.g. how much retrieval quality depends on chunking, and why streaming tool
progress makes an agent feel fast.
