import { Box } from "@mantine/core";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SecuritySearchHarness } from "./harness";
import { selectListing } from "./interaction-helpers";
const meta = {
  title: "Routes/Securities",
  component: SecuritySearchHarness,
  decorators: [
    (Story) => (
      <Box h="100dvh" style={{ display: "flex", flexDirection: "column" }}>
        <Story />
      </Box>
    ),
  ],
  args: { initialSearch: "ready" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SecuritySearchHarness>;
export default meta;
type Story = StoryObj<typeof meta>;
export const InformationalColumns: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "31 listings",
      ),
    );
    const header = canvas.getByRole("columnheader", { name: /^Symbol/ });
    await userEvent.click(header);
    await expect(header).not.toHaveAttribute("aria-sort");
    header.focus();
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(document.querySelector(".ag-filter")).toBeNull();
    await expect(
      canvasElement.querySelector(".ag-header-cell-filter-button"),
    ).toBeNull();
    await expect(canvasElement.querySelector(".ag-floating-filter")).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "Clear Filters" }),
    ).not.toBeInTheDocument();
  },
};
export const PersistentDetails: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("region", { name: "Security Results" });
    const fullWidth = grid.getBoundingClientRect().width;
    const details = await selectListing(canvasElement, "ALP:XNAS");
    await expect(
      details.getByRole("heading", { name: "Alpine Technologies" }),
    ).toHaveFocus();
    await waitFor(() =>
      expect(grid.getBoundingClientRect().width).toBeLessThan(fullWidth),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
    await userEvent.click(
      details.getByRole("button", { name: "Close Details" }),
    );
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    await expect(grid).toHaveFocus();
    await waitFor(() =>
      expect(grid.getBoundingClientRect().width).toBeCloseTo(fullWidth, 0),
    );
  },
};
export const NewSearchResetsGrid: Story = {
  args: { initialSelectedId: "ALP:XNAS" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Harbor{Enter}");
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "4 listings",
      ),
    );
    await expect(
      canvas.getByRole("button", { name: "Page 1" }),
    ).toHaveAttribute("data-active");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "31 listings",
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(
      canvas.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("data-active");
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "Page 1" })).toHaveAttribute(
        "data-active",
      ),
    );
  },
};
export const MobileBrowsingState: Story = {
  globals: { viewport: { value: "cashfolioMobile" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("region", { name: "Security Results" });
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Unsubmitted draft");
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await selectListing(canvasElement, "ORC:XNAS");
    await expect(grid).not.toBeVisible();
    await expect(input).not.toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to Results" }),
    );
    await expect(grid).toBeVisible();
    await expect(input).toHaveValue("Unsubmitted draft");
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "31 listings",
    );
    await expect(
      canvas.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("data-active");
    await waitFor(() =>
      expect(document.activeElement?.closest(".ag-row")).toHaveAttribute(
        "row-id",
        "ORC:XNAS",
      ),
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );
  },
};
