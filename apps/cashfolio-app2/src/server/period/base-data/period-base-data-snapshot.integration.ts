import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { PrismaClient } from "../../../.prisma-client/client";
import {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../../../.prisma-client/enums";
import * as cashFlow from "./period-base-data-cash-flow-transactions.server";
import type { PeriodBaseDataSnapshot } from "./period-base-data-loader.server";

const run = promisify(execFile);
// Match the mutation suite's safety boundary: only a disposable local database.
const adminUrl = new URL(
  process.env.MUTATION_TEST_ADMIN_DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:5433/postgres",
);
if (
  !["postgresql:", "postgres:"].includes(adminUrl.protocol) ||
  !["127.0.0.1", "localhost", "postgres"].includes(adminUrl.hostname) ||
  adminUrl.pathname !== "/postgres" ||
  [...adminUrl.searchParams.keys()].some((key) => key !== "schema")
) {
  throw new Error(
    "MUTATION_TEST_ADMIN_DATABASE_URL must target a local postgres maintenance database without routing options.",
  );
}
const databaseName = `period_snapshot_test_${randomUUID().replaceAll("-", "")}`;
const databaseUrl = new URL(adminUrl);
databaseUrl.pathname = `/${databaseName}`;
const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: adminUrl.href }),
});
const writer = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl.href }),
});
let databaseCreated = false;
let applicationDb: PrismaClient | undefined;
let loadSnapshot: (typeof import("./period-base-data-loader.server"))["loadPeriodBaseDataSnapshot"];
const bookId = "snapshot-book";
const day = new Date("2026-02-10T00:00:00Z");

function deposit(id: string, amount = 1) {
  return {
    id,
    accountBook: { connect: { id: bookId } },
    description: id,
    bookings: {
      create: [
        ["cash", amount],
        ["income", -amount],
      ].map(([accountId, value]) => ({
        id: `${id}-${accountId}`,
        accountBook: { connect: { id: bookId } },
        account: {
          connect: {
            id_accountBookId: { id: String(accountId), accountBookId: bookId },
          },
        },
        date: day,
        description: "",
        unit: Unit.CURRENCY,
        currency: "CHF",
        value: Number(value),
      })),
    },
  };
}

/** Pause after balances, or after the first cash-flow page, using the real tx. */
async function readDuringCommit(
  commit: () => Promise<unknown>,
  betweenPages = false,
): Promise<PeriodBaseDataSnapshot> {
  let started!: () => void;
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = cashFlow.loadPeriodCashFlowTransactionsRaw;
  const spy = vi
    .spyOn(cashFlow, "loadPeriodCashFlowTransactionsRaw")
    .mockImplementationOnce(async (args, db) => {
      if (!betweenPages) {
        started();
        await gate;
        return original(args, db);
      }
      let pages = 0;
      const findMany = (async (
        query: Parameters<typeof db.transaction.findMany>[0],
      ) => {
        const rows = await db.transaction.findMany(query);
        if (++pages === 1) {
          started();
          await gate;
        }
        return rows;
      }) as typeof db.transaction.findMany;
      return original(args, { transaction: { findMany } });
    });
  const reading = loadSnapshot({ accountBookId: bookId, period: "2026-02" });
  // Attach rejection handling immediately, including failures before the gate.
  const outcome = reading.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  try {
    await Promise.race([ready, reading]);
    await commit();
  } finally {
    release();
    await outcome;
    spy.mockRestore();
  }
  return reading;
}

function cashBalance(snapshot: PeriodBaseDataSnapshot) {
  return (
    snapshot.data.endOfPeriodRawBalances
      .find((row) => row.accountId === "cash")
      ?.rawBalance.toString() ?? "0"
  );
}

