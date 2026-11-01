# Preview environments

Every open, same-repository PR gets a Fly app and an isolated PostgreSQL
database on one fixed, preview-only Neon project. Deployment applies the PR's
migrations and replaces application data with that PR's synthetic dataset.
Preview edits are disposable: every deployment replaces them. Production remains
migration-only.

## Deployment lifecycle

1. The `Build` workflow builds the exact PR head on Fly/Depot and pushes it to
   the existing shared image repository using `FLY_CASHFOLIO_APP_STAGING_APP`
   and `FLY_API_TOKEN`. PR tags include the head SHA, run ID and attempt,
   separately from release tags. Forks cannot publish preview images or deploy.
2. The build job resolves the immutable image digest and passes it directly to
   the preview deployment job through a job output. Registry authentication uses
   `flyctl auth docker`; bounded retries account for newly published Depot
   images becoming available. Missing or invalid digests fail the build and
   prevent deployment. No metadata artifact or separate deployment workflow is
   used.
3. The preview deployment job uses the exact PR head's scripts and validates the
   open, same-repository PR, current head SHA and configured image repository.
   It starts after a successful image build; unrelated CI checks run
   independently.
4. Through a verified connection to the fixed preview host, it creates or reuses
   the database and its two restricted roles. It stages only that preview's
   credentials on the preview Fly app, rechecks the PR head, then deploys the
   exact image digest. Later deployments reuse the database, rather than
   recreating it.
5. The Fly release command verifies both database connections read-only, applies
   migrations, grants seed permissions, and transactionally replaces application
   data. Configuration, migration or seed failure fails the release before web
   Machines update. Review the deployment summary for PR, exact commit, URL and
   outcome.

The preview job retains the required check name
`Deploy to preview / cashfolio-app2: Deploy`. GitHub reports the job outcome
normally; no custom commit-status publisher is needed.

No preview deployment creates, copies, resets or deletes a Neon branch. Neon
still hosts PostgreSQL on its fixed default branch; its project/branch/endpoint
IDs are used only to verify the configured server identity.

## Names and isolation

Database names follow the former branch name shape:
`pr-<PR_NUMBER>-<SANITIZED_PR_TITLE>-cashfolio-app2`. Titles are lowercased,
non-ASCII-alphanumeric characters become dashes, repeated dashes collapse, and
empty titles after sanitization use `preview`. Names exceeding PostgreSQL's
63-byte identifier limit are truncated with a six-character SHA-1 suffix.

The initial title determines the database name. Later title edits reuse the
original database, discovered through its unique PR-specific owner. Unexpected
ownership or multiple databases for that owner require operator review.

Fly names and URLs retain the existing branch-tail convention:
`cashfolio-app2-pr-<PR_NUMBER>-<BRANCH_TAIL_SLUG>.fly.dev`. The resolver
sanitizes and truncates the last branch-name segment, replacing `github` with
`gh` for Fly.

The roles `cashfolio_pr_<PR_NUMBER>_app` and `cashfolio_pr_<PR_NUMBER>_seed`
have independent passwords. The app role owns only its database and runs
migrations; the seed role receives only application-table CRUD, schema usage and
required function execution. Neither role can create databases or roles, bypass
RLS, or inherit privileged Neon membership. Database access for `PUBLIC` is
revoked.

Passwords are deterministically derived with HMAC-SHA-256 from a private
provisioning-only key, PR number and role kind. Retries do not rotate active
credentials. Never put the key or provisioning URL in a preview app. Keep both
in the preview deployment environment, rather than repository-wide secrets.
Changing the key requires a coordinated operator credential rotation; existing
roles are deliberately not reset.

Deployment and cleanup share a noncancelling per-PR concurrency group. Database
operations also take a per-PR advisory lock. The deployment job rechecks PR
state and head after preparing resources; closed or obsolete runs fail without
deploying.

Preview apps retain shared staging Redis for market rates. Fresh book IDs and
cache revisions prevent stale calculations after seeding; no Redis flush occurs.

## One-time configuration — complete before merge

### Fixed preview database host

Create a **new, empty, preview-only Neon project**, using PostgreSQL 17 or newer
and a fixed direct endpoint. It must contain no production or staging data,
credentials, or inherited roles. Keep staging on its existing database.

Using an independently authorized SQL session on this new project only:

```sql
CREATE ROLE cashfolio_preview_provisioner
  LOGIN CREATEDB CREATEROLE NOINHERIT NOSUPERUSER NOREPLICATION NOBYPASSRLS;
-- Use psql's interactive password command; never put the password in SQL/logs.
\password cashfolio_preview_provisioner
GRANT cashfolio_preview_provisioner TO CURRENT_USER WITH SET TRUE;
CREATE DATABASE cashfolio_preview_control OWNER cashfolio_preview_provisioner;
REVOKE ALL ON DATABASE cashfolio_preview_control FROM PUBLIC;
-- Also restrict the project's initial database and every other connectable
-- database on this preview-only host. Adjust the initial name if necessary.
REVOKE ALL ON DATABASE neondb FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
```

PostgreSQL 17 automatically grants a newly created role back to its creator with
administration permission, but without `SET ROLE` permission. The explicit SET
grant above lets a normal Neon operator assign the control database's ownership
to the provisioner without requiring a superuser.

