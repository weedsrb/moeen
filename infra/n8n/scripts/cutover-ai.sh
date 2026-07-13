#!/usr/bin/env bash
set -euo pipefail

COMMAND="${1:-status}"
NOTE="${2:-production ai worker cutover}"
SUPABASE_ENDPOINT="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"

if [[ -z "${SUPABASE_ENDPOINT}" || -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY." >&2
  exit 1
fi
if ! command -v curl >/dev/null || ! command -v jq >/dev/null; then
  echo "This script requires curl and jq." >&2
  exit 1
fi
if [[ "${COMMAND}" != "status" && "${COMMAND}" != "queue" && "${COMMAND}" != "inline" ]]; then
  echo "Usage: $0 status | queue [note] | inline [note]" >&2
  exit 1
fi

rpc() {
  local function_name="$1"
  local body="$2"
  curl --fail --silent --show-error \
    "${SUPABASE_ENDPOINT%/}/rest/v1/rpc/${function_name}" \
    --request POST \
    --header "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
    --header "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
    --header "Content-Type: application/json" \
    --data "${body}"
}

STATUS="$(rpc get_ai_cutover_status '{}')"
echo "${STATUS}" | jq .

if [[ "${COMMAND}" == "status" ]]; then
  exit 0
fi

if [[ "${AI_CUTOVER_CONFIRM:-}" != "${COMMAND}" ]]; then
  echo "Refusing to change runtime. Set AI_CUTOVER_CONFIRM=${COMMAND} for this command." >&2
  exit 1
fi

if [[ "${COMMAND}" == "queue" ]]; then
  MERCHANTS="$(echo "${STATUS}" | jq -r '.merchants')"
  HEALTHY="$(echo "${STATUS}" | jq -r '.healthy_merchants')"
  STALE="$(echo "${STATUS}" | jq -r '.stale_heartbeats')"
  if [[ "${MERCHANTS}" != "${HEALTHY}" || "${STALE}" != "0" ]]; then
    echo "Queue cutover refused: healthy worker coverage is ${HEALTHY}/${MERCHANTS}, stale=${STALE}." >&2
    exit 1
  fi
fi

BODY="$(jq -nc --arg backend "${COMMAND}" --arg note "${NOTE}" \
  '{p_backend:$backend,p_change_note:$note}')"
RESULT="$(rpc set_ai_execution_backend "${BODY}")"
echo "${RESULT}" | jq .

