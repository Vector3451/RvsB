FROM python:3.11-slim

# HF Spaces require non-root user (uid 1000)
RUN useradd -m -u 1000 rvsb
WORKDIR /app

# Install Node.js for UI build
RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*

# Install Python dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy and build the React UI
COPY ui/sentinel-core/package*.json ./ui/sentinel-core/
RUN cd ui/sentinel-core && npm ci --silent
COPY ui/sentinel-core/ ./ui/sentinel-core/
RUN cd ui/sentinel-core && npm run build

# Copy source code
COPY src/ ./src/
COPY inference.py .
COPY baseline_inference.py .
COPY openenv.yaml .
COPY tests/ ./tests/

# Ensure src is importable
ENV PYTHONPATH=/app/src

# Competition inference environment variables (override at runtime)
ENV API_BASE_URL="https://api.openai.com/v1"
ENV MODEL_NAME="gpt-4o-mini"
ENV HF_TOKEN=""
ENV ENV_URL="http://localhost:7860"

# Switch to non-root user
USER rvsb

# HF Spaces listens on 7860
EXPOSE 7860

CMD ["uvicorn", "envs.rvsb_env.server.app:app", \
     "--host", "0.0.0.0", "--port", "7860", \
     "--workers", "1", "--timeout-keep-alive", "30"]
