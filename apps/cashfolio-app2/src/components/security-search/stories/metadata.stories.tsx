import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { controllerStoryMeta } from "./story-meta";
import {
  serverSideBrowsingView,
  metadataFailureKeepsHistoryView,
  metadataBeforeHistoryView,
  historyBeforeMetadataView,
  isinOnMobileView,
} from "./story-support";
import { selectListing } from "./interaction-helpers";

const meta = { ...controllerStoryMeta, title: "Screens/Securities" };
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedIsin: Story = {
  ...serverSideBrowsingView,
  name: "Selected ISIN Interaction Test",
  tags: ["regression", "!autodocs"],
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
  ...serverSideBrowsingView,
  name: "Missing ISIN Interaction Test",
  tags: ["regression", "!autodocs"],
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
export const MetadataFailureKeepsHistoryPreview: Story = {
  ...metadataFailureKeepsHistoryView,
  name: "Metadata Failure Keeps History",
};

export const MetadataFailureKeepsHistory: Story = {
  ...metadataFailureKeepsHistoryView,
  name: "Metadata Failure Keeps History Interaction Test",
  tags: ["regression", "!autodocs"],
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
export const MetadataBeforeHistoryPreview: Story = {
  ...metadataBeforeHistoryView,
  name: "Metadata Before History",
};

export const MetadataBeforeHistory: Story = {
  ...metadataBeforeHistoryView,
  name: "Metadata Before History Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("US0000000000"),
    );
    await expect(canvas.getByLabelText("Loading Price History")).toBeVisible();
    await waitFor(() =>
      expect(canvas.getByTestId("fixture-global-progress")).toHaveAttribute(
        "data-mounted",
        "true",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(
      () =>
        expect(
          canvas.getByTestId("fixture-global-progress"),
        ).not.toHaveAttribute("data-mounted"),
      { timeout: 2500 },
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
export const HistoryBeforeMetadataPreview: Story = {
  ...historyBeforeMetadataView,
  name: "History Before Metadata",
};

export const HistoryBeforeMetadata: Story = {
  ...historyBeforeMetadataView,
  name: "History Before Metadata Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await waitFor(() =>
      expect(details.getByLabelText("Latest Closing Price")).toHaveTextContent(
        "USD",
      ),
    );
    await expect(details.getByLabelText("ISIN")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(details.getByLabelText("ISIN")).not.toHaveTextContent(
      "Unknown",
    );
    await waitFor(() =>
      expect(canvas.getByTestId("fixture-global-progress")).toHaveAttribute(
        "data-mounted",
        "true",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(
      () =>
        expect(
          canvas.getByTestId("fixture-global-progress"),
        ).not.toHaveAttribute("data-mounted"),
      { timeout: 2500 },
    );
    await waitFor(() =>
      expect(details.getByLabelText("ISIN")).toHaveTextContent("US0000000000"),
    );
  },
};
export const ObsoleteMetadataResponse: Story = {
  ...historyBeforeMetadataView,
  name: "Obsolete Metadata Response Interaction Test",
  tags: ["regression", "!autodocs"],
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
  ...historyBeforeMetadataView,
  name: "Closed Metadata Response Interaction Test",
  tags: ["regression", "!autodocs"],
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
  ...serverSideBrowsingView,
  name: "ISIN Without History Interaction Test",
  tags: ["regression", "!autodocs"],
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
export const IsinOnMobilePreview: Story = {
  ...isinOnMobileView,
  name: "ISIN on Mobile",
};

export const IsinOnMobile: Story = {
  ...isinOnMobileView,
  name: "ISIN on Mobile Interaction Test",
  tags: ["regression", "!autodocs"],
  play: HistoryBeforeMetadata.play,
};

export const NewSearchCancelsMetadata: Story = {
  ...historyBeforeMetadataView,
  name: "New Search Cancels Metadata Interaction Test",
  tags: ["regression", "!autodocs"],
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
