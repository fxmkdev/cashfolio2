---
name: self-review
description: Review and remediate the current pull request before merge with a strict quality gate. Use when asked to self-review this PR, run a pre-merge check, implement the most feasible findings, verify docs/test coverage/CI readiness, enforce repository coding guidelines and best practices, improve PR description quality, and split up large modules, components, and functions.
---

# Self Review

Perform a complete self-review for the current pull request, implement the most feasible fixes, and return a decision-ready report.

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

2. Collect review findings.
   - Validate docs freshness against code changes.
   - Validate PR description quality against required content:
     - problem/context
     - what changed
     - test evidence and commands run
     - risks and mitigations
     - follow-ups or known limitations
   - Perform code-quality review using `AGENTS.md` and `CONTRIBUTING.md` conventions.
   - Verify CI health for the PR head commit when available.
   - Detect oversized units and split candidates using default heuristics:
     - module/file over 400 LOC
     - component over 200 LOC
     - function over 60 LOC or obviously high branching complexity

3. Classify findings before changes.
   - Mark each finding as one of:
     - `auto-fixable now` (safe, localized, high-confidence change)
     - `bounded fix` (medium complexity but constrained scope, clear rollback path, and high confidence after focused verification)
     - `needs larger change` (architecture tradeoffs, broad refactor, risky scope, or unclear intent)
   - Prioritize applying `auto-fixable now` and `bounded fix` items across code, docs, tests, and config.

4. Run first-pass verification before changes.
   - First pass (baseline, pre-fix):
     - `pnpm --filter cashfolio-app2 typecheck`
     - `pnpm --filter cashfolio-app2 test:unit`
     - `pnpm --filter cashfolio-app2 format`

5. Implement feasible fixes.
   - Apply `auto-fixable now` items directly in-repo.
   - Apply `bounded fix` items when scope stays constrained and confidence remains high.
   - If PR description quality is weak and PR access exists, update the PR description directly with improved structure and concrete content.
   - For PR description updates, prefer `gh pr edit --body-file <path>` to avoid shell escaping/newline issues. If `gh pr edit` fails with `projectCards` deprecation GraphQL errors, use the REST fallback:
     `gh api -X PATCH repos/<owner>/<repo>/pulls/<number> -f body="$(cat <path>)"`.
   - Do not over-claim: leave `needs larger change` items unimplemented and keep them explicit in the final report.

6. Run second-pass verification after fixes.
   - Second pass (post-fix gate): rerun the same baseline checks after applied fixes.
   - Deep pass (when tested logic changed, risk is higher, or either pass fails):
     - `pnpm --filter cashfolio-app2 test:unit:coverage:ratchet`
     - targeted broader checks as needed
     - suggest `pnpm --filter cashfolio-app2 e2e` when change risk is significant
   - Record exactly what ran, what did not run, and why.

7. Re-evaluate readiness.
   - Mark `Ready` only when all blockers are cleared and required checks are green.
   - If any blocker remains (including CI failures, high-risk unimplemented findings, or missing critical evidence), mark `Not Ready` and provide concrete next steps.

8. Produce the required report format.
   - Always output these sections in this order:
     - `Blockers`
     - `High`
     - `Medium`
     - `Low`
     - `Applied Fixes`
     - `Remaining Findings (Not Implemented Yet)`
     - `Checks Run`
     - `Missing Evidence`
     - `Ready/Not Ready`
   - Use concise bullets with file paths and rationale.
   - `Ready/Not Ready` must be explicit and binary.

## Output Rules

- Do not hide uncertainty. If a check could not be run, list it in `Missing Evidence`.
- Separate facts from assumptions.
- Distinguish clearly between findings that were fixed and findings that remain.
- Prefer direct, actionable remediation over broad advice.
- If no significant issues are found, still report residual risks and why the PR is ready.
