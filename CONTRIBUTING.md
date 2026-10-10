# Contributing

This workspace uses squash merges to `main`. The squash commit message comes
from the pull request title, so PR title quality matters.

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

- Use Node 24 for local development, CI, and application runtime.
- Keep `@types/node` aligned with Node 24. Do not upgrade to Node 25+ typings
  until the runtime migration is planned.

## Package Manager

Use the pnpm 12 version pinned by `packageManager` and `engines`. Keep Docker's
pnpm pin aligned. Dependency updates retain a minimum release age of 1440
minutes; do not add broad exceptions or relax the build-script allowlist.
Run `pnpm install --frozen-lockfile` to verify the committed dependency graph.

## Compiler Tooling

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

## Documentation Expectations

- Update relevant docs when introducing new behavior or conventions.
- Keep shared workspace docs in `docs/`.
- Keep app/package docs alongside code (for example,
  `apps/cashfolio-app2/docs/`).
