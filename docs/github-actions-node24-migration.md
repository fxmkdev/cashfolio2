# GitHub Actions Node 24 Migration

Tracking issue: [#104](https://github.com/fxmkdev/cashfolio2/issues/104)

This repository already upgraded directly controllable action references to Node
24-compatible majors in [#103](https://github.com/fxmkdev/cashfolio2/pull/103).

## Neon delete action

As of October 10, 2026, both preview cleanup steps pin
`neondatabase/delete-branch-action` to upstream commit
[`aed9ab1ec86e380312c7b0a9e29942e41349adf6`](https://github.com/neondatabase/delete-branch-action/commit/aed9ab1ec86e380312c7b0a9e29942e41349adf6).
This composite action uses `actions/setup-node` pinned to `v6.4.0`, which runs
on Node 24. It also pins `neonctl` to `2.22.0`, disables npm install scripts,
and passes branch inputs through environment variables.

The Node 24 upgrade was merged in
[upstream PR #29](https://github.com/neondatabase/delete-branch-action/pull/29)
on May 9, 2026; the additional hardening was merged in
[upstream PR #33](https://github.com/neondatabase/delete-branch-action/pull/33).
The latest tagged release, `v3.2.1`, still uses `actions/setup-node@v4` and
emits a Node 20 deprecation warning when GitHub forces it to run on Node 24.

The commit pin is temporary: adopt a compatible tagged release once Neon
publishes one, after checking its changes and validating preview cleanup.
Pinning the full commit avoids automatically consuming changes to upstream
`main` while waiting for that release.

Keep #104 open until the pin is merged and a subsequent preview cleanup run
confirms that deletion works without the Node 20 warning. Opening the pull
request does not exercise this workflow, which runs when a pull request closes.

## Other resolved dependencies

Resolved since #104 was opened:

- `superfly/flyctl-actions/setup-flyctl@master` now declares
  `runs.using: node24`
- `neondatabase/create-branch-action@v6` now declares `runs.using: node24`
- `pnpm/action-setup` was upgraded from `v4` to `v6`; `v6` declares
  `runs.using: node24` and still reads the root `packageManager` field
- The previous `fxmkdev/webplatform` setup/version dependency was replaced by
  local workflows/actions that use this repository's Node 24 configuration
- `neondatabase/reset-branch-action` is no longer used by this repository's
  workflows, so it is no longer a migration blocker

## GitHub runner timeline

- Node 24 became the default on June 16, 2026, according to the updated
  [deprecation announcement](https://github.blog/changelog/2025-09-19-deprecation-of-node-20-on-github-actions-runners/).
- Node 20 was removed from runners on September 23, 2026. Runners now use Node
  24 for JavaScript actions, and the temporary Node 20 opt-out is no longer
  available; see the
  [removal announcement](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions/).

Use issue #104 to track the remaining cleanup verification.
