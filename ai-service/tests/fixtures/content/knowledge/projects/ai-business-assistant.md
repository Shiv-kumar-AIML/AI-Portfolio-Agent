---
title: AI Business Assistant
project: ai-business-assistant
---

# AI Business Assistant

> PLACEHOLDER deep-dive — replace with the real story, numbers and your exact role.

## Problem

Small-business owners spend hours on admin: adding customers, writing quotes, chasing invoices
and booking visits. The goal was an assistant inside the product that does this work through
conversation.

## My role

Lead engineer on the AI service: agent design, tools, prompts, evaluation and deployment.

## Solution

- A Python FastAPI microservice that runs a tool-calling agent loop.
- 20+ tools mapped onto the product's own API, so the assistant obeys the same validation and
  permissions as the UI.
- Read tools run in parallel; write tools run one at a time in the model's order.
- Narrow tool selection per turn keeps prompts small and cheap, with a meta-tool for requesting
  more tools mid-turn.
- Streaming responses with per-tool progress lines and model-written suggestion chips.
- Conversation memory with summarisation, stored in PostgreSQL.

## Results

Placeholder — e.g. tasks completed per week, latency, cost per conversation, user feedback.

## Stack

Python, FastAPI, OpenAI API, PostgreSQL, pgvector, Express gateway, React, Docker, GitHub
Actions.
