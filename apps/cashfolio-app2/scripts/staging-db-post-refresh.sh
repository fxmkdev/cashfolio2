#!/bin/sh

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required for the staging DB post-refresh hook." >&2
  exit 1
fi

printf '{"event":"staging_db_post_refresh_noop"}\n'
