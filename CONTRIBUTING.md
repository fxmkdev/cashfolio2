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

## Pull Request Description Workflow

- Prefer `gh pr create --body-file <path>` over `--body` to avoid shell
  escaping/newline formatting issues in PR descriptions.
- Prefer `gh pr edit --body-file <path>` for updates.
- If `gh pr edit` fails with a GraphQL error mentioning `projectCards`
  deprecation, update the body through REST:
  `gh api -X PATCH repos/<owner>/<repo>/pulls/<number> -f body="$(cat <path>)"`.

## PR Feedback Watch Automation

- When you submit a pull request, create or update a Codex heartbeat automation
  named `PR Feedback Watch` with a 5-minute interval.
- Use the Codex app for this repository's chat/automation workflow. If you do
  not have access yet, ask a maintainer for workspace onboarding details.
- Create/update this in the Codex app as a thread heartbeat automation attached
  to the PR conversation thread.
- The automation should watch this PR for new review comments, requested
  changes, and unresolved review threads, then alert with a concise summary and
  links.

## Scope Guidance

- Use app or area scope when helpful (`cashfolio-app2`, `cashfolio-app`,
  `infra`, `docs`, `cli`).
- Keep descriptions concise, imperative, and behavior-focused.

## Runtime and Typings Policy

- `tools/importer` is deprecated and no longer maintained. Avoid routine
  dependency/tooling upgrades there unless explicitly requested.
- `apps/cashfolio-app` is deprecated and no longer maintained. Avoid routine
  dependency/tooling upgrades there unless explicitly requested.
- Keep `@types/node` on the Node 24 line until runtime migration is scheduled.

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
