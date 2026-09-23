# Deploying Faraday Dashboard (Podman)

The app ships as a single image that runs the Next.js frontend and the FastAPI
backend together (via supervisord). Data is stored in Postgres, with a SQLite
fallback for quick trials.

## Build

```sh
podman build -t faraday .
```

## Run

```sh
./scripts/podman-run.sh
```

This creates a `faraday` pod with Postgres + the app and publishes
<http://localhost:3000>. On first visit you'll be sent to `/setup` to create the
admin account.

Options:

- `USE_SQLITE=1 ./scripts/podman-run.sh` — skip Postgres, use the bundled SQLite
  DB in the `faraday-appdata` volume (fine for a demo; use Postgres for real use).
- `POSTGRES_PASSWORD=...` — set the DB password (default `faraday`).
- `SECRET_KEY=...` — JWT signing key. If unset, a random key is generated once
  and persisted to `/data/secret_key`, so sessions survive restarts.
- `COOKIE_SECURE=true` — set when serving over HTTPS so the session cookie is
  marked `Secure`.

### Manual Podman (without the script)

```sh
podman pod create --name faraday -p 3000:3000

podman run -d --pod faraday --name faraday-db \
  -e POSTGRES_USER=faraday -e POSTGRES_PASSWORD=faraday -e POSTGRES_DB=faraday \
  -v faraday-pgdata:/var/lib/postgresql/data \
  docker.io/library/postgres:16-alpine

podman run -d --pod faraday --name faraday-app \
  -e DATABASE_URL="postgresql+psycopg://faraday:faraday@127.0.0.1:5432/faraday" \
  -v faraday-appdata:/data \
  faraday
```

Database migrations (Alembic) run automatically at container start, retrying
until Postgres is reachable.

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
