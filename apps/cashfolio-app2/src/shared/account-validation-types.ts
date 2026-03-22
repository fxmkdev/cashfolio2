import type {
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";

export type AccountInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  groupId?: string;
  sortOrder?: number;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
};

export type AccountGroupInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  parentGroupId?: string;
  sortOrder?: number;
};
