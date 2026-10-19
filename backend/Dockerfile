# Multi-stage Dockerfile for PairUP FastAPI Backend
FROM python:3.11-slim as base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

WORKDIR /app

# Install system dependencies if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files first for layer caching
COPY pyproject.toml ./

# Install dependencies using uv into system environment
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy application source code
COPY app ./app

# Create directory for persistent SQLite data
RUN mkdir -p /app/data

EXPOSE 8080

# Run FastAPI with uvicorn
CMD ["uvicorn", "app.server:app", "--host", "0.0.0.0", "--port", "8080"]
