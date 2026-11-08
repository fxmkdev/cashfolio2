import type { EditTransactionModalProps } from "./edit-transaction-modal-types";
import { useEditTransactionModalController } from "./edit-transaction-modal/controller";
import { EditTransactionModalView } from "./edit-transaction-modal/view";

export type {
  AccountOption,
  BookingValues,
  TransactionFormValues,
  EditTransactionModalProps,
  TransactionSubmitValues,
} from "./edit-transaction-modal-types";

export function EditTransactionModal(props: EditTransactionModalProps) {
  const controller = useEditTransactionModalController(props);
  return <EditTransactionModalView {...controller} />;
}
