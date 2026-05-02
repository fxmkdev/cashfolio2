# Cashfolio Monorepo

This repository contains multiple Cashfolio applications and shared tooling.

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
