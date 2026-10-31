# Contributing

This workspace uses squash merges to `main`. The squash commit message comes
from the pull request title, so PR title quality matters.

## Feature Branch Workflow

These rules apply to all contributors and coding agents.

- Before starting implementation work, run `git fetch origin` and base new
  branches or worktrees on the freshly fetched `origin/main`.
- When updating an existing feature branch with changes from `main`, always run
  `git fetch origin` followed by `git rebase origin/main` from the feature branch.
  Never merge `main` or `origin/main` into a feature branch.
- If the rebase encounters conflicts, resolve them, stage the resolved files
  with `git add -- <paths>`, and run `git rebase --continue`. Repeat until the
  rebase completes; do not switch to a merge to avoid resolving rebase conflicts.
- Preserve individual commits during rebases by default. If replaying intermediate
  commits would cause avoidable or repeated conflict resolution, consider
  proposing a squash. Explain why it would help, identify the commits to combine,
  and describe the loss of individual commit history. Obtain explicit user
  confirmation of that proposal before squashing; permission to rebase, resolve
  conflicts, or force-push does not imply permission to squash.
- Without that confirmation, preserve the commits. After confirmation, combine
  only the approved commits, preserve their combined changes, and rebase onto
  freshly fetched `origin/main`. This approval requirement applies to rewriting
  feature-branch history; completed PRs retain the existing squash-merge policy.
- After rebasing a published feature branch, push the rewritten history with
  `git push --force-with-lease origin <feature-branch>`. Use the same remote branch
  so its open PR updates in place. If the lease fails, fetch and inspect the
  remote changes and incorporate any collaborators' work before retrying. Never
  bypass the lease with `--force`.

Completed pull requests continue to use squash merges into `main`.

## Pull Request Title Convention

All pull request titles must follow Conventional Commits:

`<type>(optional-scope): <description>`

Examples:

- `feat(cashfolio-app2): add archived-account filters`
- `fix(cashfolio-app2): prevent duplicate booking IDs`
- `docs: clarify deployment prerequisites`
- `chore(infra): bump flyctl version`

Recommended types:

- `feat`
- `fix`
- `docs`
- `refactor`
- `test`
- `chore`
- `ci`
- `build`
- `perf`

## Commit Messages Inside the PR

Commits inside a pull request can stay descriptive for review flow and do not
need to be strictly Conventional Commit formatted.

## Pull Request Description Workflow

- Prefer `gh pr create --body-file <path>` over `--body` to avoid shell
  escaping/newline formatting issues in PR descriptions.
- Prefer `gh pr edit --body-file <path>` for updates.
- If `gh pr edit` fails with a GraphQL error mentioning `projectCards`
  deprecation, update the body through REST:
  `gh api -X PATCH repos/<owner>/<repo>/pulls/<number> -f body="$(cat <path>)"`.

## Scope Guidance

- Use app or area scope when helpful (`cashfolio-app2`, `infra`, `docs`,
  `cli`).
- Keep descriptions concise, imperative, and behavior-focused.

## Runtime and Typings Policy

- Use Node 26 for local development, CI, and application runtime.
- Keep `@types/node` aligned with Node 26. Do not upgrade to Node 27+ typings
  until the runtime migration is planned.

## Calendar Operations

Use the app's shared Temporal entry point for calendar operations in server and
browser code. It selects native Temporal or the synchronous browser fallback
without modifying globals. Keep existing Date/string interfaces at Prisma,
transport, chart, and form boundaries. Preserve UTC accounting-day semantics and
local-calendar picker semantics separately. See the app's UI patterns for date
adapters and browser compatibility tests.

## Package Manager

Use the pnpm 12 version pinned by `packageManager` and `engines`. Keep Docker's
pnpm pin aligned. Dependency updates retain a minimum release age of 1440
minutes; do not add broad exceptions or relax the build-script allowlist. Use
`pnpm install --frozen-lockfile` when dependency installation is needed for the
work. Rely on CI to verify the committed dependency graph rather than installing
locally solely to repeat that verification.

## Compiler Tooling

Always author new handwritten code in TypeScript, including application code,
tests, scripts, tooling, and custom ESLint rules. Include each TypeScript source
in its owning package's typecheck. Existing JavaScript files can be migrated in
focused follow-ups; generated JavaScript and build output are not handwritten
source.

App and CLI typechecks use native TypeScript 7 through `tsc`. The `typescript`
dependency remains an alias to `@typescript/typescript6` for tools requiring the
TypeScript 6 compiler API, including ESLint and Storybook docgen. The native
compiler is installed through the `@typescript/native` alias. Use `tsc6` only
when comparing compatibility; preserve native `tsc` in typecheck scripts.

## Review Comment Workflow

- If the current Codex/chat thread is linked to an open pull request, push
  newly applied changes to that PR branch unless explicitly instructed
  otherwise.
- After you address a pull request comment, resolve that conversation in the
  PR.

## Verification Policy

When reviewing an existing PR, inspect workflows and results for its current
revision and reuse CI evidence rather than repeating CI-covered checks locally.
This applies to inexpensive checks as well as expensive suites. Pending,
missing, skipped, cancelled, or inaccessible CI results do not automatically
justify local replacements. Run a local check during review only for a concrete
investigation, a relevant check CI does not cover, or an explicit user request.
Inspect failing CI logs and artifacts first, then use the smallest useful local
reproduction if needed. Reviewing a branch without a PR does not automatically
require a local baseline suite either.

During implementation, including fixes made during a review, run relevant
inexpensive local checks before pushing for fast feedback even when CI also
covers them. Prefer focused unit tests, typecheck, and lint/format checks scoped
to the change where practical. Choose checks based on the changed behavior and
their actual cost; a small unit suite may be appropriate in full, while a costly
suite should be narrowed. Avoid unrelated checks and do not repeat successful
local checks without new changes, failures, or a specific investigation.

Leave expensive verification to CI by default: full coverage runs,
database-backed integration suites, production builds, E2E, and full Storybook
builds/tests. Run these locally only for a concrete investigation, a relevant
gap in CI coverage, or an explicit user request, using the smallest useful run.
Change size or perceived risk alone does not justify rerunning expensive suites.

After authorized changes are pushed, use CI results for the new revision.
Earlier green results do not validate later commits or uncommitted changes.
Pending, missing, skipped, cancelled, or inaccessible results are not passes.
Final merge readiness requires successful applicable CI checks for the final PR
revision and no unverified local fixes.

Report CI evidence with the revision and run/check links separately from local
commands and their results. A successful CI check is not missing evidence merely
because it was not repeated locally. Dependency installation, required code
generation, and intentional coverage-baseline updates remain appropriate when
needed to perform the work.

## Documentation Expectations

- Update relevant docs when introducing new behavior or conventions.
- Keep shared workspace docs in `docs/`.
- Keep app/package docs alongside code (for example,
  `apps/cashfolio-app2/docs/`).
