#!/bin/sh
# Run Faraday Dashboard with Podman (no compose).
#
# Creates a pod so the app and Postgres share localhost, then starts both.
# Postgres is optional — set USE_SQLITE=1 to skip it and use the bundled
# SQLite database under the /data volume instead.
#
#   ./scripts/podman-run.sh            # Postgres (recommended)
#   USE_SQLITE=1 ./scripts/podman-run.sh
#
# Build the image first:  podman build -t faraday .
set -e

POD=faraday
IMAGE="${IMAGE:-faraday}"
PG_PASSWORD="${POSTGRES_PASSWORD:-faraday}"
SECRET_KEY="${SECRET_KEY:-}"

# Recreate the pod (published port 3000).
podman pod rm -f "$POD" >/dev/null 2>&1 || true
podman pod create --name "$POD" -p 3000:3000

if [ "$USE_SQLITE" = "1" ]; then
  echo "Starting app with bundled SQLite..."
  podman run -d --pod "$POD" --name faraday-app \
    -e SECRET_KEY="$SECRET_KEY" \
    -v faraday-appdata:/data \
    "$IMAGE"
else
  echo "Starting Postgres..."
  podman run -d --pod "$POD" --name faraday-db \
    -e POSTGRES_USER=faraday \
    -e POSTGRES_PASSWORD="$PG_PASSWORD" \
    -e POSTGRES_DB=faraday \
    -v faraday-pgdata:/var/lib/postgresql/data \
    docker.io/library/postgres:16-alpine

  echo "Starting app..."
  # In a pod, containers reach each other over 127.0.0.1.
  podman run -d --pod "$POD" --name faraday-app \
    -e DATABASE_URL="postgresql+psycopg://faraday:${PG_PASSWORD}@127.0.0.1:5432/faraday" \
    -e SECRET_KEY="$SECRET_KEY" \
    -v faraday-appdata:/data \
    "$IMAGE"
fi

echo "Faraday is starting on http://localhost:3000"
echo "Logs:  podman logs -f faraday-app"
