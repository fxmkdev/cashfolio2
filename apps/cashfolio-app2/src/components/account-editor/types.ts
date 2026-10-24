import {
  type AssetClass,
  EquityAccountSubtype,
  Unit,
  AccountType,
} from "../../.prisma-client/enums";
import { type StatementImportCsvFormat } from "@/shared/statement-import-csv-format";
import {
  type AccountGroupOption,
  type ExistingNode,
} from "./account-cash-form-rules";
import { type AccountBookUnitUsage } from "../../shared/account-book-unit-usage";

export type AccountTypeDescriptor =
  "BALANCE" | "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

export type FormValues = {
  assetClass?: AssetClass | "" | null;
  name?: string;
  typeDescriptor?: AccountTypeDescriptor;
  groupId?: string;
  sortOrder?: number;
  openingBalance?: number | string;
  unit: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  statementImportCsvFormat?: string;
  isCashAccount?: boolean;
};

export type TransformedFormValues = Omit<
  FormValues,
  | "assetClass"
  | "openingBalance"
  | "unit"
  | "currency"
  | "cryptocurrency"
  | "symbol"
  | "tradeCurrency"
  | "statementImportCsvFormat"
> & {
  assetClass?: AssetClass | null;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype;
  unit?: Unit;
  currency?: string;
  cryptocurrency?: string;
  symbol?: string;
  tradeCurrency?: string;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean;
  openingBalance?: number | null;
};

export type AccountInitialValues = {
  assetClass?: AssetClass | null;
  name: string;
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
  groupId?: string | null;
  sortOrder?: number | null;
  unit?: Unit | null;
  currency?: string | null;
  cryptocurrency?: string | null;
  symbol?: string | null;
  tradeCurrency?: string | null;
  statementImportCsvFormat?: StatementImportCsvFormat | null;
  isCashAccount?: boolean | null;
  openingBalance?: number | null;
};

export type AccountInitialValuesSource = Pick<
  AccountInitialValues,
  | "name"
  | "assetClass"
  | "type"
  | "equityAccountSubtype"
  | "groupId"
  | "sortOrder"
  | "unit"
  | "currency"
  | "cryptocurrency"
  | "symbol"
  | "tradeCurrency"
  | "statementImportCsvFormat"
  | "isCashAccount"
  | "openingBalance"
>;

export type EditAccountModalProps = {
  opened: boolean;
  onClose: () => void;
  onRefreshConstraints?: () => Promise<void>;
  onExitTransitionEnd?: () => void;
  accountGroups: AccountGroupOption[];
  onSubmit: (values: TransformedFormValues) => void | Promise<void>;
  initialValues?: AccountInitialValues;
  existingNodes?: ExistingNode[];
  editingId?: string;
  typeDescriptor: AccountTypeDescriptor;
  unitUsage?: AccountBookUnitUsage;
};
