import { EquityAccountSubtype } from "../.prisma-client/enums";

export const OPENING_BALANCES_ACCOUNT_MANAGEMENT_MESSAGE =
  "Opening Balances accounts are system-managed.";
export const OPENING_BALANCES_GROUP_MANAGEMENT_MESSAGE =
  "Opening Balances groups are system-managed.";
export const GAIN_LOSS_ACCOUNT_MANAGEMENT_MESSAGE =
  "Gain/Loss accounts are system-managed.";
export const GAIN_LOSS_GROUP_MANAGEMENT_MESSAGE =
  "Gain/Loss groups are system-managed.";

type SystemManagedEquitySubtype = Extract<
  EquityAccountSubtype,
  "OPENING_BALANCES" | "GAIN_LOSS"
>;

export function isSystemManagedEquitySubtype(
  subtype: EquityAccountSubtype | null | undefined,
): subtype is SystemManagedEquitySubtype {
  return (
    subtype === EquityAccountSubtype.OPENING_BALANCES ||
    subtype === EquityAccountSubtype.GAIN_LOSS
  );
}

export function getSystemManagedAccountSubtypeMessage(
  subtype: SystemManagedEquitySubtype,
): string {
  return subtype === EquityAccountSubtype.OPENING_BALANCES
    ? OPENING_BALANCES_ACCOUNT_MANAGEMENT_MESSAGE
    : GAIN_LOSS_ACCOUNT_MANAGEMENT_MESSAGE;
}

export function getSystemManagedGroupSubtypeMessage(
  subtype: SystemManagedEquitySubtype,
): string {
  return subtype === EquityAccountSubtype.OPENING_BALANCES
    ? OPENING_BALANCES_GROUP_MANAGEMENT_MESSAGE
    : GAIN_LOSS_GROUP_MANAGEMENT_MESSAGE;
}
