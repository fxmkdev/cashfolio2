import { Box } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ControllerHarness } from "./controller-harness";
import { selectListing } from "./interaction-helpers";
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
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ControllerHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const RestorePageAndSelection: Story = {
  args: {
    initialView: {
      q: "",
      page: 2,
      selectedSymbol: "ALP",
      selectedMic: "XSWX",
      range: "5Y",
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
        "[20]",
      ),
    );
    await expect(
      await canvas.findByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    await expect(canvas.getByRole("radio", { name: "5Y" })).toBeChecked();
    await expect(
      canvas.getByLabelText("Fixture Resolve Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByRole("button", { name: /^Page 2$/ }),
    ).toHaveAttribute("data-active");
    await userEvent.click(
      canvas.getByRole("button", { name: "Previous Page" }),
    );
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
  },
};
export const RestoreVisibleSelection: Story = {
  args: {
    initialView: { q: "Alpine", selectedSymbol: "ALP", selectedMic: "XNAS" },
    savedExchange: "XSWX",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
    await expect(
      canvas.getByLabelText("Fixture Resolve Requests"),
    ).toHaveTextContent("0");
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "8 listings",
    );
    await expect(
      canvas.getByRole("combobox", { name: "Exchange" }),
    ).toHaveValue("");
    await expect(
      canvas.getByLabelText("Fixture Saved Exchange"),
    ).toHaveTextContent("XSWX");
  },
};
export const UnavailableRestoredSelection: Story = {
  args: {
    initialView: {
      q: "Alpine",
      selectedSymbol: "MISSING",
      selectedMic: "XNAS",
    },
    scenario: "missingSelection",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Selection Unavailable"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "8 listings",
    );
    await expect(
      canvas.getByLabelText("Fixture Resolve Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to Results" }),
    );
    await selectListing(canvasElement, "ALP:XNAS");
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
  },
};
export const NavigationRestoresCommittedView: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Security" }),
      "Alpine{Enter}",
    );
    const details = await selectListing(canvasElement, "ALP:XSWX");
    await userEvent.click(details.getByRole("radio", { name: "5Y" }));
    await userEvent.click(
      details.getByRole("button", { name: "Close Details" }),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Fixture Back" }));
    await expect(
      await canvas.findByRole("radio", { name: "5Y" }),
    ).toBeChecked();
    await expect(
      await canvas.findByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    await userEvent.click(canvas.getByRole("button", { name: "Fixture Back" }));
    await expect(canvas.getByRole("radio", { name: "1Y" })).toBeChecked();
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("2");
    await userEvent.click(
      canvas.getByRole("button", { name: "Fixture Forward" }),
    );
    await expect(canvas.getByRole("radio", { name: "5Y" })).toBeChecked();
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("2");
  },
};
export const PendingCounts: Story = {
  args: { scenario: "obsoleteSearch" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(
      await canvas.findByLabelText("Loading Result Count"),
    ).toBeVisible();
    await expect(canvas.getByLabelText("Result Count")).not.toHaveTextContent(
      "0 listings",
    );
    await expect(
      canvas.queryByText("No securities found."),
    ).not.toBeInTheDocument();
    const results = canvas.getByRole("region", { name: "Security Results" });
    await waitFor(() =>
      expect(
        within(results).getAllByTestId("security-result-skeleton").length,
      ).toBeGreaterThan(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(
      within(results).getByRole("columnheader", { name: /^Name/ }),
    ).toBeVisible();
    await expect(
      within(results).queryByText(/Loading\.{3}|Unknown|No securities found/),
    ).not.toBeInTheDocument();
    await expect(results.querySelector(".ag-loading-icon")).toBeNull();
    for (const skeleton of within(results).getAllByTestId(
      "security-result-skeleton",
    ))
      await expect(skeleton).toHaveAttribute("aria-hidden", "true");
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByTestId("fixture-global-progress")).toHaveAttribute(
        "data-mounted",
        "true",
      ),
    );
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
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[0]",
    );
  },
};
export const SwitchClearsDerivedValues: Story = {
  args: { scenario: "switchPending" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XNAS");
    await expect(canvas.getByLabelText("Quote Currency")).toHaveTextContent(
      "USD",
    );
    const details = await selectListing(canvasElement, "ALP:XSWX");
    for (const label of ["Quote Currency", "Security Type", "ISIN"]) {
      await expect(details.getByLabelText(label)).toHaveAttribute(
        "aria-busy",
        "true",
      );
      await expect(details.getByLabelText(label)).not.toHaveTextContent(
        /USD|Unknown|US0000000000/,
      );
    }
    await expect(details.getByLabelText("Loading Price History")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(details.getByLabelText("Quote Currency")).toHaveTextContent("CHF"),
    );
    await expect(details.getByLabelText("ISIN")).toHaveTextContent(
      "CH0000000000",
    );
  },
};
export const UnavailableRestoredPage: Story = {
  args: { initialView: { q: "Alpine", page: 2 } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "This results page is no longer available",
    );
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[20]",
    );
    await userEvent.click(canvas.getByRole("button", { name: "First Page" }));
    await expect(
      await canvas.findByRole("button", { name: "Page 1" }),
    ).toHaveAttribute("data-active");
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[20,0]",
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const PendingPageKeepsSelection: Story = {
  args: { scenario: "pagePending" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await expect(
      details.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    const results = canvas.getByRole("region", { name: "Security Results" });
    await waitFor(() =>
      expect(
        within(results).getAllByTestId("security-result-skeleton").length,
      ).toBeGreaterThan(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(
      within(results).queryByText(/Loading\.{3}|Unknown/),
    ).not.toBeInTheDocument();
    await expect(results.querySelector(".ag-loading-icon")).toBeNull();
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[0,20]",
    );
    await userEvent.click(
      within(results).getAllByTestId("security-result-skeleton")[0]!,
    );
    await expect(
      details.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() => expect(results).toHaveAttribute("aria-busy", "false"));
    await expect(
      within(results).queryAllByTestId("security-result-skeleton"),
    ).toHaveLength(0);
    await expect(
      details.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[0,20]",
    );
  },
};
export const PendingCountsDark: Story = {
  args: { scenario: "obsoleteSearch" },
  parameters: { colorScheme: "dark" },
  play: PendingCounts.play,
};

export const FailedPageRetryKeepsSelection: Story = {
  args: { scenario: "pageError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await userEvent.click(
      await canvas.findByRole("button", { name: "Release Previous Response" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Temporary securities query failure",
    );
    const results = canvas.getByRole("region", { name: "Security Results" });
    await waitFor(() =>
      expect(
        within(results).queryAllByTestId("security-result-skeleton"),
      ).toHaveLength(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "false");
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Results" }),
    );
    await waitFor(() =>
      expect(
        within(results).getAllByTestId("security-result-skeleton").length,
      ).toBeGreaterThan(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "true");
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[0,20,20]",
    );
    await userEvent.click(
      await canvas.findByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() => expect(results).toHaveAttribute("aria-busy", "false"));
    await expect(
      within(results).queryAllByTestId("security-result-skeleton"),
    ).toHaveLength(0);
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      details.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("USD");
    await expect(
      canvas.getByRole("button", { name: /^Page 2$/ }),
    ).toHaveAttribute("data-active");
    await expect(canvas.getByLabelText("Fixture Offsets")).toHaveTextContent(
      "[0,20,20]",
    );
  },
};
