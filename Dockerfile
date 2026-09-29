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
# Stage 2: Node runtime source
# Provides the glibc `node` binary for the final image without pulling from
# Debian APT / NodeSource repositories (this build has network access only to
# the Docker Hub base images, the npm registry and PyPI). Kept on the same
# Debian release as the final base so the copied binary is ABI-compatible.
# ─────────────────────────────────────────────
FROM node:22-trixie-slim AS node-runtime


# ─────────────────────────────────────────────
# Stage 3: Final image — Python + Node + supervisord
# ─────────────────────────────────────────────
FROM python:3.12-slim

# Node.js runtime: copy just the `node` binary from the official Node image.
# The Next.js standalone server runs via `node server.js`, so npm/npx are not
# needed at runtime.
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

# supervisord from PyPI (the Debian package is unreachable in this build).
# entrypoint.sh calls /usr/bin/supervisord, so link it to the pip location.
# setuptools provides pkg_resources, which supervisor imports but python:3.12
# no longer ships by default. Pin <81: setuptools 81 dropped pkg_resources.
RUN pip install --no-cache-dir supervisor==4.2.5 'setuptools<81' \
    && ln -sf /usr/local/bin/supervisord /usr/bin/supervisord

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
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://localhost:3000/api/health', timeout=5).status == 200 else 1)" || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
