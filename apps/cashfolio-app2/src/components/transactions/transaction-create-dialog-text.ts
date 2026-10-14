export function getTransactionCreateDialogText(isCopy: boolean): {
  title: string;
  submitLabel: string;
} {
  return isCopy
    ? { title: "Copy Transaction", submitLabel: "Create Copy" }
    : { title: "Add Transaction", submitLabel: "Create" };
}
