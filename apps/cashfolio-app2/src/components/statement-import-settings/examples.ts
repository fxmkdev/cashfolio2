// Samples change only the source data; loading one never changes settings or mappings.
export const SAMPLE_EXAMPLES = {
  signed: {
    label: "Signed Amounts",
    text: "Date,Amount,Payee,Details,Original Amount,Original Currency,Exchange Rate\n2026-11-01,-42.50,Corner Market,Groceries,,,\n2026-11-02,2500.00,Employer,Salary,,,\n2026-11-03,-18.75,Cafe,Lunch,-20.00,EUR,0.9375",
  },
  debitCredit: {
    label: "Debit/Credit",
    text: "Date;Debit;Credit;Payee;Details\n01.11.2026;2500,00;;Employer;Salary\n02.11.2026;;42,50;Corner Market;Groceries",
  },
  headerless: {
    label: "Without Headers",
    text: "2026-11-01,-42.50,Corner Market,Groceries\n2026-11-02,2500.00,Employer,Salary",
  },
  invalid: {
    label: "Invalid Values",
    text: "Date,Amount,Payee,Details\n2026-02-30,-42.50,Corner Market,Invalid day\n2026-11-02,not-a-number,Cafe,Invalid amount",
  },
} as const;
export type ExampleKey = keyof typeof SAMPLE_EXAMPLES;
