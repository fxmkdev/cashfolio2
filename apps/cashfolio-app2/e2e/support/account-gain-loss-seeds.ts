import { createId } from "@paralleldrive/cuid2";
import { prisma, assertSafeWriteTarget } from "./db-client";

export async function seedAccountGainLoss(
  accountBookId: string,
  cashAccountId: string,
  scenario: "default" | "opposite" = "default",
) {
  assertSafeWriteTarget();
  const root = await prisma.accountGroup.findFirstOrThrow({
    where: { accountBookId, type: "ASSET", parentGroupId: null },
  });
  const group = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "G/L Portfolio",
      type: "ASSET",
      parentGroupId: root.id,
    },
  });
  const nested = await prisma.accountGroup.create({
    data: {
      id: createId(),
      accountBookId,
      name: "G/L Holdings",
      type: "ASSET",
      parentGroupId: group.id,
    },
  });
  const source = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId,
      name: "G/L Archived Source",
      type: "ASSET",
      unit: "SECURITY",
      symbol: "AAPL",
      tradeCurrency: "CHF",
      groupId: nested.id,
    },
  });
  const destination = await prisma.account.create({
    data: {
      id: createId(),
      accountBookId,
      name: "G/L Active Holding",
      type: "ASSET",
      unit: "SECURITY",
      symbol: "AAPL",
      tradeCurrency: "CHF",
      groupId: nested.id,
    },
  });
  async function trade(
    description: string,
    date: string,
    quantity: number,
    cash: number,
    holdingAccountId?: string,
  ) {
    const transactionId = createId();
    await prisma.transaction.create({
      data: { id: transactionId, accountBookId, description },
    });
    await prisma.booking.createMany({
      data: [
        {
          id: createId(),
          description,
          accountBookId,
          transactionId,
          accountId:
            holdingAccountId ??
            (description === "Initial Purchase" ? source.id : destination.id),
          date: new Date(date),
          value: quantity,
          unit: "SECURITY",
          symbol: "AAPL",
          tradeCurrency: "CHF",
        },
        {
          id: createId(),
          description,
          accountBookId,
          transactionId,
          accountId: cashAccountId,
          date: new Date(date),
          value: cash,
          unit: "CURRENCY",
          currency: "CHF",
        },
      ],
    });
  }
  if (scenario === "opposite") {
    await trade("Initial Purchase", "2026-01-01Z", 2, -200);
    await trade("Open Short", "2026-01-02Z", -1, 150);
  } else {
    await trade("Initial Purchase", "2026-01-10Z", 3, -6);
  }
  const transactionId = createId();
  await prisma.transaction.create({
    data: { id: transactionId, accountBookId, description: "Transfer Holding" },
  });
  await prisma.booking.createMany({
    data: [
      {
        id: createId(),
        description: "Transfer Holding",
        accountBookId,
        transactionId,
        accountId: source.id,
        date: new Date(scenario === "opposite" ? "2026-01-03Z" : "2026-02-10Z"),
        value: -2,
        unit: "SECURITY",
        symbol: "AAPL",
        tradeCurrency: "CHF",
      },
      {
        id: createId(),
        description: "Transfer Holding",
        accountBookId,
        transactionId,
        accountId: destination.id,
        date: new Date(scenario === "opposite" ? "2026-01-04Z" : "2026-02-10Z"),
        value: 2,
        unit: "SECURITY",
        symbol: "AAPL",
        tradeCurrency: "CHF",
      },
    ],
  });
  if (scenario === "opposite") {
    await trade("Close Position", "2026-01-05Z", -1, 160);
  } else {
    await trade("Source Sale", "2026-02-20Z", -1, 8, source.id);
    await trade("Partial Sale", "2026-03-10Z", -1, 15);
  }
  await prisma.account.update({
    where: { id_accountBookId: { id: source.id, accountBookId } },
    data: { isActive: false },
  });
  return { source, destination };
}
