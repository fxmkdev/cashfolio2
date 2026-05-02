#!/bin/sh

set -eu

MAX_ATTEMPTS=6
ATTEMPT=1

delay_for_attempt() {
  case "$1" in
    1) echo 2 ;;
    2) echo 4 ;;
    3) echo 8 ;;
    4) echo 16 ;;
    5) echo 30 ;;
    *) echo 30 ;;
  esac
}

is_transient_reachability_error() {
  if printf "%s" "$1" | grep -qi "P1001"; then
    return 0
  fi

  if printf "%s" "$1" | grep -qi "can't reach database server"; then
    return 0
  fi

  return 1
}

is_definitely_non_transient_reachability_error() {
  if printf "%s" "$1" | grep -qiE "ENOTFOUND|EAI_NONAME|getaddrinfo|no such host|Name or service not known|failed to lookup address information"; then
    return 0
  fi

  return 1
}

while [ "$ATTEMPT" -le "$MAX_ATTEMPTS" ]; do
  printf '{"event":"prisma_migrate_deploy_attempt","attempt":%s,"max":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS"

  OUTPUT_FILE="$(mktemp)"
  set +e
  pnpm --filter cashfolio-app2 exec prisma migrate deploy >"$OUTPUT_FILE" 2>&1
  STATUS="$?"
  set -e

  OUTPUT="$(cat "$OUTPUT_FILE")"
  rm -f "$OUTPUT_FILE"
  printf "%s\n" "$OUTPUT"

  if [ "$STATUS" -eq 0 ]; then
    printf '{"event":"prisma_migrate_deploy_success","attempt":%s,"max":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS"
    exit 0
  fi

  if ! is_transient_reachability_error "$OUTPUT"; then
    printf '{"event":"prisma_migrate_deploy_fail_fast","attempt":%s,"max":%s,"reason":"non_transient_error","exit_code":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS" "$STATUS"
    exit "$STATUS"
  fi

  if is_definitely_non_transient_reachability_error "$OUTPUT"; then
    printf '{"event":"prisma_migrate_deploy_fail_fast","attempt":%s,"max":%s,"reason":"non_transient_reachability","exit_code":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS" "$STATUS"
    exit "$STATUS"
  fi

  if [ "$ATTEMPT" -ge "$MAX_ATTEMPTS" ]; then
    printf '{"event":"prisma_migrate_deploy_exhausted","attempt":%s,"max":%s,"reason":"database_reachability","exit_code":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS" "$STATUS"
    exit "$STATUS"
  fi

  NEXT_DELAY="$(delay_for_attempt "$ATTEMPT")"
  printf '{"event":"prisma_migrate_deploy_retry","attempt":%s,"max":%s,"reason":"database_reachability","next_delay":%s}\n' "$ATTEMPT" "$MAX_ATTEMPTS" "$NEXT_DELAY"
  sleep "$NEXT_DELAY"
  ATTEMPT=$((ATTEMPT + 1))
done

exit 1
