import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";

export const GAIN_LOSS_ACCOUNT_MANAGEMENT_MESSAGE =
  "Gain/Loss accounts are system-managed.";
export const GAIN_LOSS_GROUP_MANAGEMENT_MESSAGE =
  "Gain/Loss groups are system-managed.";

type EquityNode = {
  type: AccountType;
  equityAccountSubtype?: EquityAccountSubtype | null;
};

function isGainLossSubtype(
  subtype: EquityAccountSubtype | null | undefined,
): boolean {
  return subtype === EquityAccountSubtype.GAIN_LOSS;
}

export function isGainLossEquityNode(node: EquityNode): boolean {
  return (
    node.type === AccountType.EQUITY &&
    isGainLossSubtype(node.equityAccountSubtype)
  );
}

export function assertNotSystemManagedGainLossAccount(node: EquityNode): void {
  if (isGainLossEquityNode(node)) {
    throw new Error(GAIN_LOSS_ACCOUNT_MANAGEMENT_MESSAGE);
  }
}

export function assertNotSystemManagedGainLossGroup(node: EquityNode): void {
  if (isGainLossEquityNode(node)) {
    throw new Error(GAIN_LOSS_GROUP_MANAGEMENT_MESSAGE);
  }
}
