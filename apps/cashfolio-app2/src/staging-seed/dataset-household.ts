import Decimal from "decimal.js";
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
  addGroup(target, "assets", "Assets", AccountType.ASSET);
  addGroup(target, "cash", "Cash and bank accounts", AccountType.ASSET, {
    parentKey: "assets",
    isCashAccount: true,
  });
  addGroup(target, "investments", "Investments", AccountType.ASSET, {
    parentKey: "assets",
  });
  addGroup(target, "securities", "Shares", AccountType.ASSET, {
    parentKey: "investments",
  });
  addGroup(target, "crypto", "Cryptocurrencies", AccountType.ASSET, {
    parentKey: "investments",
  });
  addGroup(target, "liabilities", "Liabilities", AccountType.LIABILITY);
  addGroup(target, "income", "Income", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.INCOME,
  });
  addGroup(target, "expenses", "Expenses", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.EXPENSE,
  });
  for (const [key, name] of [
    ["housing", "Housing"],
    ["daily", "Daily living"],
    ["leisure", "Leisure and travel"],
  ]) {
    addGroup(target, key, name, AccountType.EQUITY, {
      parentKey: "expenses",
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    });
  }
  addGroup(target, "old-bank", "Former bank accounts", AccountType.ASSET, {
    isActive: false,
    isCashAccount: true,
  });
  for (const [key, name, unit] of [
    ["current", "Everyday account CHF", CHF],
    ["savings", "Emergency savings CHF", CHF],
    ["wallet", "Cash wallet CHF", CHF],
    ["eur", "Travel account EUR", EUR],
    ["usd", "Broker cash USD", USD],
    ["spare", "Holiday savings CHF", CHF],
  ] as const) {
    addAccount(target, key, name, AccountType.ASSET, {
      ...unit,
      groupKey: "cash",
      isCashAccount: true,
      ...(key === "current" ? { statementImportCsvFormat } : undefined),
    });
  }
  for (const [key, name, groupKey, unit] of [
    ["aapl", "Apple shares", "securities", AAPL],
    ["msft", "Microsoft shares", "securities", MSFT],
    ["btc", "Bitcoin wallet", "crypto", BTC],
    ["eth", "Ethereum wallet", "crypto", ETH],
    ["pension", "Pillar 3a savings", "investments", CHF],
  ] as const) {
    addAccount(target, key, name, AccountType.ASSET, { ...unit, groupKey });
  }
  for (const [key, name] of [
    ["card", "Credit card CHF"],
    ["loan", "Personal loan CHF"],
  ]) {
    addAccount(target, key, name, AccountType.LIABILITY, {
      ...CHF,
      groupKey: "liabilities",
    });
  }
  for (const [key, name] of [
    ["salary", "Salary"],
    ["interest", "Interest and dividends"],
    ["side-income", "Freelance income"],
  ]) {
    addAccount(target, key, name, AccountType.EQUITY, {
      ...(key === "interest" ? {} : CHF),
      groupKey: "income",
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
    ["tax", "Taxes", "expenses"],
    ["restaurants", "Cafes and restaurants", "leisure"],
    ["travel", "Travel", "leisure"],
    ["fees", "Bank and trading fees", "expenses"],
  ]) {
    addAccount(target, key, name, AccountType.EQUITY, {
      ...(key === "travel" ? {} : CHF),
      groupKey,
      equityAccountSubtype: EquityAccountSubtype.EXPENSE,
    });
  }
  addAccount(target, "opening", "Opening Balances", AccountType.EQUITY, {
    equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
  });
  addAccount(target, "archived", "Closed bank account CHF", AccountType.ASSET, {
    ...CHF,
    groupKey: "old-bank",
    isActive: false,
    isCashAccount: true,
  });
}

export function householdTransactions(target: SeedBook, today: Date) {
  for (const [key, value] of [
    ["current", "12000"],
    ["savings", "35000"],
    ["wallet", "350"],
    ["eur", "1800"],
    ["usd", "5000"],
    ["pension", "24000"],
    ["aapl", "25"],
    ["msft", "12"],
    ["btc", "0.18"],
    ["eth", "2.5"],
    ["loan", "-15000"],
    ["archived", "500"],
  ] as const) {
    opening(target, key, value);
  }
  transfer(
    target,
    addUtcDays(target.startDate, 30),
    "Close former bank account",
    "archived",
    "current",
    "500",
  );

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
    let month = new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1),
      ),
      index = 0;
    month <= today;
    month = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
    ),
      index++
  ) {
    const on = (day: number, action: (date: Date) => void) => {
      const date = new Date(
        Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day),
      );
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
  transfer(target, today, "Cash withdrawal", "current", "wallet", "100");
  transfer(
    target,
    today,
    "Market stall vegetables",
    "wallet",
    "groceries",
    "18.5",
  );
  transfer(
    target,
    today,
    "Currency rounding adjustment",
    "current",
    GAIN_LOSS_ACCOUNT_KEY,
    "0.05",
  );
}
