# Codex Skills (Repo-Managed)

This directory contains versioned Codex skills for this repository.

## Available Skills

- `self-review`: PR self-review quality gate for docs, PR description, code quality, tests/coverage, CI, and large-module splitting guidance.

## Invoke a Skill

In Codex, invoke with `$` mention syntax, for example:

- `$self-review self-review this PR before merge`
- `$self-review run a pre-merge quality gate with docs, coverage, and CI checks`

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
- `gh` authenticated for PR/CI metadata (`gh auth status`)
- `pnpm` for project checks
- network access for GitHub API-backed `gh` operations

Recommended checks used by the skill:

```bash
pnpm --filter cashfolio-app2 typecheck
pnpm --filter cashfolio-app2 test:unit
pnpm --filter cashfolio-app2 format
pnpm --filter cashfolio-app2 test:unit:coverage:ratchet
```
