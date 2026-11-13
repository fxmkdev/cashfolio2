import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "@mantine/core";
import { useState } from "react";
import { expect, fn, userEvent, within, waitFor } from "storybook/test";
import { UserLocaleProvider } from "@/user-locale-context";
import { data, selected, ReturnGridExample } from "./return-story-support";
import { AccountReturnSummaryView } from "./return-summary";
import { ReturnCalculation } from "./return-calculation";

const meta = {
  title: "Components/AccountReturns",
  component: AccountReturnSummaryView,
  args: { data, loading: false, onRetry: fn(), onViewCalculation: fn() },
} satisfies Meta<typeof AccountReturnSummaryView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("10.00%");
    await expect(
      canvas.getByTestId("account-return-annualized-mwr"),
    ).toHaveTextContent("10.00%");
    await userEvent.click(
      canvas.getByRole("button", { name: "View Return Calculation" }),
    );
    await expect(args.onViewCalculation).toHaveBeenCalled();
  },
};
export const Loading: Story = { args: { data: undefined, loading: true } };
export const RequestFailure: Story = {
  args: {
    data: undefined,
    error: "Returns could not be loaded. Please try again.",
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Retry" }),
    );
    await expect(args.onRetry).toHaveBeenCalled();
  },
};
export const AmbiguousMwr: Story = {
  args: {
    data: {
      ...data,
      mwr: null,
      annualizedMwr: null,
      diagnostics: [
        {
          metric: "mwr",
          message:
            "Multiple money-weighted returns are possible for these cash flows.",
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("10.00%");
    await expect(
      canvas.getByTestId("account-return-annualized-mwr"),
    ).toHaveTextContent("—");
    await userEvent.hover(canvas.getByTestId("account-return-annualized-mwr"));
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("Multiple money-weighted");
  },
};
export const NegativeCapital: Story = {
  args: {
    data: {
      ...data,
      twr: null,
      mwr: null,
      annualizedTwr: null,
      annualizedMwr: null,
      diagnostics: [
        {
          metric: "both",
          message:
            "Returns are unavailable when invested value becomes negative.",
        },
      ],
    },
  },
};
export const SwissLocale: Story = {
  decorators: [
    (Story) => (
      <UserLocaleProvider locale="de-CH">
        <Story />
      </UserLocaleProvider>
    ),
  ],
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByTestId("account-return-annualized-twr"),
    ).toHaveTextContent(
      new Intl.NumberFormat("de-CH", {
        style: "percent",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(0.1),
    );
  },
};
const openTransaction = fn();
export const Calculation: Story = {
  render: () => (
    <ReturnCalculation data={data} onOpenTransaction={openTransaction} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("10.00%");
    await expect(
      canvas.getByTestId("account-return-cumulative-twr"),
    ).toHaveTextContent("21.00%");
    await expect(
      canvas.getByRole("heading", { name: "Valuations and TWR Factors" }),
    ).toBeVisible();
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open Transaction" }),
    );
    await expect(openTransaction).toHaveBeenCalledWith(
      "deposit-transaction",
      "2026-01-01",
    );
  },
};

export const AccountAndGroupGrid: Story = {
  render: () => <ReturnGridExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Group/,
      }),
    );
    await expect(selected).toHaveBeenCalledWith({ kind: "group", id: "group" });
    await waitFor(async () =>
      expect(
        await within(document.body).findByRole("dialog", {
          name: "Return Calculation",
        }),
      ).toBeVisible(),
    );
  },
};

