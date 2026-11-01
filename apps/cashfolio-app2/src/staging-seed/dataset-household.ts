import { defaultAssetClassIds } from "../shared/asset-class";
import { fromUtcPlainDate, toUtcPlainDate } from "../shared/temporal-adapters";
import {
  archivedHouseholdAccounts,
  archivedHouseholdTransactions,
} from "./dataset-archived";
import Decimal from "decimal.js";
import { earliestDate } from "../shared/date";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { addUtcDays } from "../shared/date";
import {
  AAPL,
  BTC,
  CHF,
  ETH,
  EUR,
  GAIN_LOSS_ACCOUNT_KEY,
  MSFT,
  USD,
  addAccount,
  addGroup,
  opening,
  post,
  statementImportCsvFormat,
  transfer,
  type SeedBook,
} from "./dataset-model";

export function householdAccounts(target: SeedBook) {
  addGroup(target, "cash", "Cash", AccountType.BALANCE, {
    isCashAccount: true,
  });
  for (const [key, name] of [
    ["zkb", "Zürcher Kantonalbank"],
    ["postfinance", "PostFinance"],
    ["swissquote", "Swissquote"],
  ]) {
    addGroup(target, key, name, AccountType.BALANCE, {
      parentKey: "cash",
      isCashAccount: true,
    });
  }
  addGroup(target, "investments", "Investments", AccountType.BALANCE);
  addGroup(target, "securities", "Shares", AccountType.BALANCE, {
    parentKey: "investments",
  });
  addGroup(target, "crypto", "Cryptocurrencies", AccountType.BALANCE, {
    parentKey: "investments",
  });
  for (const [key, name] of [
    ["housing", "Housing"],
    ["daily", "Daily living"],
    ["leisure", "Leisure and travel"],
  ]) {
    addGroup(target, key, name, AccountType.EQUITY, {
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    });
  }
  for (const [key, name, groupKey, unit] of [
    ["current", "Everyday account CHF", "zkb", CHF],
    ["savings", "Emergency savings CHF", "zkb", CHF],
    ["wallet", "Cash wallet CHF", "cash", CHF],
    ["eur", "Travel account EUR", "postfinance", EUR],
    ["usd", "Broker cash USD", "swissquote", USD],
    ["usd-savings", "USD Savings Account", "zkb", USD],
    ["spare", "Holiday savings CHF", "postfinance", CHF],
  ] as const) {
    addAccount(target, key, name, AccountType.BALANCE, {
      ...unit,
      groupKey,
      isCashAccount: true,
      assetClassId:
        key === "wallet"
          ? defaultAssetClassIds.PHYSICAL_CASH
          : defaultAssetClassIds.BANK_DEPOSITS,
      ...(key === "current" ? { statementImportCsvFormat } : undefined),
    });
  }
  for (const [key, name, groupKey, unit, assetClassId] of [
    [
      "aapl",
      "Apple shares",
      "securities",
      AAPL,
      defaultAssetClassIds.LISTED_EQUITIES,
    ],
    [
      "msft",
      "Microsoft shares",
      "securities",
      MSFT,
      defaultAssetClassIds.LISTED_EQUITIES,
    ],
    [
      "btc",
      "Bitcoin wallet",
      "crypto",
      BTC,
      defaultAssetClassIds.CRYPTOCURRENCIES,
    ],
    [
      "btc-transfer-source",
      "Bitcoin transfer source",
      "crypto",
      BTC,
      defaultAssetClassIds.CRYPTOCURRENCIES,
    ],
    [
      "btc-transfer-destination",
      "Bitcoin transfer destination",
      "crypto",
      BTC,
      defaultAssetClassIds.CRYPTOCURRENCIES,
    ],
    [
      "eth",
      "Ethereum wallet",
      "crypto",
      ETH,
      defaultAssetClassIds.CRYPTOCURRENCIES,
    ],
    [
      "pension",
      "Pillar 3a savings",
      "investments",
      CHF,
      defaultAssetClassIds.BANK_DEPOSITS,
    ],
  ] as const) {
    addAccount(target, key, name, AccountType.BALANCE, {
      ...unit,
      groupKey,
      assetClassId,
    });
  }
  addAccount(
    target,
    "managed-portfolio",
    "Managed Portfolio CHF",
    AccountType.BALANCE,
    {
      ...CHF,
      groupKey: "investments",
      assetClassId: defaultAssetClassIds.MULTI_ASSET_INVESTMENTS,
      trackingMethod: "TOTAL_PORTFOLIO_VALUE",
    },
  );
  for (const [key, name] of [
    ["card", "Credit card CHF"],
    ["loan", "Personal loan CHF"],
  ]) {
    addAccount(target, key, name, AccountType.BALANCE, {
      ...CHF,
    });
  }
  for (const [key, name] of [
    ["salary", "Salary"],
    ["interest", "Interest and dividends"],
    ["side-income", "Freelance income"],
  ]) {
    addAccount(target, key, name, AccountType.EQUITY, {
      equityAccountSubtype: EquityAccountSubtype.INCOME,
    });
  }
  for (const [key, name, groupKey] of [
    ["rent", "Rent", "housing"],
    ["utilities", "Utilities and internet", "housing"],
    ["insurance", "Health insurance", "daily"],
    ["groceries", "Groceries", "daily"],
    ["household", "Household supplies", "daily"],
    ["transport", "Public transport", "daily"],
    ["tax", "Taxes", undefined],
    ["restaurants", "Cafes and restaurants", "leisure"],
    ["travel", "Travel", "leisure"],
    ["fees", "Bank and trading fees", undefined],
  ] as const) {
    addAccount(target, key, name, AccountType.EQUITY, {
      groupKey,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    });
  }
  addAccount(
    target,
    "btc-transfer-fees",
    "Bitcoin transfer fees",
    AccountType.EQUITY,
    {
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    },
  );
  addAccount(target, "opening", "Opening Balances", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
  });
  archivedHouseholdAccounts(target);
}

