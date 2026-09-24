# Deploying Faraday Dashboard (Docker, no compose)

The app ships as a single image that runs the Next.js frontend and the FastAPI
backend together (via supervisord). Data is stored in Postgres, with a SQLite
fallback for quick trials.

## Build

```sh
docker build -t faraday .
```

## Run

```sh
./scripts/docker-run.sh
```

This creates a `faraday-net` network with Postgres + the app and publishes
<http://localhost:3000>. On first visit you'll be sent to `/setup` to create the
admin account.

Options:

- `USE_SQLITE=1 ./scripts/docker-run.sh` — skip Postgres, use the bundled SQLite
  DB in the `faraday-appdata` volume (fine for a demo; use Postgres for real use).
- `POSTGRES_PASSWORD=...` — set the DB password (default `faraday`).
- `SECRET_KEY=...` — JWT signing key. If unset, a random key is generated once
  and persisted to `/data/secret_key`, so sessions survive restarts.
- `COOKIE_SECURE=true` — set when serving over HTTPS so the session cookie is
  marked `Secure`.

### Manual Docker (without the script)

```sh
docker network create faraday-net

docker run -d --name faraday-db --network faraday-net \
  -e POSTGRES_USER=faraday -e POSTGRES_PASSWORD=faraday -e POSTGRES_DB=faraday \
  -v faraday-pgdata:/var/lib/postgresql/data \
  postgres:16-alpine

docker run -d --name faraday-app --network faraday-net -p 3000:3000 \
  -e DATABASE_URL="postgresql+psycopg://faraday:faraday@faraday-db:5432/faraday" \
  -v faraday-appdata:/data \
  faraday
```

The app reaches Postgres by container name (`faraday-db`) over the shared
network. Database migrations (Alembic) run automatically at container start,
retrying until Postgres is reachable — so start order doesn't matter.

### SQLite only (single container, no database server)

```sh
docker run -d --name faraday-app -p 3000:3000 -v faraday-appdata:/data faraday
```

## Importing scans

**From the UI:** Applications → *Import Scan*. Choose the scanner type, the
application name, and the image tag.

**From CI/CD:** create an API key under Settings → API Keys, then POST the scan
file. Supported `scan_type` values: `Trivy Scan`, `ZAP Scan`, `SARIF`,
`Fortify Scan`.

```sh
curl -X POST http://localhost:3000/api/import-scan \
  -H "X-API-Key: frd_live_xxxxxxxx" \
  -F "file=@trivy-report.json" \
  -F "app_name=payment-service" \
  -F "tag=v2.4.1" \
  -F "scan_type=Trivy Scan"
```

Re-importing the same scanner for the same app+tag replaces the previous run and
**preserves triage status** (mitigated / false positive / accepted) for findings
that reappear.

## Access control

Roles: `admin` > `security_engineer` > `developer` > `viewer`. Only admins and
security engineers can import scans and change finding status. LDAP users are
mapped to a role — and optionally restricted to specific applications (by name) —
via Settings → LDAP group mappings.
