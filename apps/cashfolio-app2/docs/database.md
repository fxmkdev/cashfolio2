# Database & Prisma

- **Prisma 7** with PostgreSQL, schema at `prisma/schema.prisma`
- Generated client output: `src/.prisma-client/`
- Prisma client singleton in `src/prisma.server.ts` — uses `PrismaPg` adapter for connection pooling; stores in `global.__db__` in development to avoid connection exhaustion during hot reload
- Custom Prisma configuration in `prisma.config.ts` at project root

## Models

**Core accounting models** (all use composite keys — see below):

- `AccountBook` — top-level container; holds references to gain/loss account groups (`securityHoldingGainLossAccountGroupId`, `cryptoHoldingGainLossAccountGroupId`, `fxHoldingGainLossAccountGroupId`)
- `AccountGroup` — hierarchical via self-referencing `parentGroupId`; has `type`, `equityAccountSubtype`, `sortOrder`
- `Account` — belongs to a group; has `type`, `equityAccountSubtype`, `unit`, `currency`, `cryptocurrency`, `symbol`, `tradeCurrency`, `sortOrder`
- `Transaction` — has `description`; contains one or more `Booking` rows
- `Booking` — has `date`, `description`, `value` (Decimal), `unit`, `currency`, `cryptocurrency`, `symbol`, `tradeCurrency`; links to both `Account` and `Transaction`

**Auth / multi-tenancy models:**

- `User` — identified by `externalId`; has `viewPreferences` JSON and `accountBookLinks`
- `UserAccountBookLink` — composite key `(userId, accountBookId)`; grants a user access to an account book

## Enums

- `AccountType`: `ASSET`, `LIABILITY`, `EQUITY`
- `EquityAccountSubtype`: `INCOME`, `EXPENSE`, `GAIN_LOSS`
- `Unit`: `CURRENCY`, `CRYPTOCURRENCY`, `SECURITY`
- `UserRole`: `ADMIN`

## Composite Key Pattern

All main models use `id_accountBookId` composite keys for queries:

```ts
where: { id_accountBookId: { id, accountBookId } }
```

This ensures data isolation per account book. Foreign keys also carry `accountBookId` (e.g. `groupId` + `accountBookId`) to enable this at the database level.
