# ==========================================
# Stage 1: Build Frontend
# ==========================================
FROM node:20-bookworm AS frontend-builder
WORKDIR /app/frontend

# Install dependencies
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --legacy-peer-deps

# Copy source code
COPY frontend/ ./

# Build Next.js app (standalone mode)
# Explicitly disable Turbopack if it was somehow triggered
ARG NEXT_PUBLIC_BASE_PATH=""
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV NEXT_TURBOPACK=0
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# ==========================================
# Stage 2: Final Runtime Image
# ==========================================
FROM python:3.11-slim-bookworm

# Install system dependencies
# - nodejs/npm: For running the frontend server
# - supervisor: To manage both processes
# - build-essential: For python package compilation if needed
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    supervisor \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# --- Backend Setup ---
WORKDIR /app/backend
COPY backend/requirements.txt .

# Install Python dependencies
# Upgrade pip first to ensure modern package handling
RUN pip install --no-cache-dir --upgrade pip setuptools wheel
# Installing torch CPU version explicitly to avoid large NVIDIA/CUDA downloads
RUN pip install --no-cache-dir --extra-index-url https://download.pytorch.org/whl/cpu \
    -r requirements.txt

# Copy Backend Code
COPY backend/ ./

# --- Frontend Setup ---
WORKDIR /app/frontend

# Copy standalone build from builder stage
COPY --from=frontend-builder /app/frontend/.next/standalone ./
COPY --from=frontend-builder /app/frontend/.next/static ./.next/static
COPY --from=frontend-builder /app/frontend/public ./public

# --- Final Configuration ---
WORKDIR /app

# Copy Seed Data (This will be populated by the prepare script externally)
# We assume the user runs `python scripts/prepare_docker_pack.py` before `docker build`
# usage: docker build -t semantic-canvas .
# Copy Seed Data (Optional - useful for new environments)
# If docker_pack is missing, this directory stays empty
# We use a dummy file as a placeholder to ensure the COPY doesn't fail
RUN mkdir -p /app/seed_data
RUN touch /app/seed_data/.placeholder
# Copy Seed Data (from docker_pack created by scripts/prepare_docker_pack.py)
COPY docker_pack/ /app/seed_data/

# Copy Configs
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Expose Ports
EXPOSE 3000 8000

# Environment Variables
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATABASE_URL="sqlite:///./db/sql_app.db"

# Entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]
