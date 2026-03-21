# Preview environments

This repository now supports two preview concepts:

- Static preview: long-lived shared preview environment (`preview`)
- Dynamic preview: one environment per pull request for `cashfolio-app2`

## Dynamic preview behavior

On pull requests (non-forks), CI now:

1. Builds and pushes the `cashfolio-app2` image
2. Creates or reuses a Neon branch named `pr-<PR_NUMBER>-cashfolio-app2` from production
3. Creates or reuses a Fly app named `cashfolio-app2-pr-<PR_NUMBER>`
4. Sets Fly secrets (`DATABASE_URL`, `LOGTO_APP_SECRET`, `SESSION_SECRET`)
5. Deploys the PR image to `https://cashfolio-app2-pr-<PR_NUMBER>.fly.dev/`
6. Posts/updates a PR comment with the dynamic preview URL

When a PR is closed, CI deletes the corresponding Fly app and Neon branch.

## Required GitHub configuration

Dynamic preview jobs run in GitHub environment `preview-cashfolio-app` and require:

### Secrets

- `FLY_API_TOKEN`
- `LOGTO_APP_SECRET`
- `SESSION_SECRET`
- `NEON_API_KEY`

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
- `NEON_DATABASE_NAME`
- `NEON_ROLE_NAME`
- `FLY_ORG` (optional; only needed if app creation requires explicit org)
