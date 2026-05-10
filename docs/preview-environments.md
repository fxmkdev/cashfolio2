# Preview environments

This repository uses dynamic preview deployments for `cashfolio-app2`: each
push/update to a pull request branch triggers a new deployment.

## Dynamic preview behavior

On pull requests (non-forks), CI now:

1. Builds and pushes the `cashfolio-app2` image
2. Creates or reuses a Neon branch named
   `pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>-cashfolio-app2` from production using
   `neondatabase/create-branch-action`
3. Creates or reuses a Fly app named
   `cashfolio-app2-pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>`
4. Sets Fly secrets (`DATABASE_URL`, `LOGTO_APP_SECRET`, `SESSION_SECRET`), with
   `SESSION_SECRET` generated per deploy in CI
5. Deploys the PR image to
   `https://cashfolio-app2-pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>.fly.dev/`
6. Posts/updates a PR comment with the dynamic preview URL

`<BRANCH_TAIL_SLUG>` is derived from the last segment of the PR branch name
(`head.ref`): lowercased, non-`[a-z0-9-]` characters replaced with `-`,
consecutive dashes collapsed, and leading/trailing dashes trimmed (fallback:
`branch`). If the slug is too long for Fly's 63-character app-label limit, CI
truncates it and appends `-<6-char-sha1>` for stable uniqueness.

Redis cache note:

- Dynamic preview apps use the shared staging Redis cache. CI injects
  `STAGING_REDIS_URL` into each preview app as `REDIS_URL` (no per-PR Redis
  instance is provisioned).

When a PR is closed, CI deletes the corresponding Fly app, Neon branch (via
`neondatabase/delete-branch-action`).

Dynamic preview CI uses a single GitHub environment:

- `preview-cashfolio-app` for all app preview deployments (with dynamic
  `environment_url` per PR)

Fly machine lifecycle note:

- The shared app Fly template sets `auto_stop_machines = "suspend"` for all
  environments (preview, staging, and prod), so this applies to preview apps
  too.
- Operational impact is mainly preview/staging because production typically
  keeps machines running, and `FLY_MIN_MACHINES_RUNNING` is still honored.

Redis is shared and not deployed as part of dynamic PR preview. Redis deploys
remain manual from `main` via `.github/workflows/deploy.yml` using the existing
environment naming pattern (`<environment>-cashfolio-redis`). The manual deploy
workflow runs app and Redis deployment as separate jobs, so app-only deploys do
not depend on Redis image build/push.

Neon branch lifecycle notes:

1. CI sets `expires_at` to 14 days in the create-branch step.
2. This is a safety fallback in case close-time cleanup fails.
3. For long-lived PRs without updates, the Neon preview branch can expire before
   the PR is closed.
4. A later PR update (`synchronize`) will recreate/reuse the branch name and
   restore preview DB provisioning.

## Required GitHub configuration

Dynamic preview jobs can read configuration from the `preview-cashfolio-app`
environment (recommended) or from repository/organization scope.

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
