FROM python:3.12-slim

WORKDIR /app

# Install system deps
RUN apt-get update && apt-get install -y --no-install-recommends gcc g++ && \
    rm -rf /var/lib/apt/lists/*

# Install Python deps
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy project
COPY backend/ backend/
COPY ml/ ml/

# Create default output dirs
RUN mkdir -p ml/output data/osic/train

# Env defaults
ENV OUTPUT_DIR=/app/ml/output
ENV OSIC_DATA_ROOT=/app/data/osic/train
ENV FRONTEND_URL=""
ENV PORT=8000

EXPOSE 8000

CMD uvicorn backend.server:app --host 0.0.0.0 --port ${PORT}
