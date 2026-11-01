import { Button, Stack, Text } from "@mantine/core";
import buttonStyles from "@mantine/core/styles/Button.css?inline";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { PeriodFilterAction } from "./-period-filter-action";
import { useExplicitPeriodFilter } from "./-use-explicit-period-filter";
import { parseLedgerExplicitPeriod } from "./$accountId/-ledger/page-types";
import { clampLedgerExplicitPeriodToBounds } from "./$accountId/-ledger/explicit-period-bounds";
import { parseTransactionsExplicitPeriod } from "./transactions/-page-types";
import { clampTransactionsExplicitPeriodToBounds } from "./transactions/-explicit-period-bounds";

const maxDate = new Date("2026-10-10T00:00:00Z");
const bookMinDate = new Date("2024-01-08T00:00:00Z");

function PeriodFilterExample({
  initialPeriod,
  transactions = false,
  available = true,
  navigationMinDate = bookMinDate,
  onPeriodChange,
}: {
  initialPeriod?: string;
  transactions?: boolean;
  available?: boolean;
  navigationMinDate?: Date;
  onPeriodChange: (period: string | undefined) => void;
}) {
  const [period, setPeriod] = useState(initialPeriod);
  const changePeriod = useCallback(
    (value: string | undefined) => {
      setPeriod(value);
      onPeriodChange(value);
    },
    [onPeriodChange],
  );
  const { controls, setPeriodFilter } = useExplicitPeriodFilter({
    available,
    period,
    defaultPeriod: transactions ? "2026-10" : undefined,
    locale: "en-CH",
    parsePeriod: transactions
      ? parseTransactionsExplicitPeriod
      : parseLedgerExplicitPeriod,
    clampPeriod: transactions
      ? clampTransactionsExplicitPeriodToBounds
      : clampLedgerExplicitPeriodToBounds,
    clampMinDate: bookMinDate,
    navigationMinDate,
    maxDate,
    allowClear: !transactions,
    onPeriodChange: changePeriod,
  });
  return (
    <Stack align="flex-start">
      {available ? (
        <PeriodFilterAction {...controls} />
      ) : (
        <Text>Filtering unavailable</Text>
      )}
      <Text role="status">{period ?? "No explicit period"}</Text>
      <Button onClick={() => setPeriodFilter("2026-08")}>
        Open August ledger period
      </Button>
    </Stack>
  );
}

const meta = {
  title: "Routes/ExplicitPeriodFilter",
  component: PeriodFilterExample,
  args: { initialPeriod: "2026-05", onPeriodChange: fn() },
} satisfies Meta<typeof PeriodFilterExample>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FilteredLedger: Story = {
  render: (args) => (
    <>
      <PeriodFilterExample {...args} />
      {/* Route styles must also work when Mantine's CSS loads afterward. */}
      <style>{buttonStyles}</style>
    </>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    const picker = canvas.getByTestId("period-picker-trigger");
    const selector = picker.parentElement!;
    const initialWidth = selector.getBoundingClientRect().width;
    const expectStableWidth = () =>
      expect(selector.getBoundingClientRect().width).toBeCloseTo(
        initialWidth,
        1,
      );
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Period" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("2026-04");
    await userEvent.click(canvas.getByRole("button", { name: "Next Period" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("2026-05");
    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    await userEvent.click(await body.findByRole("radio", { name: "Year" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(/^2026$/);
    await expectStableWidth();
    await userEvent.click(
      within(await body.findByTestId("period-year-picker")).getByRole(
        "button",
        {
          name: /^2025$/,
        },
      ),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^2025$/);
    await waitFor(() =>
      expect(body.queryByTestId("period-year-picker")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    await userEvent.click(await body.findByRole("radio", { name: "Month" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("2025-12");
    await userEvent.click(
      within(await body.findByTestId("period-month-picker")).getByRole(
        "button",
        {
          name: /Nov/i,
        },
      ),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("2025-11");
    await waitFor(() =>
      expect(body.queryByTestId("period-month-picker")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    await userEvent.click(
      await body.findByRole("button", { name: "Clear Filter" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No explicit period",
    );
    await expect(canvas.getByTestId("period-picker-trigger")).toHaveTextContent(
      "All Periods",
    );
    await expectStableWidth();
  },
};

export const UnfilteredLedger: Story = {
  args: { initialPeriod: undefined },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      canvas.getByRole("button", { name: "Previous Period" }),
    ).toBeDisabled();
    await expect(
      canvas.getByRole("button", { name: "Next Period" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    await expect(
      await body.findByRole("button", { name: "Clear Filter" }),
    ).toBeDisabled();
    await userEvent.click(body.getByRole("radio", { name: "Year" }));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No explicit period",
    );
    await expect(args.onPeriodChange).not.toHaveBeenCalled();
    await userEvent.click(
      within(await body.findByTestId("period-year-picker")).getByRole(
        "button",
        {
          name: /^2025$/,
        },
      ),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(/^2025$/);
  },
};

export const TransactionsDefault: Story = {
  args: { initialPeriod: undefined, transactions: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await expect(canvas.getByTestId("period-picker-trigger")).toHaveTextContent(
      "October 2026",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "No explicit period",
    );
    await expect(args.onPeriodChange).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "Next Period" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByTestId("period-picker-trigger"));
    await expect(
      body.queryByRole("button", { name: "Clear Filter" }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      within(await body.findByTestId("period-month-picker")).getByRole(
        "button",
        {
          name: /Sep/i,
        },
      ),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("2026-09");
    await waitFor(() =>
      expect(body.queryByTestId("period-month-picker")).not.toBeInTheDocument(),
    );
  },
};

export const UnavailableLedger: Story = {
  args: { available: false, initialPeriod: "2020-01" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Filtering unavailable")).toBeInTheDocument();
    await expect(
      canvas.queryByTestId("period-picker-trigger"),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent("2020-01");
    await expect(args.onPeriodChange).not.toHaveBeenCalled();
  },
};

export const EmptyLedgerPeriod: Story = {
  args: {
    initialPeriod: "2024-01",
    navigationMinDate: new Date("2024-03-10T00:00:00Z"),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByTestId("period-picker-trigger")).toHaveTextContent(
      "January 2024",
    );
    await expect(args.onPeriodChange).not.toHaveBeenCalled();
    await expect(
      canvas.getByRole("button", { name: "Previous Period" }),
    ).toBeDisabled();
    await userEvent.click(canvas.getByRole("button", { name: "Next Period" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("2024-03");
  },
};

export const OutOfRangeLedger: Story = {
  args: { initialPeriod: "2020-01" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("2024-01");
    await expect(args.onPeriodChange).toHaveBeenCalledTimes(1);
    await expect(args.onPeriodChange).toHaveBeenCalledWith("2024-01");
    await userEvent.click(
      canvas.getByRole("button", { name: "Open August ledger period" }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("2026-08");
  },
};
