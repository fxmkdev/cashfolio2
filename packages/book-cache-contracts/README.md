# Book Cache Contracts

Private, dependency-free workspace package shared by `cashfolio-app2` and the
workspace CLI. Import named exports from `@cashfolio/book-cache-contracts`;
source, build, and manifest subpaths are private.

The package owns the six book-cache family constants, version-independent
cleanup patterns, and book-ownership checks. Add new shared families here so
restore and user-deletion cleanup stay aligned. The app owns payload versions,
key builders, Redis clients, and cache behavior; the CLI owns restore scanning
and deletion. Global valuation caches are outside this contract.

## Build and Checks

```bash
pnpm --filter @cashfolio/book-cache-contracts build
pnpm --filter @cashfolio/book-cache-contracts typecheck
pnpm --filter @cashfolio/book-cache-contracts test
pnpm --filter @cashfolio/book-cache-contracts format
```

The native TypeScript compiler emits ESM JavaScript and declarations into
ignored `dist/`. The package's typecheck covers both source and TypeScript
tests. Tests exercise the compiled public exports using Node 26, including an
isolated installation with TypeScript support disabled.

Consumer development, build, typecheck, and test scripts build the contracts
first. Rebuild after editing contracts during a running development session;
direct tool commands such as `pnpm exec vitest` also require a prior package
build. The app bundles the contracts into its deployment artifact, so production
does not require workspace sources or TypeScript tooling.
