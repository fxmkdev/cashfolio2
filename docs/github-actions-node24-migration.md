# GitHub Actions Node 24 Migration

Tracking issue: [#104](https://github.com/fxmkdev/cashfolio2/issues/104)

This repository already upgraded directly controllable action references to Node
24-compatible majors in
[#103](https://github.com/fxmkdev/cashfolio2/pull/103).

Some CI warnings are still expected because two external Neon actions still
invoke `actions/setup-node@v4`, which runs on Node 20:

- `neondatabase/delete-branch-action@v3` (latest `v3.2.1` still uses
  `actions/setup-node@v4`)
- `neondatabase/reset-branch-action@v1` (latest `v1.3.2` and upstream `main`
  still use `actions/setup-node@v4`)

This repository is waiting for Neon semver tags instead of pinning unreleased
commits or replacing the actions with local `neonctl` shell steps.

Resolved since #104 was opened:

- `superfly/flyctl-actions/setup-flyctl@master` now declares
  `runs.using: node24`
- `neondatabase/create-branch-action@v6` now declares `runs.using: node24`
- `pnpm/action-setup` was upgraded from `v4` to `v6`; `v6` declares
  `runs.using: node24` and still reads the root `packageManager` field
- The previous `fxmkdev/webplatform` setup/version dependency was replaced
  by local workflows/actions that use this repository's Node 24 configuration

GitHub timeline from the warning:

- Node 24 becomes default on June 2, 2026
- Node 20 is removed from runners on September 16, 2026

Use issue #104 as the single tracking place for the remaining dependencies.
