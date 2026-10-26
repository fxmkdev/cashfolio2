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
automatic deployment can temporarily leave old Machines serving requests against
the new enum. Account reads and writes can fail between the migration committing
and replacement completing. This temporary interruption is accepted for this
release: the existing automatic deployment flow remains supported without an
additional approval gate, traffic blocking, or stopping old Machines beforehand.
Operators may optionally block traffic, stop Machines, and pause
database-writing jobs to manage the interruption within a maintenance window.

1. Build and validate the new immutable image. Record the previous image and
   take a database backup with a verified restoration procedure.
2. Deploy through the existing workflow. The new image's migration release
   command maps account/group types to `BALANCE`, preserves financial records,
   recreates the asset-class constraint and system-account indexes, and rotates
   book cache revisions in one transaction. Fly then replaces the web Machines.
   New environments can apply the full migration history normally.
3. Verify migration and replacement success, with all web Machines running the
   new image. Check account/category lists, signed bank and credit-card
   balances, opening-balance edits, imports, Gain/Loss, and Report/History
   totals. Net worth and booking values must match the pre-cutover results using
   the same valuations. Verify account creation stores `BALANCE` and system
   Gain/Loss seeding still works.
4. Previously open browser tabs must reload; old mutation types are
   intentionally rejected. Retry requests or database-writing jobs that failed
   during the interruption using the new image. If traffic or jobs were
   optionally paused, resume them after replacement completes.

If migration fails before commit, inspect Prisma's migration status. Verify that
the transaction rolled back and resolve the cause; then run
`prisma migrate resolve --rolled-back 20261024120000_unify_balance_account_types`
using the new image's migration tooling before retrying its release command. If
the migration commits but Machine replacement fails, application errors can
continue until recovery completes. Finish or retry deployment using the new
image; restarting or rolling back to the old image cannot restore compatibility
with the migrated database. Database rollback requires stopping all writers and
restoring the verified pre-cutover database backup together with the previous
image, accounting for any post-cutover writes. There is no automatic reverse
migration because the original permanent classification has been removed. Cache
revisions are restored with the database backup.

The accepted interruption does not change backup, verification, or rollback
requirements. No additional deployment gate is required for this migration.

## Nonproduction release seed

Staging and preview deployments run
`node apps/cashfolio-app2/dist/staging-seed/seed.mjs --release` from the exact
image being deployed. The shared runner verifies both approved connections
read-only, applies migrations with the existing reachability retry helper,
grants application-table seed permissions, then transactionally replaces data.
Missing configuration fails deployment. Production retains its migration-only
release command and cannot invoke the seed CLI with its environment.

The shared `seed:nonproduction` command executes the built payload. Its
`--release` option resolves the migration helper relative to the payload, so it
works from the repository root and the app directory.

The source and bundled paths retain their historical `staging-seed` name to
avoid moving the dataset and its tests. `pnpm build:staging-seed` bundles the
shared runner with the generated Prisma client and accounting conventions;
Docker copies the complete output directory and query compiler chunks into the
slim release payload. The command needs no workspace install in that image.

Staging's `SEED_DATABASE_URL`, `SEED_TARGET`, `SEED_USER_EXTERNAL_IDS`, and
`SEED_ADMIN_EXTERNAL_IDS` remain operator-provisioned Fly secrets. Previews
receive only their own generated database/seed credentials from a trusted
controller on `main`; its database provisioning credential never enters PR code.
No Neon branching operations are used. Exact Neon identity checks continue to
protect the configured fixed hosts and databases.

See [Synthetic staging data](../../../docs/staging-database-refresh.md) for
staging setup and [Preview environments](../../../docs/preview-environments.md)
for the required preview-only host, protected GitHub environment, credentials
and existing-preview cutover.

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
