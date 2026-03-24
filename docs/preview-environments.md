# Preview environments

This repository uses dynamic preview environments: one environment per pull
request for `cashfolio-app2`.

## Dynamic preview behavior

On pull requests (non-forks), CI now:

1. Builds and pushes the `cashfolio-app2` image
2. Creates or reuses a Neon branch named `pr-<PR_NUMBER>-cashfolio-app2` from
   production using `neondatabase/create-branch-action`
3. Creates or reuses a Fly app named `cashfolio-app2-pr-<PR_NUMBER>`
4. Sets Fly secrets (`DATABASE_URL`, `LOGTO_APP_SECRET`, `SESSION_SECRET`), with
   `SESSION_SECRET` generated per deploy in CI
5. Deploys the PR image to `https://cashfolio-app2-pr-<PR_NUMBER>.fly.dev/`
6. Posts/updates a PR comment with the dynamic preview URL

Redis cache note:

- Dynamic preview apps use the shared staging Redis cache. CI injects
  `STAGING_REDIS_URL` into each preview app as `REDIS_URL` (no per-PR Redis
  instance is provisioned).

When a PR is closed, CI deletes the corresponding Fly app, Neon branch (via
`neondatabase/delete-branch-action`).

Dynamic preview CI does not create or use GitHub environments.

Neon branch lifecycle notes:

1. CI sets `expires_at` to 14 days in the create-branch step.
2. This is a safety fallback in case close-time cleanup fails.
3. For long-lived PRs without updates, the Neon preview branch can expire before
   the PR is closed.
4. A later PR update (`synchronize`) will recreate/reuse the branch name and
   restore preview DB provisioning.

## Required GitHub configuration

Dynamic preview jobs read configuration from repository or organization scope
(global), not from environment-scoped secrets/variables.

### Secrets

- `FLY_API_TOKEN`
- `LOGTO_APP_SECRET`
- `NEON_API_KEY`
- `CURRENCYLAYER_API_KEY`
- `COINLAYER_API_KEY`
- `STAGING_REDIS_URL`

### Variables

- `FLY_PRIMARY_REGION`
- `FLY_MIN_MACHINES_RUNNING`
- `FLY_MEMORY`
- `FLY_CPU_KIND`
- `FLY_CPUS`
- `LOGTO_ENDPOINT`
- `LOGTO_TENANT_ID`
- `LOGTO_APP_ID`
- `NEON_PROJECT_ID`
- `NEON_PROD_BRANCH_ID`
- `NEON_DATABASE_NAME` (optional; defaults to `neondb`)
- `NEON_ROLE_NAME` (optional; defaults to `neondb_owner`)
- `FLY_ORG` (optional; only needed if app creation requires explicit org)
