"""Application settings, read from the environment / .env (see .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVICE_DIR = Path(__file__).resolve().parents[2]
_REPO_CONTENT_DIR = _SERVICE_DIR.parent / "content"


class Settings(BaseSettings):
    # Absolute path: the service reads ai-service/.env whichever directory it is started from.
    model_config = SettingsConfigDict(env_file=_SERVICE_DIR / ".env", extra="ignore")

    # Server
    ENVIRONMENT: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    LOG_LEVEL: str = "INFO"

    # Security — must match INTERNAL_SERVICE_KEY in the api gateway's .env
    INTERNAL_SERVICE_KEY: SecretStr = SecretStr("")

    # LLM (Groq's OpenAI-compatible endpoint; any OpenAI-compatible provider works)
    GROQ_API_KEY: SecretStr = SecretStr("")
    LLM_BASE_URL: str = "https://api.groq.com/openai/v1"
    LLM_MODEL: str = "openai/gpt-oss-120b"
    # Used when the main model is rate-limited (Groq free tier) or fails to produce valid tool calls.
    LLM_FALLBACK_MODEL: str = "openai/gpt-oss-20b"
    LLM_TEMPERATURE: float = 0.3
    LLM_MAX_OUTPUT_TOKENS: int = 1024
    LLM_TIMEOUT_SECONDS: float = 30.0

    # Agent loop limits
    AGENT_MAX_STEPS: int = 5
    AGENT_TURN_MAX_SECONDS: float = 45.0
    MAX_HISTORY_MESSAGES: int = 12
    TOOL_RESULT_MAX_CHARS: int = 6000

    # Api gateway (base URL WITHOUT /api) — tools call its /internal/* routes
    API_GATEWAY_URL: str = "http://127.0.0.1:5010"

    # RAG
    CONTENT_DIR: Path = _REPO_CONTENT_DIR
    EMBEDDINGS_ENABLED: bool = True
    EMBEDDING_MODEL: str = "BAAI/bge-small-en-v1.5"
    # fastembed's own default is the system temp dir, which a reboot wipes — so the ~70 MB model
    # would be re-downloaded on every start. Keep it next to the service instead (gitignored).
    FASTEMBED_CACHE_DIR: str = str(_SERVICE_DIR / ".cache" / "fastembed")
    RAG_TOP_K: int = 5

    @property
    def is_development(self) -> bool:
        return self.ENVIRONMENT == "development"


@lru_cache
def get_settings() -> Settings:
    return Settings()
