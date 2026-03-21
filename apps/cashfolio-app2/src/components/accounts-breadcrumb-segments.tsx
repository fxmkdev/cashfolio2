import { Text } from "@mantine/core";
import type { ReactNode } from "react";
import { EquityAccountSubtype } from "../.prisma-client/enums";
import { LinkAnchor } from "./link-anchor";

type AccountsBreadcrumbMode = "active" | "archived";
type AccountsTab = "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

export function getAccountsBreadcrumbSegments({
  accountBookId,
  tab,
  mode,
  archiveIsLink = true,
}: {
  accountBookId: string;
  tab: AccountsTab;
  mode: AccountsBreadcrumbMode;
  archiveIsLink?: boolean;
}): ReactNode[] {
  const segments: ReactNode[] = [
    <LinkAnchor
      key="accounts"
      to="/$accountBookId"
      params={{ accountBookId }}
      search={{
        tab,
        mode: "active",
      }}
      fz="inherit"
      fw="inherit"
      lh="inherit"
    >
      Accounts
    </LinkAnchor>,
  ];

  if (mode === "archived") {
    segments.push(
      archiveIsLink ? (
        <LinkAnchor
          key="archive"
          to="/$accountBookId"
          params={{ accountBookId }}
          search={{
            tab,
            mode: "archived",
          }}
          fz="inherit"
          fw="inherit"
          lh="inherit"
        >
          Archive
        </LinkAnchor>
      ) : (
        <Text key="archive" fz="inherit" fw="inherit" lh="inherit">
          Archive
        </Text>
      ),
    );
  }

  return segments;
}
