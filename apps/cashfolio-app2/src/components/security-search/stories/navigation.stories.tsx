import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { controllerStoryMeta } from "./story-meta";
import {
  restorePageAndSelectionView,
  unavailableRestoredSelectionView,
  serverSideBrowsingView,
  unavailableRestoredPageView,
} from "./story-support";
import { selectListing } from "./interaction-helpers";

const meta = { ...controllerStoryMeta, title: "Screens/Securities" };
export default meta;
type Story = StoryObj<typeof meta>;

export const RestorePageAndSelectionPreview: Story = {
  ...restorePageAndSelectionView,
  name: "Restore Page and Selection",
};

export const RestorePageAndSelection: Story = {
  ...restorePageAndSelectionView,
  name: "Restore Page and Selection Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const UnavailableRestoredSelectionPreview: Story = {
  ...unavailableRestoredSelectionView,
  name: "Unavailable Restored Selection",
};

export const UnavailableRestoredSelection: Story = {
  ...unavailableRestoredSelectionView,
  name: "Unavailable Restored Selection Interaction Test",
  tags: ["regression", "!autodocs"],
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
  ...serverSideBrowsingView,
  name: "Navigation Restores Committed View Interaction Test",
  tags: ["regression", "!autodocs"],
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

export const UnavailableRestoredPagePreview: Story = {
  ...unavailableRestoredPageView,
  name: "Unavailable Restored Page",
};

export const UnavailableRestoredPage: Story = {
  ...unavailableRestoredPageView,
  name: "Unavailable Restored Page Interaction Test",
  tags: ["regression", "!autodocs"],
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
