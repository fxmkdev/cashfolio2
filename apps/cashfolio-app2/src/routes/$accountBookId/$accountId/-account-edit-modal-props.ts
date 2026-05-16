import type {
  AccountInitialValues,
  EditAccountModalProps,
  TransformedFormValues,
} from "@/components/edit-account-modal";
import type { AccountBookUnitUsage } from "@/shared/account-book-unit-usage";
import type { TabValue } from "@/shared/account-tabs";
import type { loadLedgerPageData } from "./-page-loader";

type LedgerPageLoaderData = Awaited<ReturnType<typeof loadLedgerPageData>>;

export function createLedgerAccountEditModalProps(args: {
  opened: boolean;
  onClose: () => void;
  accountGroups: LedgerPageLoaderData["accountGroups"];
  unitUsage: AccountBookUnitUsage;
  onSubmit: (values: TransformedFormValues) => Promise<void>;
  initialValues: AccountInitialValues;
  existingNodes: LedgerPageLoaderData["existingNodes"];
  editingId: string;
  typeDescriptor: TabValue;
}): EditAccountModalProps {
  return {
    opened: args.opened,
    onClose: args.onClose,
    accountGroups: args.accountGroups,
    unitUsage: args.unitUsage,
    onSubmit: args.onSubmit,
    initialValues: args.initialValues,
    existingNodes: args.existingNodes,
    editingId: args.editingId,
    typeDescriptor: args.typeDescriptor,
  };
}