export function householdTransactions(target: SeedBook, today: Date) {
  for (const [key, value] of [
    ["current", "12000"],
    ["savings", "35000"],
    ["wallet", "350"],
    ["eur", "1800"],
    ["usd", "5000"],
    ["usd-savings", "1250"],
    ["pension", "24000"],
    ["managed-portfolio", "50000"],
    ["aapl", "25"],
    ["msft", "12"],
    ["btc", "0.18"],
    ["eth", "2.5"],
    ["loan", "-15000"],
  ] as const) {
    opening(target, key, value);
  }
  archivedHouseholdTransactions(target);

  for (
    let date = target.startDate, index = 0;
    date <= today;
    date = addUtcDays(date, 1), index++
  ) {
    const amount = new Decimal("4.2").plus(
      new Decimal(index % 7).times("0.35"),
    );
    transfer(
      target,
      date,
      "Morning coffee at the station",
      "current",
      "restaurants",
      amount,
    );
    if (index % 3 === 0) {
      transfer(
        target,
        date,
        "Coop groceries",
        "current",
        "groceries",
        new Decimal("48.5").plus(new Decimal(index % 19).times("2.15")),
      );
    }
    if (index % 14 === 0) {
      post(target, date, "Migros groceries and household supplies", [
        { accountKey: "card", value: "-110.8" },
        {
          accountKey: "groceries",
          value: "84.3",
          description: "Food and fresh produce",
        },
        {
          accountKey: "household",
          value: "26.5",
          description: "Cleaning supplies",
        },
      ]);
    }
  }

  const first = target.startDate;
  for (
    let month = fromUtcPlainDate(toUtcPlainDate(first).with({ day: 1 })),
      index = 0;
    month <= today;
    month = fromUtcPlainDate(toUtcPlainDate(month).add({ months: 1 })), index++
  ) {
    const on = (day: number, action: (date: Date) => void) => {
      const date = fromUtcPlainDate(toUtcPlainDate(month).with({ day }));
      if (date >= first && date <= today) action(date);
    };
    on(25, (date) =>
      transfer(target, date, "Monthly salary", "salary", "current", "6800"),
    );
    on(1, (date) =>
      transfer(
        target,
        date,
        "Apartment rent Zurich",
        "current",
        "rent",
        "2100",
      ),
    );
    on(3, (date) =>
      transfer(
        target,
        date,
        "Health insurance premium",
        "current",
        "insurance",
        "380",
      ),
    );
    on(5, (date) =>
      transfer(
        target,
        date,
        "Electricity and internet",
        "current",
        "utilities",
        "179",
      ),
    );
    on(5, (date) =>
      transfer(
        target,
        date,
        "Managed portfolio: contribution",
        "current",
        "managed-portfolio",
        "250",
      ),
    );
    if (month.getUTCMonth() === 5) {
      on(20, (date) =>
        transfer(
          target,
          date,
          "Managed portfolio: withdrawal",
          "managed-portfolio",
          "current",
          "1000",
        ),
      );
    }
    // Statement value changes after cash flows, rather than automatic holding prices.
    const valuationDate = earliestDate([
      today,
      fromUtcPlainDate(
        toUtcPlainDate(month).add({ months: 1 }).subtract({ days: 1 }),
      ),
    ]);
    const adjustment = ["600", "-350", "450", "250", "-200", "500"][index % 6]!;
    transfer(
      target,
      valuationDate,
      "Managed portfolio: statement valuation",
      GAIN_LOSS_ACCOUNT_KEY,
      "managed-portfolio",
      adjustment,
    );
    on(6, (date) =>
      post(target, date, "USD savings: monthly currency exchange", [
        { accountKey: "current", value: "-90" },
        { accountKey: "usd-savings", value: "100" },
      ]),
    );
    on(6, (date) =>
      transfer(
        target,
        date,
        "ZVV monthly travelcard",
        "current",
        "transport",
        "89",
      ),
    );
    on(8, (date) =>
      transfer(target, date, "Tax savings instalment", "current", "tax", "450"),
    );
    on(12, (date) =>
      transfer(
        target,
        date,
        "Personal loan repayment",
        "current",
        "loan",
        "250",
      ),
    );
    on(26, (date) =>
      transfer(
        target,
        date,
        "Emergency fund contribution",
        "current",
        "savings",
        "1000",
      ),
    );
    on(27, (date) =>
      transfer(
        target,
        date,
        "Pillar 3a contribution",
        "current",
        "pension",
        "250",
      ),
    );
    on(28, (date) => {
      const cardBalance = Decimal.sum(
        0,
        ...target.transactions.flatMap((transaction) =>
          transaction.bookings
            .filter(
              (booking) =>
                booking.accountKey === "card" && booking.date <= date,
            )
            .map((booking) => booking.value),
        ),
      );
      transfer(
        target,
        date,
        "Credit card statement payment",
        "current",
        "card",
        cardBalance.negated(),
      );
    });
    on(15, (date) => {
      const price = new Decimal(130).plus(new Decimal(index).times("2.5"));
      post(target, date, "Apple share purchase", [
        { accountKey: "aapl", value: "2" },
        { accountKey: "usd", value: price.times(2).negated() },
      ]);
      post(target, date, "Broker currency exchange CHF to USD", [
        { accountKey: "current", value: "-540" },
        { accountKey: "usd", value: "600" },
      ]);
      post(target, date, "Bitcoin savings purchase", [
        {
          accountKey: "current",
          value: new Decimal(35000)
            .plus(new Decimal(index).times(1000))
            .times("0.003")
            .negated(),
        },
        { accountKey: "btc", value: "0.003" },
      ]);
    });
    if (index % 3 === 0) {
      on(18, (date) =>
        post(target, date, "Quarterly share dividend", [
          { accountKey: "usd", value: "32.5" },
          { accountKey: "interest", value: "-32.5", metadata: USD },
        ]),
      );
      on(20, (date) =>
        post(target, date, "Partial sale of Apple shares", [
          { accountKey: "aapl", value: "-1" },
          {
            accountKey: "usd",
            value: new Decimal(145).plus(new Decimal(index).times("2.6")),
          },
        ]),
      );
    }
    if (month.getUTCMonth() === 6) {
      on(10, (date) =>
        post(target, date, "Summer holiday hotel in Italy", [
          { accountKey: "eur", value: "-680" },
          { accountKey: "travel", value: "680", metadata: EUR },
        ]),
      );
      on(9, (date) =>
        post(target, date, "Travel money exchange CHF to EUR", [
          { accountKey: "current", value: "-760" },
          { accountKey: "eur", value: "800" },
        ]),
      );
    }
    if (month.getUTCMonth() === 11) {
      on(20, (date) =>
        transfer(
          target,
          date,
          "Annual freelance project",
          "side-income",
          "current",
          "1200",
        ),
      );
      on(31, (date) =>
        transfer(
          target,
          date,
          "Savings interest",
          "interest",
          "savings",
          "145.25",
        ),
      );
    }
  }

  post(target, addUtcDays(today, -21), "Bitcoin transfer demo: purchase", [
    { accountKey: "btc-transfer-source", value: "0.01" },
    { accountKey: "current", value: "-1000" },
  ]);
  post(
    target,
    addUtcDays(today, -14),
    "Bitcoin transfer demo: transfer with network fee",
    [
      { accountKey: "btc-transfer-source", value: "-0.01" },
      { accountKey: "btc-transfer-destination", value: "0.0099" },
      { accountKey: "btc-transfer-fees", value: "0.0001", metadata: BTC },
    ],
  );
  post(target, addUtcDays(today, -7), "Bitcoin transfer demo: partial sale", [
    { accountKey: "btc-transfer-destination", value: "-0.004" },
    { accountKey: "current", value: "600" },
  ]);

  transfer(
    target,
    addUtcDays(today, -9),
    "Returned household purchase",
    "household",
    "current",
    "39.9",
  );
  post(target, addUtcDays(today, -7), "Ethereum purchase", [
    { accountKey: "current", value: "-650" },
    { accountKey: "eth", value: "0.2" },
  ]);
  post(target, addUtcDays(today, -2), "Partial Ethereum sale", [
    { accountKey: "eth", value: "-0.1" },
    { accountKey: "current", value: "340" },
  ]);
  post(target, today, "Microsoft partial sale", [
    { accountKey: "msft", value: "-1" },
    { accountKey: "usd", value: "420" },
  ]);
  // Reports stop at yesterday in UTC; allow for Zurich already being a day ahead.
  post(
    target,
    addUtcDays(today, -2),
    "Grouping demo: EUR card purchase settled in CHF",
    [
      { accountKey: "current", value: "-105" },
      { accountKey: "travel", value: "100", metadata: EUR },
    ],
  );
  transfer(target, today, "Cash withdrawal", "current", "wallet", "100");
  transfer(
    target,
    today,
    "Market stall vegetables",
    "wallet",
    "groceries",
    "18.5",
  );
}
