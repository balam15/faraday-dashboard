#!/usr/bin/env bash
# Post-scan summary for the Vulnera Dashboard.
#
# Drop-in replacement for the DefectDojo-era post-security.sh. The old version
# summed `dd_import_*.json` response files and read DefectDojo's
# `statistics.after.<level>.active` shape — Vulnera's importer doesn't write
# those files, so the summary always printed zeros. This version asks the
# dashboard for the real, current posture of the app+tag instead.
#
# Required environment (same ones vulnera-import.sh already uses):
#   DASHBOARD_URL   e.g. http://vulnera:3000   (no trailing slash)
#   DD_API_KEY      the Vulnera API key (frd_live_...)   [DASHBOARD_API_KEY also honored]
#   PROJECT         e.g. opsflow
#   SERVICE_NAME    e.g. echo
#   IMAGE_TAG       e.g. 1.5.0
set -uo pipefail

WORK_DIR="${WORKSPACE:-$(pwd)}"
ASSET_NAME="${PROJECT:-unknown}/${SERVICE_NAME:-unknown}"
TAG="${IMAGE_TAG:-unknown}"

HISTORY_FILE="${WORK_DIR}/security-history.txt"
DASHBOARD_FILE="${WORK_DIR}/security-dashboard.html"

API_KEY="${DASHBOARD_API_KEY:-${DD_API_KEY:-}}"
SUMMARY_FILE="$(mktemp)"
HTTP_CODE="000"

if [ -n "${DASHBOARD_URL:-}" ] && [ -n "${API_KEY}" ]; then
  HTTP_CODE="$(
    curl -sS -k --noproxy '*' \
      --connect-timeout 30 --max-time 120 \
      -w '%{http_code}' -G \
      "${DASHBOARD_URL}/api/scan-summary" \
      -H "X-API-Key: ${API_KEY}" \
      --data-urlencode "app_name=${ASSET_NAME}" \
      --data-urlencode "tag=${TAG}" \
      -o "${SUMMARY_FILE}"
  )" || HTTP_CODE="000"
else
  echo "[WARN] DASHBOARD_URL / DD_API_KEY belum diset — summary dilewati" >&2
fi

if [ "${HTTP_CODE}" != "200" ]; then
  echo "[WARN] Gagal ambil summary dari dashboard (HTTP ${HTTP_CODE})" >&2
  cat "${SUMMARY_FILE}" 2>/dev/null >&2 || true
  # Fall through with an empty body so the script still emits a zeroed summary
  # rather than failing the pipeline.
  : > "${SUMMARY_FILE}"
fi

python3 - \
    "${ASSET_NAME}" \
    "${TAG}" \
    "${HISTORY_FILE}" \
    "${DASHBOARD_FILE}" \
    "${SUMMARY_FILE}" <<'PY'
import html
import json
import sys

asset_name = sys.argv[1]
image_tag = sys.argv[2]
history_file = sys.argv[3]
dashboard_file = sys.argv[4]
summary_file = sys.argv[5]

severity = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
total = 0

try:
    with open(summary_file, encoding="utf-8") as file:
        data = json.load(file)
    # Active (open) findings by severity — the dashboard's "severity" block.
    sev = data.get("severity", {}) or {}
    for level in severity:
        severity[level] = int(sev.get(level, 0) or 0)
    # Prefer the dashboard's own open total; fall back to summing severities.
    total = int(data.get("open", sum(severity.values())) or 0)
except (OSError, ValueError, TypeError, json.JSONDecodeError):
    # No/invalid summary (dashboard unreachable, app/tag not found yet): zeros.
    pass

history = (
    f"{asset_name}:{image_tag} | "
    f"🔴 {severity['critical']} | "
    f"🟠 {severity['high']} | "
    f"🟡 {severity['medium']} | "
    f"🟢 {severity['low']} | "
    f"🔵 {severity['info']} | "
    f"Total: {total}"
)

with open(history_file, "w", encoding="utf-8") as file:
    file.write(history)

asset = html.escape(f"{asset_name}:{image_tag}")

dashboard = f"""
<div>
  <b>{asset}</b>
  <table style="border-collapse:collapse;margin-top:8px">
    <tr>
      <td style="background:#d43f3a;color:white;padding:10px 20px;text-align:center">
        <b>{severity['critical']}</b><br>CRITICAL
      </td>
      <td style="background:#d97a16;color:white;padding:10px 20px;text-align:center">
        <b>{severity['high']}</b><br>HIGH
      </td>
      <td style="background:#e5ad06;color:white;padding:10px 20px;text-align:center">
        <b>{severity['medium']}</b><br>MEDIUM
      </td>
      <td style="background:#4caf50;color:white;padding:10px 20px;text-align:center">
        <b>{severity['low']}</b><br>LOW
      </td>
      <td style="background:#337ab7;color:white;padding:10px 20px;text-align:center">
        <b>{severity['info']}</b><br>INFO
      </td>
      <td style="background:#666;color:white;padding:10px 20px;text-align:center">
        <b>{total}</b><br>TOTAL
      </td>
    </tr>
  </table>
</div>
""".strip()

with open(dashboard_file, "w", encoding="utf-8") as file:
    file.write(dashboard)

reset = "\033[0m"
red = "\033[41;97m"
orange = "\033[48;5;208;97m"
yellow = "\033[43;30m"
green = "\033[42;97m"
blue = "\033[44;97m"
gray = "\033[100;97m"

print(f"[SECURITY SUMMARY] {asset_name}:{image_tag}")
print("+------------+----------+----------+----------+----------+----------+")
print(
    f"|{red}  CRITICAL  {reset}"
    f"|{orange}   HIGH   {reset}"
    f"|{yellow}  MEDIUM  {reset}"
    f"|{green}   LOW    {reset}"
    f"|{blue}   INFO   {reset}"
    f"|{gray}  TOTAL   {reset}|"
)
print("+------------+----------+----------+----------+----------+----------+")
print(
    f"|{red}{severity['critical']:^12}{reset}"
    f"|{orange}{severity['high']:^10}{reset}"
    f"|{yellow}{severity['medium']:^10}{reset}"
    f"|{green}{severity['low']:^10}{reset}"
    f"|{blue}{severity['info']:^10}{reset}"
    f"|{gray}{total:^10}{reset}|"
)
print("+------------+----------+----------+----------+----------+----------+")
PY

rm -f "${SUMMARY_FILE}"

if [ -n "${PUSH_NAME:-}" ]; then
    podman image rm "${PUSH_NAME}" >/dev/null 2>&1 || true
fi

if [ -n "${IMAGE_NAME:-}" ]; then
    podman image rm "${IMAGE_NAME}" >/dev/null 2>&1 || true
fi

exit 0
