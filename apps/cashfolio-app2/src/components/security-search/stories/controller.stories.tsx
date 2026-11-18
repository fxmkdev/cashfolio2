import { useState } from "react";
import { Temporal } from "@/shared/temporal";
import { Box, Button } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  useSecuritiesController,
  type SecuritiesServices,
} from "../controller";
import { SecuritySearchView } from "../view";
import { createFixtureSource } from "./source";
import { createPriceHistory, exchangeOptions, listings } from "./fixtures";
import { selectListing, setListFilter } from "./interaction-helpers";

function ControllerHarness({
  scenario = "normal",
}: {
  scenario?:
    | "normal"
    | "obsolete"
    | "unavailable"
    | "resultsError"
    | "obsoleteSearch"
    | "filtersError"
    | "historyError"
    | "partial"
    | "unusable"
    | "cooldown";
}) {
  const [historyRequests, setHistoryRequests] = useState(0);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [services] = useState<SecuritiesServices>(() => {
    let filterCalls = 0;
    let historyCalls = 0;
    let pageCalls = 0;
    let statusCalls = 0;
    return {
      async catalogue() {
        statusCalls++;
        return {
          version:
            scenario === "unavailable" && statusCalls === 1 ? null : "fixture",
          updatedAt: "2026-10-30T04:17:00Z",
          stale: true,
          exchanges: exchangeOptions,
        };
      },
      async search(query, signal) {
        pageCalls++;
        if (scenario === "obsoleteSearch" && pageCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
        if (scenario === "resultsError" && pageCalls === 1)
          throw new Error("Temporary catalogue query failure.");
        return createFixtureSource(query.criteria).loadPage(
          query,
          scenario === "obsoleteSearch" ? new AbortController().signal : signal,
        );
      },
      async filters(scope, signal) {
        filterCalls++;
        if (scenario === "filtersError" && filterCalls === 1)
          throw new Error("Temporary filter lookup failure.");
        return createFixtureSource(scope.criteria).loadFilterOptions(signal);
      },
      async history({ id }, signal) {
        const listing = listings.find((row) => row.id === id)!;
        historyCalls++;
        setHistoryRequests(historyCalls);
        if (scenario === "historyError" && historyCalls === 1)
          throw new Error("Temporary price lookup failure.");
        if (scenario === "obsolete" && historyCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
        // Deliberately return even after cancellation to test the consumer guard.
        if (scenario !== "obsolete") signal.throwIfAborted();
        const base = { listing, from: "2021-10-30", through: "2026-10-30" };
        if (
          scenario === "unusable" ||
          (scenario === "cooldown" && historyCalls === 1)
        )
          return {
            ...base,
            status: "unavailable",
            points: [],
            omissions: [{ date: "2026-10-30", reason: "non-positive" }],
            reason: "no-usable-prices",
            message:
              "Marketstack returned no usable closing prices for this listing.",
            retryAt: Temporal.Now.instant()
              .add({ seconds: scenario === "cooldown" ? 2 : 300 })
              .toString(),
          };
        if (scenario === "partial")
          return {
            ...base,
            status: "ready",
            points: [
              { date: "2026-09-02", close: 123.45 },
              { date: "2026-09-10", close: 124 },
              { date: "2026-09-20", close: 125 },
              { date: "2026-09-26", close: 125.67 },
            ],
            omissions: [
              { date: "2026-09-15", reason: "invalid" },
              { date: "2026-10-30", reason: "non-positive" },
            ],
          };
        return {
          ...base,
          status: "ready",
          omissions: [],
          points: createPriceHistory(listing),
        };
      },
    };
  });
  const controller = useSecuritiesController(services);
  return (
    <>
      <output aria-label="Fixture History Requests" hidden>
        {historyRequests}
      </output>
      {pending && (
        <Button
          onClick={() => {
            pending();
            setPending(null);
          }}
        >
          Release Previous Response
        </Button>
      )}
      <SecuritySearchView {...controller} />
    </>
  );
}
const meta = {
  title: "Routes/Securities",
  component: ControllerHarness,
  decorators: [
    (Story) => (
      <Box h="100dvh" style={{ display: "flex", flexDirection: "column" }}>
        <Story />
      </Box>
    ),
  ],
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "The production controller and server-side grid run against deterministic local service doubles. No Marketstack or backend calls are made.",
      },
    },
  },
} satisfies Meta<typeof ControllerHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ServerSideBrowsing: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    const period = canvas.getByLabelText("Chart Period").textContent!;
    await userEvent.click(canvas.getByRole("radio", { name: "5Y" }));
    await expect(canvas.getByLabelText("Chart Period")).not.toHaveTextContent(
      period,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
  },
};
export const ObsoleteHistoryResponse: Story = {
  args: { scenario: "obsolete" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XNAS");
    await expect(canvas.getByText("Loading price history…")).toBeVisible();
    await selectListing(canvasElement, "ALP:XSWX");
    await waitFor(() =>
      expect(canvas.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "CHF",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    await expect(
      within(
        canvas.getByRole("region", { name: "Security Details" }),
      ).getByText("SIX Swiss Exchange (XSWX)", { exact: true }),
    ).toBeVisible();
    // Closing/new search cancels the selection; a response cannot reopen it.
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
  },
};
export const CatalogueUnavailable: Story = {
  args: { scenario: "unavailable" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "catalogue is not available",
    );
    await expect(
      canvas.queryByText("No securities found."),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "Retry Search" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 31 of 31 listings",
      ),
    );
  },
};
export const ResultsRequestError: Story = {
  args: { scenario: "resultsError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Temporary catalogue query failure",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Results" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 31 of 31 listings",
      ),
    );
  },
};

