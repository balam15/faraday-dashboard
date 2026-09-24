#!/bin/sh
# Start Faraday Dashboard (PostgreSQL + app) with Docker — no compose.
#
#   ./start.sh            # start (build the image only if it's missing)
#   ./start.sh --build    # force a rebuild first
#
# Env overrides:
#   PORT              host port to publish       (default 3000)
#   POSTGRES_PASSWORD database password          (default faraday)
#   COOKIE_SECURE     true when serving over HTTPS/tunnel (default false)
#   USE_SQLITE=1      run a single container with bundled SQLite (no Postgres)
set -eu

IMAGE="${IMAGE:-faraday}"
NET="faraday-net"
PORT="${PORT:-3000}"
PG_PASSWORD="${POSTGRES_PASSWORD:-faraday}"
COOKIE_SECURE="${COOKIE_SECURE:-false}"
HERE="$(cd "$(dirname "$0")" && pwd)"

# ── Build the image if needed ────────────────────────────────────────
if [ "${1:-}" = "--build" ] || ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "Building image '$IMAGE'..."
  docker build -t "$IMAGE" "$HERE"
fi

# ── App container (always recreated to pick up the latest image) ─────
docker rm -f faraday-app >/dev/null 2>&1 || true

if [ "${USE_SQLITE:-0}" = "1" ]; then
  echo "Starting app with bundled SQLite..."
  docker run -d --name faraday-app -p "${PORT}:3000" \
    -e COOKIE_SECURE="$COOKIE_SECURE" \
    -v faraday-appdata:/data \
    "$IMAGE" >/dev/null
else
  docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET" >/dev/null

  # PostgreSQL — start the existing container, or create it once.
  if docker ps -a --format '{{.Names}}' | grep -qx faraday-db; then
    docker start faraday-db >/dev/null
  else
    echo "Starting PostgreSQL..."
    docker run -d --name faraday-db --network "$NET" \
      -e POSTGRES_USER=faraday \
      -e POSTGRES_PASSWORD="$PG_PASSWORD" \
      -e POSTGRES_DB=faraday \
      -v faraday-pgdata:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
  fi

  echo "Starting app..."
  docker run -d --name faraday-app --network "$NET" -p "${PORT}:3000" \
    -e DATABASE_URL="postgresql+psycopg://faraday:${PG_PASSWORD}@faraday-db:5432/faraday" \
    -e COOKIE_SECURE="$COOKIE_SECURE" \
    -v faraday-appdata:/data \
    "$IMAGE" >/dev/null
fi

# ── Wait for health ──────────────────────────────────────────────────
printf "Waiting for the app to become healthy"
i=0
while [ "$i" -lt 30 ]; do
  if curl -fs "http://localhost:${PORT}/api/health" >/dev/null 2>&1; then
    echo ""
    echo "Faraday is up: http://localhost:${PORT}"
    echo "Logs: docker logs -f faraday-app"
    exit 0
  fi
  printf "."
  i=$((i + 1))
  sleep 2
done

echo ""
echo "App did not report healthy in time. Check: docker logs faraday-app"
exit 1
