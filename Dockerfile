FROM python:3.11-slim

# HF Spaces require non-root user (uid 1000)
RUN useradd -m -u 1000 rvsb
WORKDIR /app

# Install dependencies first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./src/
COPY baseline_inference.py .
COPY openenv.yaml .

# Ensure src is importable
ENV PYTHONPATH=/app/src

# Switch to non-root user
USER rvsb

# HF Spaces listens on 7860
EXPOSE 7860

CMD ["uvicorn", "envs.rvsb_env.server.app:app", \
     "--host", "0.0.0.0", "--port", "7860", \
     "--workers", "1", "--timeout-keep-alive", "30"]
