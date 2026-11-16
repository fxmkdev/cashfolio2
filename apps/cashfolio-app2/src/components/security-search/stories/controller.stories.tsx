import { useState } from "react";
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
    | "historyError";
}) {
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
        if (scenario === "historyError" && historyCalls === 1)
          throw new Error("Temporary price lookup failure.");
        if (scenario === "obsolete" && historyCalls === 1)
          await new Promise<void>((resolve) => setPending(() => resolve));
        // Deliberately return even after cancellation to test the consumer guard.
        if (scenario !== "obsolete") signal.throwIfAborted();
        return {
          listing,
          points: createPriceHistory(listing),
          from: "2021-10-30",
          through: "2026-10-30",
        };
      },
    };
  });
  const controller = useSecuritiesController(services);
  return (
    <>
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
