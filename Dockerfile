# ─────────────────────────────────────────────
# Stage 1: Build Next.js frontend
# ─────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder

WORKDIR /build/frontend

# Install deps
COPY package.json package-lock.json ./
RUN npm ci --frozen-lockfile

# Copy source and build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build


# ─────────────────────────────────────────────
# Stage 2: Final image — Python + Node + supervisord
# ─────────────────────────────────────────────
FROM python:3.12-slim

# System deps: Node.js + supervisord
RUN apt-get update && apt-get install -y --no-install-recommends \
        curl \
        supervisor \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# ── Python backend ──────────────────────────
WORKDIR /app/backend
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .

# ── Next.js frontend (standalone) ───────────
WORKDIR /app/frontend
COPY --from=frontend-builder /build/frontend/.next/standalone/ ./
COPY --from=frontend-builder /build/frontend/.next/static ./.next/static
COPY --from=frontend-builder /build/frontend/public ./public

# ── Supervisord config & entrypoint ─────────
COPY supervisord.conf /app/supervisord.conf
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# ── Data volume & logs ───────────────────────
RUN mkdir -p /data /var/log
VOLUME ["/data"]

# ── Non-root user ────────────────────────────
RUN groupadd --gid 1001 faraday && \
    useradd --uid 1001 --gid 1001 --no-create-home faraday && \
    chown -R faraday:faraday /app /var/log

# supervisord needs to write pid files as root or we run as root
# Keep root for supervisord but backend/frontend run without extra privs
USER root

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
