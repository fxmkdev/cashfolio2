# GitHub Actions Node 24 Migration

Tracking issue: [#104](https://github.com/fxmkdev/cashfolio2/issues/104)

This repository already upgraded directly controllable action references to Node
24-compatible majors in [#103](https://github.com/fxmkdev/cashfolio2/pull/103).

## Neon actions removed

Preview deployments now create independent databases on a fixed preview host;
creation and cleanup no longer invoke Neon branching actions. The previous Node
24-compatible delete-action pin
[`aed9ab1ec86e380312c7b0a9e29942e41349adf6`](https://github.com/neondatabase/delete-branch-action/commit/aed9ab1ec86e380312c7b0a9e29942e41349adf6)
and its tagged-release follow-up are therefore obsolete. See
[Preview environments](preview-environments.md) for replacement provisioning,
cleanup and manual removal of old preview branches.

## Other resolved dependencies

Resolved since #104 was opened:

- `superfly/flyctl-actions/setup-flyctl@master` now declares
  `runs.using: node24`
- Neon create/delete/reset branch actions are no longer runtime dependencies
- `pnpm/action-setup` was upgraded from `v4` to `v6`; `v6` declares
  `runs.using: node24` and still reads the root `packageManager` field
- The previous `fxmkdev/webplatform` setup/version dependency was replaced by
  local workflows/actions that use this repository's Node configuration
- `neondatabase/reset-branch-action` is no longer used by this repository's
  workflows, so it is no longer a migration blocker

## GitHub runner timeline

- Node 24 became the default on June 16, 2026, according to the updated
  [deprecation announcement](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
- Node 20 was removed from runners on September 23, 2026. Runners now use Node
  24 for JavaScript actions, and the temporary Node 20 opt-out is no longer
  available; see the
  [removal announcement](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

The former Neon action cleanup verification is superseded by the
database-per-preview cutover.
