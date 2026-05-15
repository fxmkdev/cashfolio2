#!/bin/sh

set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required for the Neon branch post-provision hook." >&2
  exit 1
fi

printf '{"event":"neon_branch_post_provision_noop"}\n'
