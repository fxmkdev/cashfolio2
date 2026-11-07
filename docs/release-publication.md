# Release publication

The Build workflow calculates a version before building and deploying its image.
Publication happens later, within the existing `release` concurrency group. Two
overlapping runs can initially select the same version, so that early result is
revalidated inside the lock before publication.

The release job checks out the immutable workflow commit. Its inline Bash step
validates it against the original version job's SHA, fetches tags without
forcing updates, and runs the pinned releaser's `get-version` again. Manual
`force_release` passes `--release` on both calculations; otherwise the
releaser's `!release` commit-body semantics determine release eligibility. PR
builds retain their existing version and preview behavior and cannot publish.

Publication proceeds only when the refreshed metadata still requests a new
stable release matching the version already embedded in the deployed image, and
that version's tag is available. If another run has consumed the release
request, occupied the tag, or changed the computed version, publication skips
successfully with a workflow notice. It never renumbers an already-built image.
Start a fresh workflow run, using `force_release` if needed, to build and
publish a new version.

`@fxmk/releaser@0.5.7` calculates versions from local Git history and tags. Its
`publish <version>` command creates and pushes a tag at `HEAD`, then creates the
GitHub release; it has no commit-selection option. Existing tags are never
deleted or retargeted. Conflicting fetched tags and genuine command failures
fail the job. A tag left behind by failed GitHub release creation is not
automatically repaired. Publishers outside the shared concurrency group remain
outside the lock's protection.

Run `pnpm --filter cli exec node --test scripts/publish-release.test.ts`,
`pnpm --filter cli typecheck`, and `pnpm lint:workflows` with Node 26. The
TypeScript regression tests extract and execute the workflow's actual Bash step
using temporary Git repositories and the pinned releaser CLI for version
calculation. A test-only TypeScript command adapter intercepts final publication
to avoid external writes. The tests and their typecheck run in the existing CLI
CI jobs; workflow lint remains in the workflow-lint job. No additional tooling
dependencies are required.
