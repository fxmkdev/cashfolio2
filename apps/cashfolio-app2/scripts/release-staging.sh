#!/bin/sh

set -eu

SEED_CLI="apps/cashfolio-app2/dist/staging-seed/seed.mjs"
MIGRATION_SCRIPT="apps/cashfolio-app2/scripts/prisma-migrate-deploy-with-retry.sh"

case "${STAGING_SEED_ENABLED:-false}" in
  true)
    # Validate both destinations before even migrations can write to a database.
    node "$SEED_CLI" --check-target
    sh "$MIGRATION_SCRIPT"
    node "$SEED_CLI"
    ;;
  false|"")
    sh "$MIGRATION_SCRIPT"
    ;;
  *)
    echo "STAGING_SEED_ENABLED must be true or false." >&2
    exit 1
    ;;
esac
