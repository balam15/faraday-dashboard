#!/usr/bin/env bash
# Drop-in replacement for defectdojo-import.sh — pushes a scan report to the
# InfraShield Dashboard instead of DefectDojo.
#
# Same call signature as before, so the scan scripts don't change:
#   infrashield-import.sh <SCAN_TYPE> <REPORT_FILE> [<TAGS>] [<TEST_TITLE>]
#
# Required environment (set these in the Jenkins job / credentials):
#   DASHBOARD_URL      e.g. http://infrashield:3000   (no trailing slash)
#   DD_API_KEY         the InfraShield API key (Settings -> API Keys, frd_live_...)
#                      (reusing DD_API_KEY keeps the scan scripts' `if [ -n
#                       "${DD_API_KEY}" ]` guard working unchanged)
#   PROJECT            e.g. opsflow
#   SERVICE_NAME       e.g. echo
#   IMAGE_TAG          e.g. 1.5.0
#
# SCAN_TYPE must be one the dashboard understands (identical to DefectDojo):
#   "Trivy Scan" | "Semgrep JSON Report" | "SARIF" | "Fortify Scan" | "ZAP Scan"
set -uo pipefail

# Reuse the pipeline's helpers if available; otherwise define minimal ones.
if [ -n "${SCRIPT_HOME:-}" ] && [ -f "${SCRIPT_HOME}/lib/common.sh" ]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_HOME}/lib/common.sh"
else
  log()  { printf '[INFO] %s\n' "$*"; }
  warn() { printf '[WARN] %s\n' "$*" >&2; }
  security_result() { printf '[ERROR] %s\n' "$*" >&2; return 1; }
fi

SCAN_TYPE="${1:-}"
REPORT_FILE="${2:-}"
TAGS="${3:-}"
TEST_TITLE="${4:-${SCAN_TYPE}}"

API_KEY="${DASHBOARD_API_KEY:-${DD_API_KEY:-}}"
WORK_DIR="${WORKSPACE:-$(pwd)}"

# Resolve a relative report path against the workspace.
if [ -n "${REPORT_FILE}" ] && [ "${REPORT_FILE#/}" = "${REPORT_FILE}" ]; then
  REPORT_FILE="${WORK_DIR}/${REPORT_FILE}"
fi

# ---- Validate ----
if [ -z "${SCAN_TYPE}" ] || [ -z "${REPORT_FILE}" ]; then
  security_result "Parameter import belum lengkap (scan_type / report_file)"; exit $?
fi
if [ -z "${DASHBOARD_URL:-}" ] || [ -z "${API_KEY}" ]; then
  security_result "DASHBOARD_URL / DD_API_KEY belum diset"; exit $?
fi
: "${PROJECT:?PROJECT belum diset}"
: "${SERVICE_NAME:?SERVICE_NAME belum diset}"
: "${IMAGE_TAG:?IMAGE_TAG belum diset}"
if [ ! -s "${REPORT_FILE}" ]; then
  security_result "Report tidak ditemukan / kosong: ${REPORT_FILE}"; exit $?
fi

APP_NAME="${PROJECT}/${SERVICE_NAME}"

log "Upload ${TEST_TITLE} -> ${DASHBOARD_URL} (app=${APP_NAME} tag=${IMAGE_TAG} type=${SCAN_TYPE})"

RESPONSE_FILE="$(mktemp)"
HTTP_CODE="$(
  curl -sS -k --noproxy '*' \
    --connect-timeout 30 --max-time 300 \
    -w '%{http_code}' \
    -X POST "${DASHBOARD_URL}/api/import-scan" \
    -H "X-API-Key: ${API_KEY}" \
    -F "file=@${REPORT_FILE}" \
    -F "app_name=${APP_NAME}" \
    -F "tag=${IMAGE_TAG}" \
    -F "scan_type=${SCAN_TYPE}" \
    -F "team=${PROJECT}" \
    -o "${RESPONSE_FILE}"
)" || HTTP_CODE="000"

log "HTTP import scan: ${HTTP_CODE}"

if [ "${HTTP_CODE}" != "200" ] && [ "${HTTP_CODE}" != "201" ]; then
  cat "${RESPONSE_FILE}" 2>/dev/null || true
  rm -f "${RESPONSE_FILE}"
  security_result "Upload ${TEST_TITLE} gagal. HTTP ${HTTP_CODE}"; exit $?
fi

rm -f "${RESPONSE_FILE}"
log "Upload ${TEST_TITLE} berhasil"
exit 0
