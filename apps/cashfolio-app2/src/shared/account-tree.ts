import type {
  AccountTrackingMethod,
  AccountType,
  EquityAccountSubtype,
  Unit,
} from "../.prisma-client/enums";
import type { StatementImportCsvFormat } from "./statement-import-csv-format";

export type AccountTreeRow = {
  trackingMethod?: AccountTrackingMethod;
  assetClassId?: string | null;

  isVirtualArchivedGroup?: boolean;
  persistedParentId?: string | null;
  id: string;
  nodeType: "account" | "accountGroup";
  name: string;
  type: AccountType;
  equityAccountSubtype: EquityAccountSubtype | null;
  unit: Unit | null;
  currency: string | null;
  cryptocurrency: string | null;
  symbol: string | null;
  tradeCurrency: string | null;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean;
  balance: number | null;
  balanceInReferenceCurrency: number | null;
  openingBalance: number | null;
  parentId: string | undefined;
  isActive: boolean;
  groupId: string | undefined;
  sortOrder: number | null;
  deletable: boolean;
  deleteDisabledReason: string | undefined;
  archivable: boolean;
  archiveDisabledReason: string | undefined;
  unarchivable: boolean;
  unarchiveDisabledReason: string | undefined;
};
