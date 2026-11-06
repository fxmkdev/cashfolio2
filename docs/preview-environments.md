# Nonproduction databases and preview environments

Staging and previews use the same Neon provisioning flow. They share the
nonproduction project's default branch, direct endpoint and existing database
owner. Each Git branch gets its own database; there is intentionally no
permission boundary between staging and previews. Production uses a separate
project and credentials and remains migration-only.

## Deployment lifecycle

1. The normal `Build` workflow builds the exact PR head on Fly/Depot using
   `FLY_CASHFOLIO_APP_STAGING_APP` and `FLY_API_TOKEN`. Distinct PR image tags
   include the head SHA, run ID and attempt. Bounded registry retries resolve an
   immutable digest, passed directly to deployment. Forks cannot publish or
   deploy. Same-repository contributors are trusted with these credentials and
   the nonproduction Neon API key.
2. Preview deployment validates the current open, same-repository PR and exact
   head SHA before preparation and again before deployment. Unrelated CI checks
   run independently of deployment.
3. A shared helper uses `NEON_API_KEY` and `NEON_PROJECT_ID` to discover exactly
   one default Neon branch and read-write endpoint. It requires one existing
   owner across application databases, excluding `postgres`, `template0` and
   `template1`. Missing or ambiguous ownership fails for operator review; no
   roles are created or selected by guesswork.
4. It calculates the database name from the full Git branch, looks up only that
   exact name, creates it if absent, verifies ownership and waits for Neon
   operations. It obtains a direct connection URI from Neon and generates the
   app's `DATABASE_URL` and `SEED_TARGET`. The API key stays in GitHub and never
   enters Fly apps.
5. Deployment stages those settings and deploys the image. The release command
   verifies the exact destination read-only, applies migrations, then
   transactionally replaces application data using the deployed image's seed
   code. Verification repeats inside the replacement transaction. Failures stop
   the release before web Machines update.

Staging releases and the daily refresh use this same helper. Their Git branch
selects the database; staging deployments from tags use the repository's default
Git branch. Staging and production continue to deploy the shared release image
independently. Production bypasses provisioning and seeding.

The required preview check remains `Deploy to preview / cashfolio-app2: Deploy`.
Summaries identify the environment, PR where applicable, exact commit, URL and
outcome. Missing configuration fails visibly instead of silently skipping seed.

## Naming and reuse

Database names are `cashfolio-app2-<sanitized-full-branch>-<8-character-hash>`.
The full branch name is lowercased, non-ASCII-alphanumeric characters become
collapsed dashes, and an empty slug becomes `branch`. The slug is bounded to 39
characters; the hash is the first eight hexadecimal characters of SHA-256 of the
original branch name. Names fit PostgreSQL's 63-character limit, and different
branches that sanitize alike remain distinct.

Every deployment reuses the exact named database and runs migrations plus seed;
it does not recreate or reset it. PR titles have no effect. Renaming a branch
creates a new database, with old resources handled by cleanup.

Preview URLs retain the existing branch-tail convention:
`cashfolio-app2-pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>.fly.dev`. The last branch
segment is sanitized and truncated, replacing `github` with `gh` for Fly.

Preview and staging edits are disposable: each deployment replaces application
data. Configured tester identities and roles are retained; an entirely empty
database bootstraps only explicitly configured administrators. Classification
schemes and assignments are replaced transactionally. Shared market-rate caches
are preserved, while fresh book IDs and cache revisions prevent stale calculated
results. See [Synthetic staging data](staging-database-refresh.md).

## Cleanup and coordination

Staging releases, preview releases and cleanup share the noncancelling
`cashfolio-app2-nonproduction` concurrency group on the actual deployment or
cleanup job. Calling workflows do not acquire that lock again. GitHub may
supersede pending jobs; an active release is not cancelled.

`Cleanup nonproduction databases` runs from `main` on PR closure, daily at 04:30
UTC, or via manual dispatch on `main`. It inventories open same-repository PRs
and staging/preview Fly Machines. Each new deployment records these nonsecret
environment markers on its Machines:

- `CASHFOLIO_DATABASE_PROJECT_ID`
- `CASHFOLIO_DATABASE_BRANCH_ID`
- `CASHFOLIO_DATABASE_NAME`
- `CASHFOLIO_DEPLOY_SHA`

Cleanup reads those references without accessing database passwords. It retains
databases for the default Git branch, current same-repository PR branches and
all deployed Machine references, including stopped and suspended Machines. A
failed deployment therefore cannot discard the old deployment's database.

