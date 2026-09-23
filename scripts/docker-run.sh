#!/bin/sh
# Run Faraday Dashboard with Docker (no compose).
#
# Uses a user-defined bridge network so the app can reach Postgres by
# container name. Postgres is optional — set USE_SQLITE=1 to skip it and use
# the bundled SQLite database under the /data volume instead.
#
#   ./scripts/docker-run.sh            # Postgres (recommended)
#   USE_SQLITE=1 ./scripts/docker-run.sh
#
# Build the image first:  docker build -t faraday .
set -e

NET=faraday-net
IMAGE="${IMAGE:-faraday}"
PG_PASSWORD="${POSTGRES_PASSWORD:-faraday}"
SECRET_KEY="${SECRET_KEY:-}"

# Network (idempotent) + clean any previous app container.
docker network inspect "$NET" >/dev/null 2>&1 || docker network create "$NET"
docker rm -f faraday-app >/dev/null 2>&1 || true

if [ "$USE_SQLITE" = "1" ]; then
  echo "Starting app with bundled SQLite..."
  docker run -d --name faraday-app --network "$NET" -p 3000:3000 \
    -e SECRET_KEY="$SECRET_KEY" \
    -v faraday-appdata:/data \
    "$IMAGE"
else
  echo "Starting Postgres..."
  docker rm -f faraday-db >/dev/null 2>&1 || true
  docker run -d --name faraday-db --network "$NET" \
    -e POSTGRES_USER=faraday \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e POSTGRES_DB=faraday \
    -v faraday-pgdata:/var/lib/postgresql/data \
    postgres:16-alpine

  echo "Starting app..."
  # The app resolves the DB by its container name over the shared network.
  docker run -d --name faraday-app --network "$NET" -p 3000:3000 \
    -e DATABASE_URL="postgresql+psycopg://faraday:${PG_PASSWORD}@faraday-db:5432/faraday" \
    -e SECRET_KEY="$SECRET_KEY" \
    -v faraday-appdata:/data \
    "$IMAGE"
fi

echo "Faraday is starting on http://localhost:3000"
echo "Logs:  docker logs -f faraday-app"