async function checkGridTooltips(
  canvasElement: HTMLElement,
  unavailable: boolean,
) {
  const canvas = within(canvasElement);
  const body = within(document.body);
  for (const metric of ["TWR", "MWR"] as const) {
    const button = await canvas.findByRole("button", {
      name: new RegExp(
        `View ${metric} calculation for Investment Account \\(Annualized\\):`,
      ),
    });
    const explanation = unavailable
      ? "Returns are unavailable because a closing valuation is missing."
      : metric === "TWR"
        ? "Annualized time-weighted return: compound annual performance excluding capital movements."
        : "Annualized money-weighted return: annual performance reflecting the timing and size of capital movements.";
    if (unavailable) {
      await expect(button).toHaveTextContent("—");
      await expect(button).toHaveAccessibleName(
        `View ${metric} calculation for Investment Account (Annualized): ${explanation}`,
      );
    }
    await userEvent.hover(button);
    // Wait for AG Grid, whose delay exceeds Mantine's global 500ms delay,
    // so a second tooltip cannot pass unnoticed before it opens.
    await waitFor(
      async () => {
        const tooltip = canvasElement.querySelector(".ag-tooltip");
        await expect(tooltip).toBeVisible();
        await expect(tooltip).toHaveTextContent(explanation);
        await expect(body.queryAllByRole("tooltip")).toHaveLength(1);
      },
      { timeout: 3000 },
    );
    await userEvent.unhover(button);
    await waitFor(() => expect(body.queryAllByRole("tooltip")).toHaveLength(0));
  }
}

export const GridTooltips: Story = {
  render: () => <ReturnGridExample />,
  play: ({ canvasElement }) => checkGridTooltips(canvasElement, false),
};

export const UnavailableGridTooltips: Story = {
  render: () => <ReturnGridExample unavailable />,
  play: ({ canvasElement }) => checkGridTooltips(canvasElement, true),
};

export const GridKeyboardCalculation: Story = {
  render: () => <ReturnGridExample unavailable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const [metric, key] of [
      ["TWR", "{Enter}"],
      ["MWR", " "],
    ] as const) {
      const button = await canvas.findByRole("button", {
        name: new RegExp(
          `View ${metric} calculation for Investment Account \\(Annualized\\):`,
        ),
      });
      button.focus();
      await expect(button).toHaveFocus();
      await userEvent.keyboard(key);
      const dialog = await within(document.body).findByRole("dialog", {
        name: "Return Calculation",
      });
      await waitFor(() => expect(dialog).toBeVisible());
      await expect(selected).toHaveBeenLastCalledWith({
        kind: "account",
        id: "a",
      });
      await userEvent.keyboard("{Escape}");
      await waitFor(() => expect(dialog).not.toBeInTheDocument());
    }
  },
};

export const GridLoading: Story = {
  render: () => <ReturnGridExample loading />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const indicators = await canvas.findAllByRole("status", {
      name: "Loading TWR",
    });
    await expect(indicators).toHaveLength(3);
    for (const indicator of indicators) {
      await expect(indicator).toHaveStyle({
        justifyContent: "flex-end",
        alignItems: "center",
      });
      await expect(
        indicator.querySelector(".mantine-Loader-root")?.children,
      ).toHaveLength(3);
    }
    await expect(
      canvas.getAllByRole("status", { name: "Loading MWR" }),
    ).toHaveLength(3);
  },
};

function GridLoadingCompletion() {
  const [loading, setLoading] = useState(true);
  return (
    <>
      <Button onClick={() => setLoading(false)}>Complete Loading</Button>
      <ReturnGridExample loading={loading} />
    </>
  );
}
export const GridLoadingCompletes: Story = {
  render: () => <GridLoadingCompletion />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("status", { name: "Loading TWR" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete Loading" }),
    );
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account \(Annualized\): 10.00%/,
      }),
    ).toBeVisible();
    await expect(
      canvas.queryByRole("status", { name: "Loading TWR" }),
    ).not.toBeInTheDocument();
  },
};

function ProgressiveGridExample() {
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  return (
    <>
      <Button onClick={() => setCompleted(new Set(["a"]))}>
        Complete Account
      </Button>
      <Button
        onClick={() =>
          setCompleted(new Set(["a", "group", "__return_total__"]))
        }
      >
        Complete All
      </Button>
      <ReturnGridExample loading completedIds={completed} unavailable />
    </>
  );
}
export const ProgressiveUnavailableRows: Story = {
  render: () => <ProgressiveGridExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findAllByRole("status", { name: "Loading TWR" });
    await userEvent.click(
      canvas.getByRole("button", { name: "Complete Account" }),
    );
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account \(Annualized\):/,
      }),
    ).toHaveTextContent("—");
    await expect(
      canvas.getAllByRole("status", { name: "Loading TWR" }),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Complete All" }));
    await expect(
      canvas.queryByRole("status", { name: "Loading TWR" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.queryByRole("status", { name: "Loading MWR" }),
    ).not.toBeInTheDocument();
  },
};
