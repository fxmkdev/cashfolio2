import { Breadcrumbs, Text } from "@mantine/core";
import { getAccountsBreadcrumbSegments } from "./accounts-breadcrumb-segments";

type AccountsBreadcrumbArgs = Parameters<
  typeof getAccountsBreadcrumbSegments
>[0];

export type AccountPathHeadingProps = {
  accountBookId: AccountsBreadcrumbArgs["accountBookId"];
  tab: AccountsBreadcrumbArgs["tab"];
  mode: AccountsBreadcrumbArgs["mode"];
  archiveIsLink?: AccountsBreadcrumbArgs["archiveIsLink"];
  extraSegments?: readonly string[];
};

export function AccountPathHeading({
  accountBookId,
  tab,
  mode,
  archiveIsLink,
  extraSegments,
}: AccountPathHeadingProps) {
  return (
    <Breadcrumbs fz="h2" fw={700} lh="var(--mantine-h2-line-height)">
      {getAccountsBreadcrumbSegments({
        accountBookId,
        tab,
        mode,
        archiveIsLink,
      })}
      {extraSegments?.map((segment, index) => (
        <Text
          key={`${segment}-${index}`}
          fz="inherit"
          fw="inherit"
          lh="inherit"
        >
          {segment}
        </Text>
      ))}
    </Breadcrumbs>
  );
}
