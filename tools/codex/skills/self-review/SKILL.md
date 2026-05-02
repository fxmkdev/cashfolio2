---
name: self-review
description: Review the current pull request before merge with a strict quality gate. Use when asked to self-review this PR, run a pre-merge check, verify docs/test coverage/CI readiness, enforce repository coding guidelines and best practices, improve PR description quality, and split up large modules, components, and functions.
---

# Self Review

Perform a complete self-review for the current pull request and return a decision-ready report.

## Inputs

- Current Git branch and working tree state.
- Open pull request for the current branch (if available).
- Repository guidance from `AGENTS.md`, `CONTRIBUTING.md`, and relevant docs.

## Workflow

1. Discover PR context.
   - Detect current branch and repo root.
   - Find the open PR for the branch (`gh pr view` / `gh pr status`).
   - Capture PR title, description, changed files, review status, and CI check summary.
   - If no PR exists, continue in "branch-only review" mode and explicitly mark PR-only checks as missing evidence.

2. Validate docs freshness.
   - Compare code changes against docs changes.
   - Flag missing updates when behavior, APIs, workflows, commands, conventions, or operational expectations changed without corresponding docs updates.
   - Validate docs placement: shared docs in `docs/`; app-specific docs near app code.

3. Validate PR description quality.
   - Ensure the PR description clearly includes:
     - problem/context
     - what changed
     - test evidence and commands run
     - risks and mitigations
     - follow-ups or known limitations
   - If any section is weak or missing, provide an improved draft structure.

4. Perform code-quality review.
   - Apply repository conventions from `AGENTS.md` and `CONTRIBUTING.md`.
   - Check for correctness, maintainability, readability, naming clarity, cohesion, and avoidable complexity.
   - Prioritize actionable findings over style nitpicks.
   - Flag violated conventions explicitly (for example money arithmetic precision, route file naming conventions, generated-file edits, runtime typing policy, or missing doc updates).

5. Run tiered verification checks.
   - Fast pass (always):
     - `pnpm --filter cashfolio-app2 typecheck`
     - `pnpm --filter cashfolio-app2 test:unit`
     - `pnpm --filter cashfolio-app2 format`
   - Deep pass (when risk is higher, tested logic changed, or fast pass fails):
     - `pnpm --filter cashfolio-app2 test:unit:coverage:ratchet`
     - targeted broader checks as needed
     - suggest `pnpm --filter cashfolio-app2 e2e` when change risk is significant
   - Record exactly what ran, what did not run, and why.

6. Verify CI health.
   - Inspect GitHub checks for the PR head commit.
   - If checks fail, summarize failing jobs and likely root causes.
   - Provide concrete remediation steps and mark readiness as blocked until green.

7. Detect oversized units and suggest splits.
   - Flag candidates using default heuristics:
     - module/file over 400 LOC
     - component over 200 LOC
     - function over 60 LOC or obviously high branching complexity
   - Propose practical split boundaries (by responsibility, feature slice, or shared utility extraction).

8. Produce the required report format.
   - Always output these sections in this order:
     - `Blockers`
     - `High`
     - `Medium`
     - `Low`
     - `Checks Run`
     - `Missing Evidence`
     - `Ready/Not Ready`
   - Use concise bullets with file paths and rationale.
   - `Ready/Not Ready` must be explicit and binary.

## Output Rules

- Do not hide uncertainty. If a check could not be run, list it in `Missing Evidence`.
- Prefer direct, actionable recommendations over broad advice.
- Separate facts from assumptions.
- If no significant issues are found, still report residual risks and why the PR is ready.
