# Deployment

`cashfolio-app2` builds a TanStack Start production runtime with Nitro and runs
the generated Node server from `.output/server/index.mjs`.

## Nitro version pin

The app intentionally pins `nitro` to an exact beta version instead of a range.
As rechecked on 2026-10-10, the npm `latest` tag for `nitro` is still a dated
beta release, while the stable `nitro@3.0.0` package declared only `vite: ^7`
peer compatibility. This app runs on Vite 8, and the beta Nitro line declares
`vite: ^7 || ^8`.

Because of that peer-compatibility difference, `nitro@3.0.0` is not the safer
choice for this app despite lacking a `-beta` suffix. Keep the exact beta pin
until Nitro publishes a non-beta release that declares Vite 8 compatibility and
passes the app build, E2E, and preview deploy checks.

When revisiting the pin, check the published peer dependencies before changing
the package:

```bash
pnpm view nitro version dist-tags peerDependencies --json
pnpm view nitro@3.0.0 peerDependencies --json
```

The pinned beta uses `ocache` 0.1. Newer stable H3 releases require `ocache`
0.3, so `pnpm-workspace.yaml` pins `nitro>h3` to the patched `2.0.1-rc.20`
release candidate. Revisit this scoped override together with the Nitro pin.

## Fly release migrations

Fly deployments keep using `release_command` for Prisma migrations so migrations
run from the same image before app Machines update. The Docker runtime image is
still intentionally slim: it copies Nitro `.output` plus a minimal Prisma
migration payload, not the full repository or workspace install.

## Balance account type cutover

The `20261024120000_unify_balance_account_types` migration is incompatible with
application images whose generated Prisma client expects `ASSET`/`LIABILITY`.
Fly runs release migrations before replacing web Machines, so an ordinary
rolling deployment is **not supported** for this release. Apply this procedure
separately to each existing environment when its prerequisite stack is deployed:

1. Build and validate the new immutable image. Record the previous image and
   take a database backup with a verified restoration procedure. Reserve a
   maintenance window; do not let automated deployments race the cutover.
2. Block incoming traffic, including automatic wake-up of old Machines. Pause
   scheduled cleanup, staging seed, administrative scripts, and other database
   writers, then stop all old web Machines and wait for in-flight writes to
   finish. Do not rely on stopping Machines alone while auto-start remains
   reachable through the proxy.
3. Run the new image's migration release command against this environment. The
   migration maps account/group types to `BALANCE`, preserves financial records,
   recreates the system-account indexes, and rotates book cache revisions in one
   transaction. Verify migration success before starting web traffic. New
   environments can apply the full migration history normally.
4. Start only Machines running the new image. Verify account/category lists,
   signed bank and credit-card balances, opening-balance edits, imports,
   Gain/Loss, and Report/History totals. Net worth and booking values must match
   the pre-cutover results using the same valuations. Verify account creation
   stores `BALANCE` and system Gain/Loss seeding still works.
5. Restore traffic and automatic wake-up only after no old image can serve
   requests. Resume compatible scheduled jobs and deployments. Previously open
   browser tabs must reload; old mutation types are intentionally rejected.

If migration fails before commit, keep traffic blocked and inspect Prisma's
migration status. Verify that the transaction rolled back and resolve the cause;
then run
`prisma migrate resolve --rolled-back 20261024120000_unify_balance_account_types`
using the new image's migration tooling before retrying its release command.
Once the migration commits, **never restart the old image against the migrated
database**. Rollback requires stopping all new writers and restoring the
verified pre-cutover database backup together with the previous image,
accounting for any post-cutover writes. There is no automatic reverse migration
because the original permanent classification has been removed. Cache revisions
are restored with the database backup.

This procedure documents an operator-run deployment; creating the migration PR
does not authorize executing it on production or staging.

## Staging release seed

The seed CLI lives inside `cashfolio-app2` because it is an app-specific
deployment task that uses the app’s generated Prisma client and accounting
conventions. This avoids making `tools/cli` depend on application internals. If
both projects later need it, extract an independent workspace package for shared
use.

Staging selects `scripts/release-staging.sh` as its Fly release command. With
`STAGING_SEED_ENABLED=true`, it verifies the approved seed and migration targets
read-only before applying migrations, then transactionally replaces staging
application data. Seeding defaults to disabled until destination and credential
isolation are verified. Production and preview use the original migration-only
command and never receive the dedicated seed URL.

Operators manually provision `STAGING_SEED_DATABASE_URL`, `STAGING_SEED_TARGET`,
and `STAGING_SEED_USER_EXTERNAL_IDS` as secrets on staging's Fly app, following
the staging/production convention. CI does not set or copy these secrets. The
`STAGING_SEED_ENABLED` GitHub environment variable remains the non-secret
deployment flag and defaults to disabled. Missing seed configuration fails the
enabled release's read-only preflight before migrations. Dynamic previews retain
automatic provisioning of their ordinary app secrets and receive no seed
configuration.

`pnpm build:staging-seed` uses an independent Vite SSR configuration with
bundled dependencies to produce `dist/staging-seed/seed.mjs` and its dynamic
query compiler chunks. Docker builds this after Prisma generation and copies the
entire output directory into the release payload; the seed does not need a
workspace install in the runtime image. Keep generated chunks beside the entry
point.

