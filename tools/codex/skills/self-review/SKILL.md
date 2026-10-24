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
     - CI evidence for the current PR revision and any local commands run
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

4. Use CI as baseline verification.
   - Inspect the workflows and CI results for the current PR revision to establish which relevant checks CI covers. Accept successful results as verification; do not repeat those checks locally.
   - Defer CI-covered checks to CI, including when results are pending, missing, skipped, cancelled, or inaccessible. Report those states accurately rather than treating them as passes or automatically falling back to local execution. The same policy applies in branch-only mode.
   - Run local checks only for a concrete investigation, a relevant check CI does not cover, or an explicit user request. For failing CI, inspect logs and artifacts first, then use the smallest useful reproduction if needed.
   - Avoid duplicate full unit suites, coverage runs, production builds, E2E, and Storybook builds/tests. Change size or perceived risk alone does not justify local verification.
   - Dependency installation and code generation needed to perform the work remain appropriate; do not run them solely to repeat CI verification.

5. Implement feasible fixes.
   - Apply `auto-fixable now` items directly in-repo.
   - Apply `bounded fix` items when scope stays constrained and confidence remains high.
   - If PR description quality is weak and PR access exists, update the PR description directly with improved structure and concrete content.
   - For PR description updates, prefer `gh pr edit --body-file <path>` to avoid shell escaping/newline issues. If `gh pr edit` fails with `projectCards` deprecation GraphQL errors, use the REST fallback:
     `gh api -X PATCH repos/<owner>/<repo>/pulls/<number> -f body="$(cat <path>)"`.
   - Do not over-claim: leave `needs larger change` items unimplemented and keep them explicit in the final report.

6. Verify the updated revision through CI.
   - After authorized fixes are pushed, inspect CI for the new PR revision. Earlier green results do not validate later commits or uncommitted changes.
   - Do not automatically rerun baseline or broader checks locally after fixes. Apply the same limited local-check exceptions as in step 4; pending CI remains pending.
   - Record CI results with the revision and run/check links separately from any local commands, their results, and the reason for running them.

7. Re-evaluate readiness.
   - Mark `Ready` only when all blockers are cleared and applicable required CI checks are successful for the final PR revision, with no unverified local fixes remaining.
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

- In `Checks Run`, distinguish CI evidence from local execution. Successful CI coverage is sufficient evidence; not repeating a check locally is not `Missing Evidence`.
- In `Missing Evidence`, identify applicable checks without successful results for the final revision, including pending, missing, skipped, cancelled, or inaccessible CI. State what remains to be verified without automatically running local replacements.
- Separate facts from assumptions.
- Distinguish clearly between findings that were fixed and findings that remain.
- Prefer direct, actionable remediation over broad advice.
- If no significant issues are found, still report residual risks and why the PR is ready.