describe("period read consistency against disposable PostgreSQL", () => {
  beforeAll(async () => {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
    databaseCreated = true;
    await run("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href },
      maxBuffer: 4 * 1024 * 1024,
    });
    process.env.DATABASE_URL = databaseUrl.href;
    applicationDb = (await import("../../../prisma.server")).prisma;
    loadSnapshot = (await import("./period-base-data-loader.server"))
      .loadPeriodBaseDataSnapshot;
  });
  beforeEach(async () => {
    await writer.accountBook.deleteMany();
    await writer.accountBook.create({
      data: {
        id: bookId,
        name: "Snapshot Book",
        referenceCurrency: "CHF",
        startDate: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await writer.account.createMany({
      data: [
        {
          id: "cash",
          name: "Cash",
          accountBookId: bookId,
          type: AccountType.BALANCE,
          unit: Unit.CURRENCY,
          currency: "CHF",
          isCashAccount: true,
        },
        {
          id: "income",
          name: "Income",
          accountBookId: bookId,
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.INCOME,
        },
      ],
    });
  });
  afterAll(async () => {
    await Promise.all([writer.$disconnect(), applicationDb?.$disconnect()]);
    if (databaseCreated)
      await admin.$executeRawUnsafe(
        `DROP DATABASE "${databaseName}" WITH (FORCE)`,
      );
    await admin.$disconnect();
  });

  it("keeps pre-deposit balances and bookings together while a writer commits independently", async () => {
    const before = await writer.accountBook.findUniqueOrThrow({
      where: { id: bookId },
    });
    const snapshot = await readDuringCommit(() =>
      writer.transaction.create({ data: deposit("deposit", 100) }),
    );
    expect(snapshot.revision).toBe(before.periodCacheRevision);
    expect(cashBalance(snapshot)).toBe("0");
    expect(snapshot.data.cashFlowTransactions).toEqual([]);
    expect(snapshot.data.equityBookings).toEqual([]);
    expect(snapshot.data.executionResidualTransactions).toEqual([]);
    const next = await loadSnapshot({
      accountBookId: bookId,
      period: "2026-02",
    });
    expect(next.revision).not.toBe(snapshot.revision);
    expect(cashBalance(next)).toBe("100");
    expect(next.data.cashFlowTransactions.map((row) => row.id)).toEqual([
      "deposit",
    ]);
    expect(next.data.equityBookings[0].value.toString()).toBe("-100");
    expect(
      next.data.executionResidualTransactions.map((row) => row.id),
    ).toEqual(["deposit"]);
  });

  it("keeps settings and account classification from the same snapshot", async () => {
    const snapshot = await readDuringCommit(() =>
      writer.accountBook.update({
        where: { id: bookId },
        data: {
          referenceCurrency: "EUR",
          startDate: new Date("2026-01-15T00:00:00Z"),
        },
      }),
    );
    expect(snapshot.data.referenceCurrency).toBe("CHF");
    expect(snapshot.data.selection.minPeriodDate).toEqual(
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(snapshot.data.holdingAccountsResolved).toEqual([]);
    const next = await loadSnapshot({
      accountBookId: bookId,
      period: "2026-02",
    });
    expect(next.data.referenceCurrency).toBe("EUR");
    expect(next.data.selection.minPeriodDate).toEqual(
      new Date("2026-01-15T00:00:00Z"),
    );
    expect(next.data.holdingAccountsResolved.map((row) => row.id)).toEqual([
      "cash",
    ]);
    expect(next.revision).not.toBe(snapshot.revision);
  });

  it("retains deleted rows and excludes new rows when a mutation commits between pages", async () => {
    const ids = Array.from(
      { length: 201 },
      (_, i) => `deposit-${String(i).padStart(3, "0")}`,
    );
    await writer.$transaction(async (tx) => {
      await tx.transaction.createMany({
        data: ids.map((id) => ({ id, accountBookId: bookId, description: id })),
      });
      await tx.booking.createMany({
        data: ids.flatMap((id) => [
          {
            id: `${id}-cash`,
            accountBookId: bookId,
            transactionId: id,
            accountId: "cash",
            date: day,
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: 1,
          },
          {
            id: `${id}-income`,
            accountBookId: bookId,
            transactionId: id,
            accountId: "income",
            date: day,
            description: "",
            unit: Unit.CURRENCY,
            currency: "CHF",
            value: -1,
          },
        ]),
      });
    });
    const snapshot = await readDuringCommit(
      () =>
        writer.$transaction(async (tx) => {
          await tx.transaction.delete({
            where: {
              id_accountBookId: { id: "deposit-200", accountBookId: bookId },
            },
          });
          await tx.transaction.create({ data: deposit("deposit-new", 2) });
        }),
      true,
    );
    expect(cashBalance(snapshot)).toBe("201");
    expect(snapshot.data.cashFlowTransactions.map((row) => row.id)).toEqual(
      ids,
    );
    const next = await loadSnapshot({
      accountBookId: bookId,
      period: "2026-02",
    });
    expect(cashBalance(next)).toBe("202");
    expect(next.data.cashFlowTransactions.map((row) => row.id)).toEqual([
      ...ids.slice(0, 200),
      "deposit-new",
    ]);
  });
});
