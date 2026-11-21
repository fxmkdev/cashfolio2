import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { controllerStoryMeta } from "./story-meta";
import {
  obsoleteHistoryResponseView,
  selectedHistoryRetryView,
  partialPriceHistoryView,
  partialPriceHistoryDarkView,
  partialPriceHistoryMobileView,
  unusablePriceHistoryView,
  historyRetryCooldownView,
} from "./story-support";
import { selectListing } from "./interaction-helpers";

const meta = { ...controllerStoryMeta, title: "Screens/Securities" };
export default meta;
type Story = StoryObj<typeof meta>;

export const ObsoleteHistoryResponsePreview: Story = {
  ...obsoleteHistoryResponseView,
  name: "Obsolete History Response",
};

export const ObsoleteHistoryResponse: Story = {
  ...obsoleteHistoryResponseView,
  name: "Obsolete History Response Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const SelectedHistoryRetryPreview: Story = {
  ...selectedHistoryRetryView,
  name: "Selected History Retry",
};

export const SelectedHistoryRetry: Story = {
  ...selectedHistoryRetryView,
  name: "Selected History Retry Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const PartialPriceHistoryPreview: Story = {
  ...partialPriceHistoryView,
  name: "Partial Price History",
};

export const PartialPriceHistory: Story = {
  ...partialPriceHistoryView,
  name: "Partial Price History Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const PartialPriceHistoryDarkPreview: Story = {
  ...partialPriceHistoryDarkView,
  name: "Partial Price History Dark",
};

export const PartialPriceHistoryDark: Story = {
  ...partialPriceHistoryDarkView,
  name: "Partial Price History Dark Interaction Test",
  tags: ["regression", "!autodocs"],
  play: PartialPriceHistory.play,
};

export const PartialPriceHistoryMobilePreview: Story = {
  ...partialPriceHistoryMobileView,
  name: "Partial Price History Mobile",
};

export const PartialPriceHistoryMobile: Story = {
  ...partialPriceHistoryMobileView,
  name: "Partial Price History Mobile Interaction Test",
  tags: ["regression", "!autodocs"],
  play: PartialPriceHistory.play,
};

export const UnusablePriceHistoryPreview: Story = {
  ...unusablePriceHistoryView,
  name: "Unusable Price History",
};

export const UnusablePriceHistory: Story = {
  ...unusablePriceHistoryView,
  name: "Unusable Price History Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const HistoryRetryCooldownPreview: Story = {
  ...historyRetryCooldownView,
  name: "History Retry Cooldown",
};

export const HistoryRetryCooldown: Story = {
  ...historyRetryCooldownView,
  name: "History Retry Cooldown Interaction Test",
  tags: ["regression", "!autodocs"],
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
