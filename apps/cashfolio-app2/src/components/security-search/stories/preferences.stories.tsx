import { Box } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
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
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ControllerHarness>;
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
export const PreferenceHydration: Story = {
  args: { scenario: "preferencePending", savedExchange: "XSWX" },
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
export const RapidPreferenceSaves: Story = {
  args: { scenario: "preferenceRapid" },
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
export const PreferenceSaveRetry: Story = {
  args: { scenario: "preferenceSaveError" },
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
export const PreferenceReadRetry: Story = {
  args: { scenario: "preferenceLoadError", savedExchange: "XSWX" },
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
