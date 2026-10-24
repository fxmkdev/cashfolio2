# Codex Skills (Repo-Managed)

This directory contains versioned Codex skills for this repository.

## Available Skills

- `self-review`: PR self-review and remediation quality gate for docs, PR description, code quality, tests/coverage, CI, and large-module splitting guidance.

## Invoke a Skill

In Codex, invoke with `$` mention syntax, for example:

- `$self-review self-review this PR before merge`
- `$self-review run a pre-merge quality gate with docs, coverage, and CI checks`
- `$self-review self-review this PR and implement the feasible findings before final readiness`

## Install for Auto-Discovery

Codex auto-discovers local skills from `~/.codex/skills`. Keep the repo copy as source-of-truth, then symlink it locally:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
mkdir -p ~/.codex/skills
ln -sfn \
  "$REPO_ROOT/tools/codex/skills/self-review" \
  ~/.codex/skills/self-review
```

Alternative (copy instead of symlink):

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
mkdir -p ~/.codex/skills
rm -rf ~/.codex/skills/self-review
cp -R \
  "$REPO_ROOT/tools/codex/skills/self-review" \
  ~/.codex/skills/self-review
```

Restart Codex after first install (or when changes are not picked up).

## Expected Tooling and Permissions

The `self-review` skill expects:

- `git` and a valid repo checkout
- `gh` authenticated for PR/CI metadata and PR description updates (`gh auth status`)
- `pnpm` when needed for development or a justified local investigation
- network access for GitHub API-backed `gh` operations

## Verification Policy

When reviewing an existing revision, the skill reuses CI results instead of
repeating CI-covered checks locally, including inexpensive ones. Pending or
unavailable CI does not automatically trigger local replacements. Local checks
during review are reserved for concrete investigations, gaps in CI coverage, or
explicit user requests; inspect failure logs and artifacts first.

When implementing fixes, run relevant inexpensive local checks for fast feedback
before pushing, even when CI also covers them. Prefer focused unit tests,
typecheck, and lint/format checks scoped to the change where practical. Leave
expensive coverage, integration, production build, E2E, and full Storybook runs
to CI by default, using local runs only for a concrete investigation, a relevant
gap in CI coverage, or an explicit user request.

Earlier green results do not validate later changes. See
[the skill](self-review/SKILL.md) for readiness and evidence reporting, and
[Testing](../../../apps/cashfolio-app2/docs/testing.md) for development and
debugging commands.

When using a copied installation, sync the installed `SKILL.md` after updating
the repository source. An existing symlink continues to use its target checkout;
changes in another worktree do not update that target automatically.
