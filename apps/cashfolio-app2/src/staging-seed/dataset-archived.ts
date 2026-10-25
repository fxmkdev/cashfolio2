import Decimal from "decimal.js";
import {
  AccountType,
  AssetClass,
  EquityAccountSubtype,
} from "../.prisma-client/enums";
import { addUtcDays } from "../shared/date";
import {
  AAPL,
  MSFT,
  CHF,
  EUR,
  USD,
  addAccount,
  addGroup,
  opening,
  post,
  transfer,
  type SeedBook,
} from "./dataset-model";

/** Closed accounts retain their real institutions and their historical bookings. */
export function archivedHouseholdAccounts(target: SeedBook) {
  addGroup(target, "ubs", "UBS", AccountType.BALANCE, {
    parentKey: "cash",
    isCashAccount: true,
    isActive: false,
  });
  addGroup(
    target,
    "credit-suisse",
    "Credit Suisse portfolio",
    AccountType.BALANCE,
    { parentKey: "investments", isActive: false },
  );
  addGroup(target, "credit-suisse-equities", "Equities", AccountType.BALANCE, {
    parentKey: "credit-suisse",
    isActive: false,
  });
  addGroup(target, "consulting", "Consulting", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.INCOME,
    isActive: false,
  });
  addGroup(target, "car", "Car", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    isActive: false,
  });
  addGroup(target, "car-running", "Running costs", AccountType.EQUITY, {
    parentKey: "car",
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    isActive: false,
  });

  for (const [key, name, groupKey, unit] of [
    ["archived", "Closed bank account CHF", "zkb", CHF],
    ["closed-postfinance-eur", "Closed travel account EUR", "postfinance", EUR],
    ["closed-ubs-chf", "Savings account CHF", "ubs", CHF],
    ["closed-ubs-usd", "Savings account USD", "ubs", USD],
  ] as const) {
    addAccount(target, key, name, AccountType.BALANCE, {
      ...unit,
      groupKey,
      isActive: false,
      isCashAccount: true,
      assetClass: AssetClass.CASH_AND_CASH_EQUIVALENTS,
    });
  }
  for (const [key, name, groupKey, unit, assetClass] of [
    [
      "closed-aapl",
      "Closed Apple position",
      "securities",
      AAPL,
      AssetClass.EQUITIES,
    ],
    [
      "closed-cs-aapl",
      "Apple shares",
      "credit-suisse-equities",
      AAPL,
      AssetClass.EQUITIES,
    ],
    [
      "closed-cs-msft",
      "Microsoft shares",
      "credit-suisse-equities",
      MSFT,
      AssetClass.EQUITIES,
    ],
    [
      "closed-cs-usd",
      "Settlement account USD",
      "credit-suisse",
      USD,
      AssetClass.CASH_AND_CASH_EQUIVALENTS,
    ],
  ] as const) {
    addAccount(target, key, name, AccountType.BALANCE, {
      ...unit,
      groupKey,
      isActive: false,
      assetClass,
    });
  }
  addAccount(
    target,
    "closed-car-loan",
    "Repaid car loan CHF",
    AccountType.BALANCE,
    { ...CHF, isActive: false, assetClass: AssetClass.OTHER_ASSETS },
  );
  addAccount(target, "closed-project", "One-off project", AccountType.EQUITY, {
    groupKey: "consulting",
    equityAccountSubtype: EquityAccountSubtype.INCOME,
    isActive: false,
  });
  for (const [key, name, groupKey] of [
    ["closed-fuel", "Fuel", "car-running"],
    ["closed-car-insurance", "Vehicle insurance", "car-running"],
    ["closed-membership", "Sports club membership", "leisure"],
  ] as const) {
    addAccount(target, key, name, AccountType.EQUITY, {
      groupKey,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
      isActive: false,
    });
  }
}

export function archivedHouseholdTransactions(target: SeedBook) {
  const on = (offset: number) => addUtcDays(target.startDate, offset);
  for (const [key, amount] of [
    ["archived", "500"],
    ["closed-postfinance-eur", "600"],
    ["closed-ubs-chf", "1200"],
    ["closed-ubs-usd", "400"],
    ["closed-car-loan", "-2400"],
  ] as const)
    opening(target, key, amount);
  for (const [from, to, amount] of [
    ["archived", "current", "500"],
    ["closed-postfinance-eur", "eur", "600"],
    ["closed-ubs-chf", "current", "1200"],
    ["closed-ubs-usd", "usd", "400"],
  ] as const)
    transfer(
      target,
      on(30),
      `Close account: ${target.accounts.find((account) => account.key === from)!.name}`,
      from,
      to,
      amount,
    );

  transfer(
    target,
    on(45),
    "Fund Credit Suisse portfolio",
    "usd",
    "closed-cs-usd",
    "3500",
  );
  for (const [
    key,
    cashKey,
    quantity,
    buyPrice,
    sellPrice,
    buyOffset,
    sellOffset,
  ] of [
    ["closed-aapl", "usd", "2", "100", "120", 61, 121],
    ["closed-cs-aapl", "closed-cs-usd", "10", "150", "180", 60, 120],
    ["closed-cs-msft", "closed-cs-usd", "4", "400", "350", 60, 120],
  ] as const) {
    const name = target.accounts.find((account) => account.key === key)!.name;
    post(target, on(buyOffset), `Archived investment: buy ${name}`, [
      { accountKey: key, value: quantity },
      {
        accountKey: cashKey,
        value: new Decimal(quantity).times(buyPrice).negated(),
      },
    ]);
    post(target, on(sellOffset), `Archived investment: sell ${name}`, [
      { accountKey: key, value: new Decimal(quantity).negated() },
      { accountKey: cashKey, value: new Decimal(quantity).times(sellPrice) },
    ]);
  }
  transfer(
    target,
    on(150),
    "Close Credit Suisse settlement account",
    "closed-cs-usd",
    "usd",
    "3600",
  );
  transfer(
    target,
    on(180),
    "Final car loan repayment",
    "current",
    "closed-car-loan",
    "2400",
  );
  transfer(
    target,
    on(90),
    "Completed consulting project",
    "closed-project",
    "current",
    "1200",
  );
  transfer(
    target,
    on(100),
    "Fuel for former car",
    "current",
    "closed-fuel",
    "120",
  );
  transfer(
    target,
    on(110),
    "Insurance for former car",
    "current",
    "closed-car-insurance",
    "350",
  );
  transfer(
    target,
    on(115),
    "Final sports club membership",
    "current",
    "closed-membership",
    "180",
  );
}
