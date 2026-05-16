export type AccountBookRow = {
  id: string;
  name: string;
  referenceCurrency: string;
  startDate: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountGroupRow = {
  id: string;
  name: string;
  type: string;
  equityAccountSubtype: string | null;
  isActive: boolean;
  sortOrder: number | null;
  parentGroupId: string | null;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type AccountRow = {
  id: string;
  name: string;
  type: string;
  equityAccountSubtype: string | null;
  isActive: boolean;
  sortOrder: number | null;
  groupId: string | null;
  unit: string | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TransactionRow = {
  id: string;
  description: string;
  accountBookId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type BookingRow = {
  id: string;
  date: Date;
  description: string;
  transactionId: string;
  accountId: string;
  unit: string;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  value: string;
  sortOrder: number;
  accountBookId: string;
};

export type AccountBookData = {
  accountBook: AccountBookRow;
  accountGroups: AccountGroupRow[];
  accounts: AccountRow[];
  transactions: TransactionRow[];
  bookings: BookingRow[];
};

export type RowCounts = {
  accountBooks: number;
  accountGroups: number;
  accounts: number;
  transactions: number;
  bookings: number;
  userAccountBookLinks: number;
};
