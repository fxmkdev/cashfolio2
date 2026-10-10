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
