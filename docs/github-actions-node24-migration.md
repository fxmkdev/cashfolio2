# GitHub Actions Node 24 Migration

Tracking issue: [#104](https://github.com/felixmokross/cashfolio2/issues/104)

This repository already upgraded directly controllable action references to Node
24-compatible majors in
[#103](https://github.com/felixmokross/cashfolio2/pull/103).

Some CI warnings are still expected because a few external or shared actions
still run on Node 20:

- `neondatabase/delete-branch-action@v3` (latest `v3.2.1` still uses
  `actions/setup-node@v4`; upstream `main` has moved to `actions/setup-node@v6`,
  but this repository is waiting for a semver tag instead of pinning a commit)
- Shared `felixmokross/webplatform` setup/workflow path (uses
  `actions/setup-node@v4`)

Resolved since #104 was opened:

- `superfly/flyctl-actions/setup-flyctl@master` now declares
  `runs.using: node24`
- `neondatabase/create-branch-action@v6` now declares `runs.using: node24`

GitHub timeline from the warning:

- Node 24 becomes default on June 2, 2026
- Node 20 is removed from runners on September 16, 2026

Use issue #104 as the single tracking place for these remaining dependencies.
