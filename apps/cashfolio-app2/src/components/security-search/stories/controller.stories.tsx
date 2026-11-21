import { Box } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { selectListing } from "./interaction-helpers";
import { ControllerHarness } from "./controller-harness";
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
    await expect(canvas.getByLabelText("Loading Price History")).toBeVisible();
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
export const ResultsRequestError: Story = {
  args: { scenario: "resultsError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Temporary securities query failure",
    );
    const results = canvas.getByRole("region", { name: "Security Results" });
    await expect(results).toHaveAttribute("aria-busy", "false");
    await waitFor(() =>
      expect(
        within(results).queryAllByTestId("security-result-skeleton"),
      ).toHaveLength(0),
    );
    await expect(
      within(results).queryByText(/Loading\.{3}|ERR/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Results" }),
    );
    await waitFor(() =>
      expect(
        within(results).getAllByTestId("security-result-skeleton").length,
      ).toBeGreaterThan(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "true");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "31 listings",
      ),
    );
    await expect(results).toHaveAttribute("aria-busy", "false");
    await expect(
      within(results).queryAllByTestId("security-result-skeleton"),
    ).toHaveLength(0);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
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
        "4 listings",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "4 listings",
    );
    await expect(canvas.getByLabelText("Submitted Search")).toHaveTextContent(
      "Harbor",
    );
  },
};

export const ExchangeDirectoryRetry: Story = {
  args: { scenario: "exchangesError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "Exchange" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Exchange names could not be loaded",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Exchanges" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("alert")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "31 listings",
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
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
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

export const ExplicitDiscoveryRequests: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("0");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Alpine");
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    const exchange = canvas.getByRole("combobox", { name: "Exchange" });
    await userEvent.click(exchange);
    await userEvent.type(exchange, "Swiss");
    await userEvent.click(
      await within(document.body).findByRole("option", {
        name: "SIX Swiss Exchange (XSWX)",
      }),
    );
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "2 listings",
      ),
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(exchange);
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("1");
  },
};
