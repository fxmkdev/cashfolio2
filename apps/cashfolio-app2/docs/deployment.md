# Deployment

`cashfolio-app2` builds a TanStack Start production runtime with Nitro and runs
the generated Node server from `.output/server/index.mjs`.

## Nitro version pin

The app intentionally pins `nitro` to an exact beta version instead of a range.
As of 2026-05-22, the npm `latest` tag for `nitro` was also a dated beta
release, while the stable `nitro@3.0.0` package declared only `vite: ^7` peer
compatibility. This app runs on Vite 8, and the beta Nitro line declares
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

## Fly release migrations

Fly deployments keep using `release_command` for Prisma migrations so migrations
run from the same image before app Machines update. The Docker runtime image is
still intentionally slim: it copies Nitro `.output` plus a minimal Prisma
migration payload, not the full repository or workspace install.

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
