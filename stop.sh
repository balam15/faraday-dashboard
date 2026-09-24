#!/bin/sh
# Stop Faraday Dashboard.
#
#   ./stop.sh            # stop & remove the app + database containers (KEEP data)
#   ./stop.sh --purge    # also delete the data volumes and network (DESTROYS data)
set -u

docker rm -f faraday-app >/dev/null 2>&1 && echo "Stopped app." || echo "App not running."
docker rm -f faraday-db  >/dev/null 2>&1 && echo "Stopped database." || echo "Database not running."

if [ "${1:-}" = "--purge" ]; then
  docker volume rm faraday-appdata faraday-pgdata >/dev/null 2>&1 || true
  docker network rm faraday-net >/dev/null 2>&1 || true
  echo "Purged data volumes and network — all data deleted."
else
  echo "Data kept (volumes faraday-pgdata / faraday-appdata). Use --purge to delete."
fi
