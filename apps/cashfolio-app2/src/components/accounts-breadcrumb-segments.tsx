import { Text } from "@mantine/core";
import { EquityAccountSubtype } from "../.prisma-client/enums";
import { LinkAnchor } from "./link-anchor";

type AccountsBreadcrumbMode = "active" | "archived";
type AccountsTab = "ASSET" | "LIABILITY" | `EQUITY-${EquityAccountSubtype}`;

export function AccountsBreadcrumbSegments({
  accountBookId,
  tab,
  mode,
  archiveIsLink = true,
}: {
  accountBookId: string;
  tab: AccountsTab;
  mode: AccountsBreadcrumbMode;
  archiveIsLink?: boolean;
}) {
  return (
    <>
      <LinkAnchor
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
      </LinkAnchor>
      {mode === "archived" && (
        <>
          <Text component="span" fz="inherit" fw="inherit" lh="inherit">
            {" / "}
          </Text>
          {archiveIsLink ? (
            <LinkAnchor
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
            <Text fz="inherit" fw="inherit" lh="inherit">
              Archive
            </Text>
          )}
        </>
      )}
    </>
  );
}
