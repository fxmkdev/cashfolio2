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

export const SelectedIsin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("0");
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Security" }),
      "Alpine",
    );
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("0");
    const details = await selectListing(canvasElement, "ALP:XSWX");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("CH0000000000"),
    );
    await userEvent.click(details.getByRole("radio", { name: "5Y" }));
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
  },
};
export const MissingIsin: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Security" }),
      "MYST{Enter}",
    );
    const details = await selectListing(canvasElement, "MYST:XLON");
    await expect(details.getByLabelText("ISIN")).toHaveTextContent("Unknown");
    await expect(
      details.getByRole("img", { name: /closing price chart/ }),
    ).toBeVisible();
  },
};
export const MetadataFailureKeepsHistory: Story = {
  args: { scenario: "metadataError" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "USD",
      ),
    );
    await expect(details.getByLabelText("ISIN")).toHaveTextContent("Unknown");
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      details.getByRole("button", { name: "Copy Symbol" }),
    ).toBeEnabled();
  },
};
export const MetadataBeforeHistory: Story = {
  args: { scenario: "metadataFirst" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("US0000000000"),
    );
    await expect(canvas.getByText("Loading price history…")).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(details.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "USD",
      ),
    );
    await expect(details.getByLabelText("ISIN")).toHaveTextContent(
      "US0000000000",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(details.getByLabelText("ISIN")).toHaveTextContent(
      "US0000000000",
    );
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
  },
};
export const HistoryBeforeMetadata: Story = {
  args: { scenario: "metadataLate" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "USD",
      ),
    );
    await expect(details.getByLabelText("ISIN")).toHaveTextContent("Unknown");
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("US0000000000"),
    );
  },
};
export const ObsoleteMetadataResponse: Story = {
  args: { scenario: "metadataLate" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XNAS");
    const details = await selectListing(canvasElement, "ALP:XSWX");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("CH0000000000"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(details.getByLabelText("ISIN")).toHaveTextContent(
      "CH0000000000",
    );
  },
};
export const ClosedMetadataResponse: Story = {
  args: { scenario: "metadataLate" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await userEvent.click(
      details.getByRole("button", { name: "Close Details" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
  },
};
export const IsinWithoutHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Security" }),
      "ARCH{Enter}",
    );
    const details = await selectListing(canvasElement, "ARCH:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("US0000000000"),
    );
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    await expect(
      canvas.getByLabelText("Fixture Metadata Requests"),
    ).toHaveTextContent("1");
  },
};
export const IsinOnMobile: Story = {
  globals: { viewport: { value: "cashfolioMobile" } },
  play: HistoryBeforeMetadata.play,
  args: { scenario: "metadataLate" },
};

export const NewSearchCancelsMetadata: Story = {
  args: { scenario: "metadataLate" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XNAS");
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    const details = await selectListing(canvasElement, "ALP:XSWX");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("CH0000000000"),
    );
  },
};
