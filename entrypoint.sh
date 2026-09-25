#!/bin/sh
set -e

# Ensure data directory exists
mkdir -p /data

# ── Stable SECRET_KEY ────────────────────────────────────────────────
# A random key per restart would invalidate every session on every deploy.
# Use the provided key, else persist a generated one under /data.
if [ -z "$SECRET_KEY" ]; then
  if [ -f /data/secret_key ]; then
    SECRET_KEY="$(cat /data/secret_key)"
  else
    SECRET_KEY="$(head -c 48 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 48)"
    printf '%s' "$SECRET_KEY" > /data/secret_key
    chmod 600 /data/secret_key
  fi
fi
export SECRET_KEY
export TOKEN_EXPIRE_MINUTES="${TOKEN_EXPIRE_MINUTES:-480}"
# Defaults so supervisord's %(ENV_..)s expansions always resolve.
# An empty DATABASE_URL makes the app fall back to the SQLite DB_PATH.
export DATABASE_URL="${DATABASE_URL:-}"
export COOKIE_SECURE="${COOKIE_SECURE:-false}"

echo "Starting InfraShield Dashboard..."
echo "Data directory: /data"

# ── Database migrations ──────────────────────────────────────────────
cd /app/backend
echo "Running database migrations..."
# Retry so the app can start alongside a Postgres container that's still
# coming up (e.g. in a Podman pod) without a compose healthcheck.
n=0
until alembic upgrade head; do
  n=$((n + 1))
  if [ "$n" -ge 30 ]; then
    echo "Database not reachable after 30 attempts — giving up." >&2
    exit 1
  fi
  echo "Database not ready, retrying in 2s ($n/30)..."
  sleep 2
done
cd /app

# The app processes run as the non-root 'faraday' user; hand them /data.
chown -R faraday:faraday /data 2>/dev/null || true

exec /usr/bin/supervisord -c /app/supervisord.conf
