import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";

type GainLossInvariantAccount = {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

export function isGainLossAccount(
  account: GainLossInvariantAccount | undefined,
): boolean {
  return (
    account?.type === AccountType.EQUITY &&
    account.equityAccountSubtype === EquityAccountSubtype.GAIN_LOSS
  );
}

export const GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE =
  "Gain/Loss equity bookings require a simple transaction with exactly one Gain/Loss booking and one asset or liability booking.";

export function validateGainLossSimpleTransactionInvariant(
  accounts: GainLossInvariantAccount[],
): string | null {
  const gainLossAccounts = accounts.filter((account) =>
    isGainLossAccount(account),
  );
  if (gainLossAccounts.length === 0) return null;

  if (accounts.length !== 2) {
    return GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE;
  }

  if (gainLossAccounts.length !== 1) {
    return GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE;
  }

  const otherAccount = accounts.find((account) => !isGainLossAccount(account));
  if (
    !otherAccount ||
    (otherAccount.type !== AccountType.ASSET &&
      otherAccount.type !== AccountType.LIABILITY)
  ) {
    return GAIN_LOSS_SIMPLE_TRANSACTION_INVARIANT_MESSAGE;
  }

  return null;
}