Closed-PR apps can be removed directly. After a branch rename, an old preview
app is retired only when the current app has the expected database and exact PR
commit metadata and its URL responds successfully. The Machine inventory is
refreshed after app retirement and before database deletion.

Only databases in the new naming namespace, owned by the discovered owner on the
resolved default Neon branch, created at least 24 hours ago and without any
retained reference can be deleted. Incomplete GitHub, Fly or Neon inventories
stop database deletion. Missing deployment metadata also blocks deletion until
the app is upgraded or retired. Legacy databases, roles and Neon branches remain
for operator cleanup. No workflow creates, resets or deletes Neon branches.

## Configuration

Configure one secret `NEON_API_KEY` and one variable `NEON_PROJECT_ID`,
available to `staging-cashfolio-app` and `preview-cashfolio-app` (repository
settings can serve both). Use an API key scoped to the nonproduction project. A
project ID does **not** restrict an account-wide key; see
[Neon API key scopes](https://neon.com/docs/manage/api-keys). No manually
configured branch, endpoint, owner, database password or destination JSON is
required. The default Neon branch must already have an application database with
its normal owner and a read-write endpoint. Multiple application owners must be
resolved by an operator before deployment.

Keep these existing application settings:

- In both nonproduction GitHub environments, secrets `SEED_USER_EXTERNAL_IDS`
  and `SEED_ADMIN_EXTERNAL_IDS`: nonempty comma-separated Logto IDs. Every
  administrator must also be a configured tester. These are application access
  configuration, not Neon provisioning settings.
- Existing preview secrets `LOGTO_APP_SECRET`,
  `LOGTO_MANAGEMENT_API_APP_SECRET`, `CURRENCYLAYER_API_KEY`,
  `COINLAYER_API_KEY`, `MARKETSTACK_API_KEY`, `STAGING_REDIS_URL`, plus the
  existing `FLY_API_TOKEN`. Staging keeps its existing application secrets.
- Existing deployment variables `FLY_ORG`, `FLY_PRIMARY_REGION`,
  `FLY_MIN_MACHINES_RUNNING`, `FLY_MEMORY`, `FLY_CPU_KIND`, `FLY_CPUS`,
  `LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_MANAGEMENT_API_ENDPOINT`,
  `LOGTO_MANAGEMENT_API_RESOURCE`, `LOGTO_MANAGEMENT_API_APP_ID`, staging's
  `FLY_APP`/URL settings, and repository `FLY_CASHFOLIO_APP_STAGING_APP` for the
  shared image repository and staging app inventory.

The preview environment must allow PR deployments and cleanup from `main`. No
new GitHub environment, reviewer gate, Fly organization or Fly token is
required. Staging and previews share privileges, compute capacity and
availability; a busy preview can affect staging. The shared owner credentials
must be exclusive to nonproduction, and production must reject them. Destination
checks remain mandatory but do not isolate equally trusted nonproduction code.

## Cutover and operation

An operator configures the API key, project ID and tester/admin IDs before the
first release. Staging switches to a new branch-derived, freshly seeded
database. Existing synthetic data is disposable and is not migrated. Push an
open same-repository PR or rerun Build to switch a preview in the same way. The
daily staging refresh remains at 03:30 Europe/Zurich. Cleanup requires the new
workflow on `main` and complete deployment markers before deleting unused
databases. Manual cleanup dispatch inventories all resources; it is not a
force-delete command.

After successful cutover, remove obsolete `PREVIEW_DATABASE_ADMIN_URL`,
`PREVIEW_DATABASE_TARGET`, `PREVIEW_DATABASE_PASSWORD_KEY`, `SEED_DATABASE_URL`,
`STAGING_SEED_*`, `STAGING_SEED_ENABLED`, `NEON_STAGING_PROJECT_ID`,
`NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME` and `NEON_ROLE_NAME` settings.
Retain `NEON_API_KEY` for the new helper, scoped appropriately. Generated
`SEED_TARGET` replaces any manually installed target.

Inventory old title/PR-based databases, dedicated preview/seed/provisioner
roles, control databases and per-PR Neon branches separately. Remove them only
after confirming no deployed image or other consumer uses them. The workflow
does not migrate ownership or delete resources outside its new namespace.
Infrastructure, credential separation and legacy cleanup remain operator rollout
work; tests do not provision, seed or deploy live resources.
