# Contributing

This workspace uses squash merges to `main`. The squash commit message comes
from the pull request title, so PR title quality matters.

## Pull Request Title Convention

All pull request titles must follow Conventional Commits:

`<type>(optional-scope): <description>`

Examples:

- `feat(cashfolio-app2): add archived-account filters`
- `fix(cashfolio-app): prevent duplicate booking IDs`
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

## Scope Guidance

- Use app or area scope when helpful (`cashfolio-app2`, `cashfolio-app`,
  `infra`, `docs`, `cli`).
- Keep descriptions concise, imperative, and behavior-focused.

## Documentation Expectations

- Update relevant docs when introducing new behavior or conventions.
- Keep shared workspace docs in `docs/`.
- Keep app/package docs alongside code (for example,
  `apps/cashfolio-app2/docs/`).