The provisioner uses `CREATEROLE` to create restricted SQL roles and retains
membership in its created roles for ownership/cleanup operations. It must not
belong to `neon_superuser`. Check the approved Neon project/branch/endpoint,
current database and current role through its connection. Its identity must not
exist on staging or production; independently verify production authentication
with preview credentials is rejected, without recording passwords.

### Existing preview GitHub environment

Use the existing `preview-cashfolio-app` environment for preview deployment and
cleanup. Its deployment policy must allow same-repository PR workflows and
`main` for cleanup; it must not be restricted to `main` only. No new environment
or manual reviewer gate is required.

Same-repository contributors are trusted with this environment's preview
provisioning credentials: PRs can change both the workflow and its scripts.
These credentials can manage all databases and roles on the dedicated preview
host, and the password-derivation key can derive other previews' passwords.
Forks are excluded from image publishing, provisioning and deployment. This is a
contributor trust policy; destination checks still protect against accidental
misconfiguration.

Secrets in this environment:

- `PREVIEW_DATABASE_ADMIN_URL`: direct URL for `cashfolio_preview_provisioner`
  on `cashfolio_preview_control`, using `sslmode=verify-full`.
- `PREVIEW_DATABASE_PASSWORD_KEY`: at least 32 random bytes, encoded as
  even-length lowercase hex. Generate it locally without logging it.
- `SEED_USER_EXTERNAL_IDS`, `SEED_ADMIN_EXTERNAL_IDS`: comma-separated Logto
  IDs; admin IDs must be a nonempty subset of tester IDs.
- The existing `FLY_API_TOKEN` must be available to this environment, either
  inherited from the repository or explicitly configured here. It must be able
  to create/delete preview apps, stage their secrets and pull the shared images.
- Existing preview secrets: `LOGTO_APP_SECRET`,
  `LOGTO_MANAGEMENT_API_APP_SECRET`, `CURRENCYLAYER_API_KEY`,
  `COINLAYER_API_KEY`, `MARKETSTACK_API_KEY`, `STAGING_REDIS_URL`.

Variable `PREVIEW_DATABASE_TARGET` is the independently reviewed exact host:

```json
{
  "hostname": "ep-preview-example.eu-central-1.aws.neon.tech",
  "projectId": "preview-project-id",
  "branchId": "br-fixed-preview-host",
  "endpointId": "ep-preview-example",
  "database": "cashfolio_preview_control",
  "role": "cashfolio_preview_provisioner"
}
```

Retain the existing preview deployment variables in this environment: `FLY_ORG`
(required), `FLY_PRIMARY_REGION`, `FLY_MIN_MACHINES_RUNNING`, `FLY_MEMORY`,
`FLY_CPU_KIND`, `FLY_CPUS`, `LOGTO_ENDPOINT`, `LOGTO_APP_ID`,
`LOGTO_MANAGEMENT_API_ENDPOINT`, `LOGTO_MANAGEMENT_API_RESOURCE`,
`LOGTO_MANAGEMENT_API_APP_ID`. Keep the repository variable
`FLY_CASHFOLIO_APP_STAGING_APP` available to both the build and provisioning
jobs; it identifies the existing shared image repository, even though its Fly
app is named for staging.

Same-repository contributors are trusted with the existing repository-level
`FLY_API_TOKEN`: the PR workflow can access it when requesting Fly/Depot builds
and publishing images. No separate preview image app, build token or Fly
organization is required. This shared token does not isolate Fly access between
previews, staging and production. Staging and production continue to deploy the
same release image independently, without rebuilding it.

Database provisioning credentials and the password-derivation key are passed
only to the preview preparation step, never to the Fly app. Keep staging seed
and production database credentials out of preview settings. Environment scoping
is organizational and does not prevent trusted contributors from changing PR
code to access preview secrets.

### Staging seed settings

Before the first deployment of this implementation, install the new `SEED_*`
secrets on staging as described in
[Synthetic staging data](staging-database-refresh.md). There is no longer an
optional staging seed enablement flag.

## Cutover and operation

Configure the preview environment and staging seed settings before rollout. A
push to an open same-repository PR, or a rerun of its Build workflow, provisions
and deploys the preview directly. Missing configuration fails deployment;
seeding is never silently skipped. No default-branch deployment controller
bootstrap is required.

On its next deployment, an existing preview switches to its newly provisioned
empty database, then migrates and seeds it. Previous preview data is disposable
and is not copied. Older images without the shared release command fail rather
than bypass its protections; update the PR before deployment.

Cleanup on PR closure uses the workflow and scripts on `main`, so that cleanup
change must land before it handles closures under the new database setup.

After verifying cutover, manually inventory and remove the old per-PR Neon
branches. The new cleanup workflow intentionally does not access the old project
or keep a Neon API key. Remove obsolete `NEON_API_KEY`,
`NEON_STAGING_PROJECT_ID`, `NEON_STAGING_BRANCH_ID`, `NEON_DATABASE_NAME`, and
`NEON_ROLE_NAME` settings from preview configuration after old branches are
cleaned up.

Closing a PR invokes trusted cleanup from `main`: it removes the Fly app, its
owned database and both roles. Missing resources are harmless. Unexpected
ownership, unmanaged roles or provider failures produce a visible failure;
operators must inspect and retry cleanup. There is no former 14-day
branch-expiry fallback, so failed cleanup must be addressed. Reopened PRs get a
fresh database on their next build.

The daily staging refresh remains at 03:30 Europe/Zurich. No live provisioning,
deployment or seeding is part of the implementation's local tests.
