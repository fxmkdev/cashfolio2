import type {
  AccountTrackingMethod,
  AssetClass,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { StatementImportCsvFormat } from "./statement-import-csv-format";

export type AccountInput = {
  trackingMethod?: AccountTrackingMethod;
  assetClass?: AssetClass | null;
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  groupId?: string | null;
  sortOrder?: number;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean;
  openingBalance?: number | null;
};

export type AccountGroupInput = {
  accountBookId: string;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  parentGroupId?: string | null;
  sortOrder?: number;
  isCashAccount?: boolean;
  isActive?: boolean;
};
