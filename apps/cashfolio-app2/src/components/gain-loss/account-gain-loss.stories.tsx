import type { Meta, StoryObj } from "@storybook/react-vite";
import { Drawer } from "@mantine/core";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountGainLossSummaryView } from "./account-gain-loss-summary";
import { AccountGainLossCalculation } from "./account-gain-loss-calculation";
import type { AccountGainLossDetails } from "@/shared/account-gain-loss";

const data: AccountGainLossDetails = {
  applicable: true,
  accountName: "AAPL Holdings",
  referenceCurrency: "CHF",
  startDate: "2026-01-01T00:00:00Z",
  asOfDate: "2026-03-31T00:00:00Z",
  target: {
    accountId: "holding",
    accountName: "AAPL Holdings",
    isVirtual: false,
    unit: "SECURITY",
    symbol: "AAPL",
    tradeCurrency: "CHF",
    currency: null,
    cryptocurrency: null,
    unitLabel: "AAPL (CHF)",
  },
  summary: { realizedGainLoss: 50, unrealizedGainLoss: 60, totalGainLoss: 110 },
  diagnostics: [],
  realizedEvents: [
    {
      id: "sell",
      bookingId: "sell",
      date: "2026-03-10T00:00:00Z",
      bookingDescription: "Partial Sale",
      transactionDescription: "Partial Sale",
      transactionId: "sale",
      quantity: -1,
      effectiveReferenceAmount: -150,
      executionUnitPriceInReference: 150,
      realizedGainLossDelta: 50,
      runningRealizedGainLoss: 50,
      lotMatches: [
        {
          id: "match",
          acquisitionSortKey: "2026-01-10T00:00:00Z::buy",
          acquisitionDate: "2026-01-10T00:00:00Z",
          acquisitionBookingId: "buy",
          matchedQuantity: 1,
          lotUnitCostInReference: 100,
          executionUnitPriceInReference: 150,
          realizedGainLossDelta: 50,
          runningEventRealizedGainLoss: 50,
        },
      ],
      pricing: {
        source: "directConversion",
        marketReferenceAmount: -150,
        residualAllocationAmount: 0,
        effectiveReferenceAmount: -150,
      },
      rounding: {
        rawEffectiveReferenceAmount: -150,
        roundedEffectiveReferenceAmount: -150,
        rawExecutionUnitPriceInReference: 150,
        roundedExecutionUnitPriceInReference: 150,
        rawRealizedGainLossDelta: 50,
        roundedRealizedGainLossDelta: 50,
        rawRunningRealizedGainLoss: 50,
        roundedRunningRealizedGainLoss: 50,
      },
    },
  ],
  unrealizedOpenLots: [
    {
      id: "lot",
      acquisitionSortKey: "2026-01-10T00:00:00Z::buy",
      acquisitionDate: "2026-01-10T00:00:00Z",
      acquisitionBookingId: "buy",
      quantity: 1,
      unitCostInReference: 100,
      periodEndRate: 160,
      unrealizedGainLoss: 60,
      runningUnrealizedGainLoss: 60,
    },
  ],
};

const meta = {
  title: "Components/GainLoss/AccountGainLoss",
  component: AccountGainLossSummaryView,
  args: {
    data,
    loading: false,
    onRetry: () => {},
    onViewCalculation: () => {},
  },
} satisfies Meta<typeof AccountGainLossSummaryView>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Summary: Story = {};
export const Loading: Story = { args: { data: undefined, loading: true } };
export const RequestFailure: Story = {
  args: {
    data: undefined,
    error: "Gain/loss could not be loaded. Please try again.",
  },
};
export const MissingClosingRate: Story = {
  args: {
    data: {
      ...data,
      summary: {
        realizedGainLoss: 50,
        unrealizedGainLoss: null,
        totalGainLoss: null,
      },
      diagnostics: [
        {
          date: data.asOfDate,
          message:
            "Closing valuation is unavailable. Realised G/L remains available.",
        },
      ],
    },
  },
};
export const MissingBasis: Story = {
  args: {
    data: {
      ...data,
      summary: {
        realizedGainLoss: null,
        unrealizedGainLoss: null,
        totalGainLoss: null,
      },
      diagnostics: [
        {
          date: data.startDate,
          message: "A transferred holding has an incomplete cost basis.",
        },
      ],
    },
  },
};
export const CalculationDrawer: Story = {
  render: () => (
    <Drawer
      opened
      onClose={() => {}}
      position="right"
      size="90%"
      title="Gain/Loss Calculation"
    >
      <AccountGainLossCalculation data={data} onOpenTransaction={() => {}} />
    </Drawer>
  ),
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    const calculation = await body.findByRole("dialog", {
      name: "Gain/Loss Calculation",
    });
    await userEvent.click(
      await within(calculation).findByText("Partial Sale", { exact: true }),
    );
    const event = await body.findByRole("dialog", {
      name: "Explain Realised Delta",
    });
    await waitFor(async () => {
      await expect(
        within(event).getByText("Lot Matches", { exact: true }),
      ).toBeVisible();
      await expect(
        within(event).getByText("100.00000", { exact: true }),
      ).toBeVisible();
    });
  },
};

export const TransferClosesOppositePosition: Story = {
  render: () => {
    const sale = data.realizedEvents[0]!;
    const transferred = {
      ...data,
      summary: {
        realizedGainLoss: 50,
        unrealizedGainLoss: 0,
        totalGainLoss: 50,
      },
      unrealizedOpenLots: [],
      realizedEvents: [
        {
          ...sale,
          id: "transfer",
          bookingId: "transfer",
          transactionId: "transfer",
          transactionDescription: "Transfer Holding",
          quantity: 1,
          effectiveReferenceAmount: 100,
          executionUnitPriceInReference: 100,
          pricing: {
            source: "transferBasis" as const,
            marketReferenceAmount: null,
            residualAllocationAmount: 0,
            effectiveReferenceAmount: 100,
          },
          lotMatches: [
            {
              ...sale.lotMatches[0]!,
              lotUnitCostInReference: 150,
              executionUnitPriceInReference: 100,
            },
          ],
          rounding: {
            ...sale.rounding,
            rawEffectiveReferenceAmount: 100,
            roundedEffectiveReferenceAmount: 100,
            rawExecutionUnitPriceInReference: 100,
            roundedExecutionUnitPriceInReference: 100,
          },
        },
      ],
    };
    return (
      <AccountGainLossCalculation
        data={transferred}
        onOpenTransaction={() => {}}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Transfer", { exact: true }),
    ).toBeVisible();
    await userEvent.click(
      await canvas.findByText("Transfer Holding", { exact: true }),
    );
    const body = within(canvasElement.ownerDocument.body);
    const event = await body.findByRole("dialog", {
      name: "Explain Realised Delta",
    });
    await waitFor(async () => {
      await expect(
        within(event).getByText("Transfer basis", { exact: true }),
      ).toBeVisible();
      await expect(
        within(event).getByText(/carried acquisition costs/),
      ).toBeVisible();
      await expect(
        within(event).getByText("150.00000", { exact: true }),
      ).toBeVisible();
      await expect(
        within(event).getByText("100.00000", { exact: true }),
      ).toBeVisible();
    });
  },
};
