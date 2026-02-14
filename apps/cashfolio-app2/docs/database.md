# Database & Prisma

- **Prisma 7** with PostgreSQL, schema at `prisma/schema.prisma`
- Generated client output: `src/.prisma-client/`
- Prisma client singleton in `src/prisma.server.ts` — uses a global `__db__` in development to avoid connection exhaustion during hot reload
- Custom Prisma configuration in `prisma.config.ts` at project root
- Key models: AccountBook, AccountGroup (hierarchical with `parentGroupId`), Account, Transaction, Booking
- Enums: `AccountType` (ASSET, LIABILITY, EQUITY), `EquityAccountSubtype` (INCOME, EXPENSE, GAIN_LOSS), `Unit` (CURRENCY, CRYPTOCURRENCY, SECURITY)

## Composite Key Pattern

All main models use `id_accountBookId` composite keys for queries:

```ts
where: { id_accountBookId: { id, accountBookId } }
```

This ensures data isolation per account book.
