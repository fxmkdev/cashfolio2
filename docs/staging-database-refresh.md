# Staging database refresh

The `Refresh staging database` GitHub Actions workflow resets the long-lived
staging Neon branch from its production parent, runs a post-refresh hook, stages
the refreshed `DATABASE_URL` on the staging Fly app, and redeploys staging. The
redeploy runs the existing Fly release command, which applies Prisma migrations.

The workflow is manually triggerable and also runs daily at 03:30 Europe/Zurich.
Because GitHub schedules are UTC-only, the workflow schedules both possible UTC
times and skips the one that does not match the current Zurich UTC offset.

Required GitHub Actions configuration:

- `NEON_PROJECT_ID`
- `NEON_STAGING_BRANCH_ID`
- `NEON_API_KEY`
- Existing staging Fly variables and secrets used by `deploy-version.yml`

Optional Neon connection-string variables keep the same defaults as preview
branches:

- `NEON_DATABASE_NAME` defaults to `neondb`
- `NEON_ROLE_NAME` defaults to `neondb_owner`

Future staging-only data filtering should be added to
`apps/cashfolio-app2/scripts/staging-db-post-refresh.sh`. The workflow invokes
that script after Neon reset and before staging deployment with `DATABASE_URL`
pointing at the refreshed staging branch.
