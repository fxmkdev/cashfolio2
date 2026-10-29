# Cashfolio Monorepo

This repository contains multiple Cashfolio applications and shared tooling.

## Runtime

Use Node 26 and pnpm 12 for local development. The repository includes
`.node-version` and `.nvmrc` files for version managers, and the root package
manifest pins the exact pnpm version.

## Documentation

- Contribution guidelines: [CONTRIBUTING.md](CONTRIBUTING.md)
- Shared workspace docs: `docs/`
  - [Cashfolio domain diagram](docs/cashfolio.excalidraw)
  - [Preview environments](docs/preview-environments.md)
- App/package docs live alongside code:
  - `apps/cashfolio-app2/docs/`
    - [Overview](apps/cashfolio-app2/docs/README.md)
    - [Routing and server functions](apps/cashfolio-app2/docs/routing.md)
    - [Database and Prisma](apps/cashfolio-app2/docs/database.md)
    - [UI patterns](apps/cashfolio-app2/docs/ui-patterns.md)

## Common Commands

```bash
pnpm --filter cashfolio-app2 dev
pnpm --filter cashfolio-app2 build
pnpm --filter cashfolio-app2 typecheck
pnpm --filter cashfolio-app2 format
```

## Restore a Local Database

Run `pnpm cashfolio restore-local` from the repository root with
`RESTORE_DB_URL`, `RESTORE_DB_NAME`, and `RESTORE_REDIS_URL` configured in the
environment or `tools/cli/.env`. The command restores `tools/cli/backup.dump`
and then clears book-scoped caches from the Redis instance selected by
`RESTORE_REDIS_URL`. Use a dedicated local restore Redis instance: cleanup
covers all books and environment namespaces on that instance. It removes legacy
`account-book:*` keys and all versions of period base entries/indexes,
generation pointers, and History metrics; global `valuation:*` caches and
unrelated keys are retained.

The Redis URL is required before database restoration begins. Cleanup uses
incremental scans and bounded deletion batches, reports the number of keys
actually deleted, and closes its connection on success or failure. A Redis
failure makes the command fail even though the database may already have been
restored. Automatic reconnection is disabled, with a 5-second socket connection
timeout, so connection or authentication failures terminate the command instead
of retrying indefinitely. Resolve the Redis issue before explicitly retrying.
