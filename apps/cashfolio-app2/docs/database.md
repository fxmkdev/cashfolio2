# Database & Prisma

- **Prisma 7** with PostgreSQL, schema at `prisma/schema.prisma`
- Generated client output: `src/.prisma-client/`
- Prisma client singleton in `src/prisma.server.ts`
- Key models: AccountBook, AccountGroup (hierarchical with `parentGroupId`), Account, Transaction, Booking
- Enums: `AccountType` (ASSET, LIABILITY, EQUITY), `EquityAccountSubtype` (INCOME, EXPENSE, GAIN_LOSS), `Unit` (CURRENCY, CRYPTOCURRENCY, SECURITY)