export const ObsoleteSearchResponse: Story = {
  args: { scenario: "obsoleteSearch" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: "Security",
    });
    await userEvent.type(input, "Alpine{Enter}");
    await expect(
      await canvas.findByRole("button", { name: "Release Previous Response" }),
    ).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Harbor{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 4 of 4 listings",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "Showing 4 of 4 listings",
    );
    await expect(canvas.getByLabelText("Submitted Search")).toHaveTextContent(
      "Harbor",
    );
  },
};

export const FilterOptionsRetry: Story = {
  args: { scenario: "filtersError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 31 of 31 listings",
      ),
    );
    const viewport =
      canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!;
    viewport.scrollLeft = viewport.scrollWidth;
    let header: HTMLElement | null = null;
    await waitFor(() => {
      header = canvasElement.querySelector('.ag-header-cell[col-id="country"]');
      expect(header).not.toBeNull();
    });
    header!.focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Filter options could not be loaded",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Results" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("alert")).not.toBeInTheDocument(),
    );
    await setListFilter(canvasElement, "country", ["Switzerland"]);
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 7 of 31 listings",
      ),
    );
  },
};
export const SelectedHistoryRetry: Story = {
  args: { scenario: "historyError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Temporary price lookup failure",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Price History" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "CHF",
      ),
    );
  },
};

export const PartialPriceHistory: Story = {
  args: { scenario: "partial" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    await expect(
      await canvas.findByText("Partial Price History"),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("125.67 CHF");
    await expect(
      canvas.getByRole("img", { name: /closing price chart/ }),
    ).toBeVisible();
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    const requests = canvas.getByLabelText(
      "Fixture History Requests",
    ).textContent;
    await userEvent.click(canvas.getByRole("radio", { name: "1M" }));
    await expect(
      canvas.getByText(
        "No usable closing prices are available for this range.",
      ),
    ).toBeVisible();
    await expect(
      canvas.queryByLabelText("Latest Closing Price"),
    ).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("radio", { name: "5Y" }));
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("125.67 CHF");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent(requests!);
  },
};
export const PartialPriceHistoryDark: Story = {
  args: { scenario: "partial" },
  parameters: { colorScheme: "dark" },
  play: PartialPriceHistory.play,
};
export const PartialPriceHistoryMobile: Story = {
  args: { scenario: "partial" },
  globals: { viewport: { value: "cashfolioMobile" } },
  play: PartialPriceHistory.play,
};
export const UnusablePriceHistory: Story = {
  args: { scenario: "unusable" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "no usable closing prices",
    );
    await expect(
      canvas.getByRole("button", { name: "Retry Price History" }),
    ).toBeDisabled();
    await expect(canvas.getByText(/Retry available at/)).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy Symbol" }),
    ).toBeEnabled();
  },
};
export const HistoryRetryCooldown: Story = {
  args: { scenario: "cooldown" },
  parameters: {
    docs: {
      description: {
        story:
          "The fixture compresses the server cooldown to two seconds to exercise expiry; production uses five minutes. Expiry enables Retry without making a request.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    const retry = await canvas.findByRole("button", {
      name: "Retry Price History",
    });
    await expect(retry).toBeDisabled();
    await waitFor(() => expect(retry).toBeEnabled(), { timeout: 5000 });
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("1");
    await userEvent.click(retry);
    await expect(
      await canvas.findByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("2");
  },
};
