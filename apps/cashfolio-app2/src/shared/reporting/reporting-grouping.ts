export type ReportingGrouping = "accountStructure" | "assetClass";

export const reportingGroupingOptions: Array<{
  value: ReportingGrouping;
  label: string;
}> = [
  { value: "accountStructure", label: "Account Structure" },
  { value: "assetClass", label: "Asset Class" },
];

export function isReportingGrouping(
  value: unknown,
): value is ReportingGrouping {
  return value === "accountStructure" || value === "assetClass";
}
