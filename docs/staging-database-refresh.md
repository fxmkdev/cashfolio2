# Staging database refresh

The `Refresh staging database` GitHub Actions workflow resets the long-lived
staging Neon branch from its production parent, runs the shared Neon branch
post-provision hook, and redeploys staging. The redeploy runs the existing Fly
release command, which applies Prisma migrations.

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

Future data filtering for branches cloned from production should be added to
`apps/cashfolio-app2/scripts/neon-branch-post-provision.sh`. The staging
refresh workflow invokes that script after Neon reset and before staging
deployment with `DATABASE_URL` pointing at the refreshed staging branch.
