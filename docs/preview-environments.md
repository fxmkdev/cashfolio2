# Preview environments

Staging and previews share the existing nonproduction Neon project, host and
database-owner login. Every open, same-repository PR gets a separate database so
its schema and test data can evolve independently. These databases are equally
trusted: there is no permission boundary between staging and previews.
Production uses a separate project and credentials.

## Deployment lifecycle

1. The normal `Build` workflow builds the exact PR head on Fly/Depot using the
   existing `FLY_CASHFOLIO_APP_STAGING_APP` and `FLY_API_TOKEN`. PR image tags
   include the head SHA, run ID and attempt. The build resolves an immutable
   digest, with bounded retries while the image becomes available, and passes it
   directly to the preview deployment job. Forks cannot publish or deploy.
2. After a successful image build, deployment validates the current open,
   same-repository PR and exact head SHA. Other CI checks run independently.
3. Using the approved staging connection, it finds or creates that PR's empty
   database with the existing owner login. No roles, passwords, control
   database, access grants or Neon branches are created or changed.
4. It stages the application settings with a `DATABASE_URL` for the preview
   database, rechecks the PR head and deploys the exact image digest.
5. The release command verifies the approved destination read-only, applies
   migrations, then transactionally replaces application data using that image's
   seed code. Verification repeats inside the replacement transaction. Any
   failure stops the release before web Machines update.

The existing required check is `Deploy to preview / cashfolio-app2: Deploy`. Its
summary identifies the PR, exact commit, URL and outcome. Missing configuration
fails deployment rather than skipping seeding. Staging and production continue
to deploy the shared release image independently; production is migration-only.

## Databases and cleanup

Database names retain the existing shape:
`pr-<PR_NUMBER>-<SANITIZED_PR_TITLE>-cashfolio-app2`. Titles are lowercased;
non-ASCII-alphanumeric characters become dashes, repeated dashes collapse, and
empty titles use `preview`. Names over PostgreSQL's 63-byte limit are truncated
with a six-character SHA-1 suffix.

The initial title determines the name. Later deployments find the existing
database by its exact PR prefix and database-name pattern, so title changes do
not recreate it. Multiple matches or unexpected ownership fail for operator
review.

Fly names and URLs retain the branch-tail convention:
`cashfolio-app2-pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>.fly.dev`. The last branch-name
segment is sanitized and truncated, replacing `github` with `gh` for Fly.

Closing a PR invokes cleanup from `main`, deleting only its validated preview
database and Fly app. Cleanup checks the PR naming pattern and expected owner,
and explicitly refuses the configured staging database. Missing resources are
harmless; failures require operator attention. There is no branch-expiry
fallback. Reopened PRs get a fresh database on their next deployment.

Deployment and cleanup share a noncancelling per-PR concurrency group. Database
operations also use a per-PR advisory lock. Preview edits are disposable: every
deployment replaces application data. Tester identities and roles are retained,
and empty databases bootstrap only explicitly configured administrators.

Staging and previews share compute capacity and availability. A busy preview can
affect staging. They also share staging Redis for market rates; seeding
preserves those caches. Fresh book IDs and cache revisions prevent stale
calculations.

## One-time configuration

Use staging's existing PostgreSQL 17+ direct connection and database-owner login
with `CREATEDB`. The
[normal Neon owner role](https://neon.com/docs/manage/roles) is supported; no
`CREATEROLE` permission, new role, control database, SQL bootstrap or privilege
changes are required. The password must be exclusive to the nonproduction
project: production must reject these credentials even if its role has the same
name. Never clone nonproduction credentials into production or provide
production credentials to preview workflows/apps.

Configure the existing `preview-cashfolio-app` GitHub environment:

- Secret `PREVIEW_DATABASE_ADMIN_URL`: staging's existing database connection,
  using its direct endpoint and `sslmode=verify-full`.
- Variable `PREVIEW_DATABASE_TARGET`: independently reviewed staging host,
  project, branch, endpoint, database and owner role, as below.
- Secrets `SEED_USER_EXTERNAL_IDS` and `SEED_ADMIN_EXTERNAL_IDS`:
  comma-separated Logto IDs. Administrators must be a nonempty subset of
  testers.
- Existing app secrets: `LOGTO_APP_SECRET`, `LOGTO_MANAGEMENT_API_APP_SECRET`,
  `CURRENCYLAYER_API_KEY`, `COINLAYER_API_KEY`, `MARKETSTACK_API_KEY`,
  `STAGING_REDIS_URL`; the existing `FLY_API_TOKEN` remains available from the
  repository or environment.

```json
{
  "hostname": "ep-approved-staging.eu-central-1.aws.neon.tech",
  "projectId": "approved-project-id",
  "branchId": "br-approved-staging",
  "endpointId": "ep-approved-staging",
  "database": "neondb",
  "role": "neondb_owner"
}
```

The workflow verifies this target through the connected server before creating
or dropping databases. Each app receives a `SEED_TARGET` for its exact database,
environment, Fly app and shared role. Verified TLS, server-reported identity,
strict connection options and database-name checks protect against accidental
misrouting. Production protection also depends on separate credentials; these
checks are not a security boundary against trusted contributors changing PR
code.

Retain the existing deployment variables: `FLY_ORG`, `FLY_PRIMARY_REGION`,
`FLY_MIN_MACHINES_RUNNING`, `FLY_MEMORY`, `FLY_CPU_KIND`, `FLY_CPUS`,
`LOGTO_ENDPOINT`, `LOGTO_APP_ID`, `LOGTO_MANAGEMENT_API_ENDPOINT`,
`LOGTO_MANAGEMENT_API_RESOURCE`, `LOGTO_MANAGEMENT_API_APP_ID`. Keep the
repository variable `FLY_CASHFOLIO_APP_STAGING_APP` for the shared image
repository.

The environment must allow PR deployments and `main` cleanup. Same-repository
contributors are trusted with the existing Fly token and the shared
nonproduction login. No new GitHub environment, manual reviewer gate, Fly
organization or token is required.

## Cutover and operation

Install staging's simplified `SEED_TARGET` and tester/admin settings before the
first new release; see [Synthetic staging data](staging-database-refresh.md).
The runner uses the app's existing `DATABASE_URL` for migrations and seeding.
The daily staging refresh remains at 03:30 Europe/Zurich.

Push to an open same-repository PR or rerun its Build workflow after
configuration. Existing previews switch to empty, seeded databases; old test
data is disposable and is not copied. Cleanup must land on `main` before it
handles closures under the new database setup.

If earlier setup instructions were applied, retire obsolete
`PREVIEW_DATABASE_PASSWORD_KEY`, `SEED_DATABASE_URL`, `STAGING_SEED_*` and
`STAGING_SEED_ENABLED` settings after the new releases succeed. Earlier preview
roles, the dedicated seed/provisioner roles and control database are
unnecessary; remove them only after confirming no deployed images or other
consumers use them. The workflow does not migrate their ownership or delete
these legacy resources. An existing preview with an unexpected owner requires
operator cleanup before retry.

Inventory and remove old per-PR Neon branches separately after cutover, then
remove obsolete `NEON_API_KEY`, `NEON_STAGING_PROJECT_ID`,
`NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME` and `NEON_ROLE_NAME` settings.
Production isolation and live configuration are operator rollout work;
implementation tests use disposable local PostgreSQL and do not run live
provisioning or deployment.