See [Synthetic staging data](../../../docs/staging-database-refresh.md) for the
approved target, staging-only role, tester access, and enablement procedure.

## Provider usage cleanup

`pnpm --filter cashfolio-app2 build:provider-usage-cleanup` builds the
independent Node 24 payload at `dist/provider-usage-cleanup/cleanup.mjs`. Docker
copies the whole directory, including query compiler chunks, following the
staging-seed packaging pattern. The command requires only the app's
`DATABASE_URL`, creates its own Prisma client, and disconnects it on success or
failure. It does not start the web server or require authentication, Redis, or
valuation API secrets. After building,
`pnpm --filter cashfolio-app2 cleanup:provider-usage` executes it against the
configured database; this is a destructive retention operation.

`.github/workflows/cleanup-provider-usage.yml` runs daily at 03:43 UTC on the
default branch. Manual dispatch on `main` selects `prod`, `staging`, or `both`.
Scheduled runs target both; PR previews are excluded. Runs are serialized per
environment without cancelling active cleanup. The workflow uses the existing
`prod-cashfolio-app` / `staging-cashfolio-app` environments, `FLY_APP` and
`FLY_PRIMARY_REGION` variables, and `FLY_API_TOKEN` secret. No database
connection string is copied into GitHub Actions.

The Node 24 runner `scripts/run-provider-usage-cleanup.ts` resolves the
immutable image digest from the deployed `app` process Machines. Mixed web
images fail clearly, so rerun after deployment finishes. It uses the Fly
Machines API to launch a temporary Machine in that app, inheriting the app's
database secret. Creation sets `skip_launch: false`, letting Fly prepare the
image and start the Machine asynchronously. The runner polls through image
preparation and startup; it does not issue a separate start request that could
race image preparation. The Machine has one shared CPU, 512 MB RAM, no HTTP
services, and no restart. Its command overrides the web-server entrypoint. An
eight-minute runner budget allows startup, the five-minute cleanup budget, and
log delivery. The runner checks the process exit event, not merely a stopped
state. It destroys the Machine after success, and attempts stop plus
force-destruction after failure, timeout, or cancellation. Lost creation
responses are recovered by unique name. An API outage can prevent destruction; a
visible workflow failure then requires an operator to inspect/remove any
`provider-usage-cleanup-*` Machine.

Both production and staging must deploy an image containing this payload before
the workflow can succeed. Older images fail visibly; there is no fallback to a
different image or a GitHub-hosted database connection. Review GitHub Actions
logs and summaries for the UTC cutoff, deleted rows, committed batches, elapsed
milliseconds, and table-plus-index bytes. Failed runs report the last available
progress (or unavailable metrics when the command could not start) and fail the
job. No connection strings, raw driver errors, or arbitrary remote logs are
printed. Machines API HTTP errors identify the method, operation, and status
without including the response body. There is no additional notification
service.

CI exercises the runner with mocked Fly responses and the database cleanup in a
fresh, isolated PostgreSQL database, including the bundled CLI. Run locally with
`pnpm --filter cashfolio-app2 test:provider-usage-cleanup-runner` and
`pnpm --filter cashfolio-app2 test:provider-usage-cleanup`. The latter requires
a local PostgreSQL maintenance database and defaults to port 5433; set
`PROVIDER_USAGE_CLEANUP_TEST_DATABASE_URL` to override it. The test creates and
drops only a uniquely named test database, never the application database.

See [Raw request retention](valuation-caching.md#raw-request-retention) for the
cutoff, batching, and failure semantics.

## Fly CLI version

CI pins `flyctl` to `0.4.115` across build, deployment, database refresh, and
preview cleanup workflows. Fly changed its public IP assignment API to reject
`org_slug`; the old `0.4.25` CLI sent that field during first deployment. This
left preview apps without public addresses even though `flyctl deploy` returned
success, and HTTP warm-up failed with `Could not resolve host`. The upstream fix
shipped in
[flyctl 0.4.97](https://github.com/superfly/flyctl/releases/tag/v0.4.97).

Rerunning a historical workflow attempt still uses its original CLI pin;
existing PRs need to incorporate the updated workflows first.

## Compiler and package-manager installation

Docker keeps Node 24 and Prisma CLI/client/adapter 7.x. The build stage follows
the workspace's integrity-qualified pnpm 12.11.1 packageManager pin; the
separate migration-tools stage explicitly activates the same version. Filtered
frozen installation must retain TypeScript 7's Linux platform package and
TypeScript 6's compiler API alias. Preserve the minimal release-command payload
and reviewed Prisma build-script approvals when updating the image. The
migration-tools stage copies `pnpm-workspace.yaml` into its minimal private
workspace so the same release-age and patched compatible security overrides
govern that install. Audit this payload separately from the app's lockfile.

Docker pins Corepack 0.36.0, the eligible stable bootstrap checked during the
migration, rather than downloading an unreviewed latest release. Its Node 24
requirement is satisfied by the existing 24.21.0 image pin. Review Corepack's
publication age and runtime compatibility when changing this bootstrap pin.
