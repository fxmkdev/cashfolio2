import { AccountTrackingMethod } from "../.prisma-client/enums";

const trackingMethodLabels: Record<AccountTrackingMethod, string> = {
  INDIVIDUAL_UNITS: "Individual Units",
  TOTAL_PORTFOLIO_VALUE: "Total Portfolio Value",
};

export const accountTrackingMethodOptions = Object.values(
  AccountTrackingMethod,
).map((value) => ({ value, label: trackingMethodLabels[value] }));

export function getAccountTrackingMethodLabel(
  method: AccountTrackingMethod | undefined,
): string {
  return trackingMethodLabels[method ?? AccountTrackingMethod.INDIVIDUAL_UNITS];
}
