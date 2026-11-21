import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { controllerStoryMeta } from "./story-meta";
import {
  preferenceHydrationView,
  rapidPreferenceSavesView,
  preferenceSaveRetryView,
  preferenceReadRetryView,
} from "./story-support";

const meta = { ...controllerStoryMeta, title: "Screens/Securities" };
export default meta;
type Story = StoryObj<typeof meta>;
async function chooseExchange(canvasElement: HTMLElement, name: string) {
  const exchange = within(canvasElement).getByRole("combobox", {
    name: "Exchange",
  });
  await userEvent.click(exchange);
  await userEvent.clear(exchange);
  await userEvent.type(exchange, name);
  await userEvent.click(
    await within(document.body).findByRole("option", {
      name: new RegExp(name),
    }),
  );
}
export const PreferenceHydrationPreview: Story = {
  ...preferenceHydrationView,
  name: "Preference Hydration",
};

export const PreferenceHydration: Story = {
  ...preferenceHydrationView,
  name: "Preference Hydration Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("Loading Exchange Preference"),
    ).toBeVisible();
    await expect(canvas.getByRole("button", { name: "Search" })).toBeDisabled();
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Security" }),
      "Alpine",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("combobox", { name: "Exchange" })).toHaveValue(
        "SIX Swiss Exchange (XSWX)",
      ),
    );
    await expect(canvas.getByRole("textbox", { name: "Security" })).toHaveValue(
      "Alpine",
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Exchange" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Fixture Saved Exchange")).toHaveTextContent(
        "All",
      ),
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
  },
};
export const RapidPreferenceSavesPreview: Story = {
  ...rapidPreferenceSavesView,
  name: "Rapid Preference Saves",
};

export const RapidPreferenceSaves: Story = {
  ...rapidPreferenceSavesView,
  name: "Rapid Preference Saves Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseExchange(canvasElement, "Swiss");
    await chooseExchange(canvasElement, "NASDAQ");
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Exchange" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Fixture Saved Exchange")).toHaveTextContent(
        "All",
      ),
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
  },
};
export const PreferenceSaveRetryPreview: Story = {
  ...preferenceSaveRetryView,
  name: "Preference Save Retry",
};

export const PreferenceSaveRetry: Story = {
  ...preferenceSaveRetryView,
  name: "Preference Save Retry Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await chooseExchange(canvasElement, "Swiss");
    await expect(
      await canvas.findByText("Exchange Preference Not Saved"),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "7 listings",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Saving Preference" }),
    );
    await waitFor(() =>
      expect(canvas.getByLabelText("Fixture Saved Exchange")).toHaveTextContent(
        "XSWX",
      ),
    );
    await expect(
      canvas.queryByText("Exchange Preference Not Saved"),
    ).not.toBeInTheDocument();
  },
};
export const PreferenceReadRetryPreview: Story = {
  ...preferenceReadRetryView,
  name: "Preference Read Retry",
};

export const PreferenceReadRetry: Story = {
  ...preferenceReadRetryView,
  name: "Preference Read Retry Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText("Exchange Preference Unavailable"),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Preference" }),
    );
    await waitFor(() =>
      expect(canvas.getByRole("combobox", { name: "Exchange" })).toHaveValue(
        "SIX Swiss Exchange (XSWX)",
      ),
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
  },
};
