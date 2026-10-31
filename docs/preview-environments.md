# Preview environments

Every open, same-repository PR gets a Fly app and an isolated PostgreSQL
database on one fixed, preview-only Neon project. Deployment applies the PR's
migrations and replaces application data with that PR's synthetic dataset.
Preview edits are disposable: every deployment replaces them. Production remains
migration-only.

## Deployment lifecycle

1. The `Build` workflow builds the exact PR head on Fly/Depot and pushes it to
   the existing shared image repository using `FLY_CASHFOLIO_APP_STAGING_APP`
   and `FLY_API_TOKEN`. It uploads `preview-image.json` with the PR number, full
   head SHA and immutable image digest. PR tags include the head SHA, run ID and
   attempt, separately from release tags. Forks cannot publish preview images.
   Docker registry authentication uses `flyctl auth docker`. Digest recording
   retries registry reads with bounded delays while a new Depot image becomes
   available; missing or invalid digests fail the build without publishing
   deployment metadata.
2. `Deploy preview` runs after Build finishes. It validates the GitHub run,
   successful image-build job, open same-repository PR and current head SHA.
   Other CI failures do not override a successful image build; their checks
   remain visible separately. Deployment now waits for the Build run to finish.
3. The controller checks out its own default-branch commit. It treats downloaded
   image metadata as data and validates its PR, SHA and configured registry
   path. It never checks out PR code or executes a PR image on the provisioning
   runner.
4. Through a verified connection to the fixed preview host, the controller
   creates or reuses the database and its two restricted roles. It stages only
   preview credentials on the preview Fly app, then deploys the exact image
   digest.
5. The Fly release command verifies both database connections read-only, applies
   migrations, grants seed permissions, and transactionally seeds the database.
   Configuration, migration or seed failure fails the release before web
   Machines update. Review the deployment summary for PR, exact commit, URL and
   outcome.

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
credentials. Never put the key or provisioning URL in a preview app, PR build
job or repository-wide secret. Changing the key requires a coordinated operator
credential rotation; existing roles are deliberately not reset.

Deployment and cleanup share a noncancelling per-PR concurrency group. Database
operations also take a per-PR advisory lock. The controller rechecks PR state
and head after preparing resources; closed or obsolete runs fail without
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
CREATE DATABASE cashfolio_preview_control OWNER cashfolio_preview_provisioner;
REVOKE ALL ON DATABASE cashfolio_preview_control FROM PUBLIC;
-- Also restrict the project's initial database and every other connectable
-- database on this preview-only host. Adjust the initial name if necessary.
REVOKE ALL ON DATABASE neondb FROM PUBLIC;
REVOKE ALL ON DATABASE postgres FROM PUBLIC;
```

The provisioner uses `CREATEROLE` to create restricted SQL roles and retains
membership in its created roles for ownership/cleanup operations. It must not
belong to `neon_superuser`. Check the approved Neon project/branch/endpoint,
current database and current role through its connection. Its identity must not
exist on staging or production; independently verify production authentication
with preview credentials is rejected, without recording passwords.

### Trusted GitHub environment

Create `preview-cashfolio-provision` with a deployment branch policy allowing
**only `main`**, no tags. Configure this restriction **before adding secrets**.
No manual reviewer gate is required. Do not reuse the old unprotected
`preview-cashfolio-app` environment for privileged database credentials.

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

Copy the existing preview deployment variables into the new environment:
`FLY_ORG` (required), `FLY_PRIMARY_REGION`, `FLY_MIN_MACHINES_RUNNING`,
`FLY_MEMORY`, `FLY_CPU_KIND`, `FLY_CPUS`, `LOGTO_ENDPOINT`, `LOGTO_APP_ID`,
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

Database provisioning credentials and the password-derivation key remain in the
main-only environment. Keep staging seed and production database credentials out
of PR build jobs and preview apps.

### Staging seed settings

Before the first deployment of this implementation, install the new `SEED_*`
secrets on staging as described in
[Synthetic staging data](staging-database-refresh.md). There is no longer an
optional staging seed enablement flag.

## Cutover and operation

After the controller exists on `main`, push to an open same-repository PR or
rerun its Build workflow. The new controller switches its Fly app to a new empty
database, migrates and seeds it. Previous preview data is disposable and is not
copied. Older images without the shared release command fail rather than bypass
its protections; update the PR before deployment.

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
