"""Shared async LLM client — Groq through its OpenAI-compatible endpoint."""

from functools import lru_cache

import openai

from app.core.config import get_settings


class LLMNotConfiguredError(RuntimeError):
    pass


@lru_cache
def get_llm_client() -> openai.AsyncOpenAI:
    settings = get_settings()
    api_key = settings.GROQ_API_KEY.get_secret_value()
    if not api_key:
        raise LLMNotConfiguredError("GROQ_API_KEY is missing or empty")
    return openai.AsyncOpenAI(
        api_key=api_key,
        base_url=settings.LLM_BASE_URL,
        timeout=settings.LLM_TIMEOUT_SECONDS,
        # The agent loop handles rate limits itself by falling back to a smaller model.
        max_retries=1,
    )
