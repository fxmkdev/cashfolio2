export function buildCounterpartyLedgerSearch(args: {
  transactionId: string;
  selectedPeriodValue?: string;
}) {
  return {
    transactionId: args.transactionId,
    period: args.selectedPeriodValue,
  };
}
