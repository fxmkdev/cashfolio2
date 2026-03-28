import { SegmentedControl } from "@mantine/core";
import { LinkAnchor } from "../../components/link-anchor";

type LedgerView = "ledger" | "chart";

export type LedgerViewSegmentedControlProps = {
  accountBookId: string;
  accountId: string;
  view: LedgerView;
};

function SegmentLabel(props: {
  label: string;
  to: "/$accountBookId/$accountId" | "/$accountBookId/$accountId/chart";
  accountBookId: string;
  accountId: string;
}) {
  const { label, to, accountBookId, accountId } = props;

  return (
    <LinkAnchor
      to={to}
      params={{ accountBookId, accountId }}
      search={{}}
      c="inherit"
      style={{
        alignItems: "center",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        pointerEvents: "auto",
        position: "relative",
        textDecoration: "none",
        width: "100%",
        zIndex: 1,
      }}
    >
      {label}
    </LinkAnchor>
  );
}

export function LedgerViewSegmentedControl({
  accountBookId,
  accountId,
  view,
}: LedgerViewSegmentedControlProps) {
  return (
    <SegmentedControl
      size="xs"
      value={view}
      readOnly
      styles={{
        innerLabel: {
          pointerEvents: "none",
        },
      }}
      data={[
        {
          value: "ledger",
          label: (
            <SegmentLabel
              label="Ledger"
              to="/$accountBookId/$accountId"
              accountBookId={accountBookId}
              accountId={accountId}
            />
          ),
        },
        {
          value: "chart",
          label: (
            <SegmentLabel
              label="Chart"
              to="/$accountBookId/$accountId/chart"
              accountBookId={accountBookId}
              accountId={accountId}
            />
          ),
        },
      ]}
    />
  );
}
