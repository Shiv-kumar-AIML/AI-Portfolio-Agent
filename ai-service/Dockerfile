# --- build stage: resolve dependencies from uv.lock so every build installs exactly the same versions
FROM python:3.12-slim AS builder

RUN pip install --no-cache-dir uv==0.9.22

WORKDIR /app
COPY pyproject.toml uv.lock README.md ./
# --frozen: fail instead of re-resolving if uv.lock and pyproject.toml disagree. --no-dev: no test tooling.
RUN UV_PROJECT_ENVIRONMENT=/app/.venv uv sync --frozen --no-dev --no-install-project --no-cache

# Bake the embedding model into the image so a container never downloads it at startup
# (and still has dense retrieval with no outbound network).
ENV FASTEMBED_CACHE_DIR=/app/models
RUN /app/.venv/bin/python -c "from fastembed import TextEmbedding; TextEmbedding('BAAI/bge-small-en-v1.5', cache_dir='/app/models')"

# --- runtime stage
FROM python:3.12-slim

# Never run as root.
RUN useradd --system --uid 10001 --create-home --shell /usr/sbin/nologin portfolio

WORKDIR /app
COPY --from=builder /app/.venv /app/.venv
COPY --from=builder --chown=portfolio:portfolio /app/models /app/models
COPY app/ ./app/

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    HOST=0.0.0.0 \
    PORT=8000 \
    FASTEMBED_CACHE_DIR=/app/models \
    CONTENT_DIR=/content

USER portfolio
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:%s/health' % os.environ.get('PORT', '8000'), timeout=4)"

CMD ["python", "-m", "app.main"]
