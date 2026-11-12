import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { SecuritySearchHarness } from "./harness";
import {
  selectListing,
  setListFilter,
  setTextFilter,
} from "./interaction-helpers";

const meta = {
  title: "Prototypes/Security Search",
  component: SecuritySearchHarness,
  args: { initialSearch: "ready" },
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SecuritySearchHarness>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GridFilters: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const count = canvas.getByRole("status", { name: "Result Count" });
    await expect(
      canvas.queryByRole("columnheader", { name: /^MIC/ }),
    ).not.toBeInTheDocument();
    await expect(
      (await canvas.findAllByText("NASDAQ (XNAS)", { exact: true }))[0],
    ).toBeVisible();
    await setTextFilter(canvasElement, "name", "Alpine");
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 8 of 31 listings"),
    );
    await setTextFilter(canvasElement, "symbol", "ALPN");
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 4 of 31 listings"),
    );
    await setListFilter(canvasElement, "exchange", [
      "SIX Swiss Exchange (XSWX)",
    ]);
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 1 of 31 listings"),
    );
    await setListFilter(canvasElement, "country", ["Switzerland"]);
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 1 of 31 listings"),
    );
    await expect(
      canvas.getByRole("button", { name: "Next Page" }),
    ).toBeDisabled();
    await setListFilter(canvasElement, "hasHistory", ["Unavailable"]);
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 0 of 31 listings"),
    );
    await expect(
      await canvas.findByText("No listings match the grid filters."),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Clear Filters" }),
    );
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 31 of 31 listings"),
    );
    await expect(
      canvas.queryByText("No securities found."),
    ).not.toBeInTheDocument();
    await setListFilter(canvasElement, "country", ["Unknown"]);
    await waitFor(() =>
      expect(count).toHaveTextContent("Showing 1 of 31 listings"),
    );
    await selectListing(canvasElement, "OLD:unknown");
    const details = within(
      canvas.getByRole("region", { name: "Security Details" }),
    );
    await expect(
      details.getAllByText("Unknown", { exact: true }).length,
    ).toBeGreaterThan(0);
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
    await userEvent.click(
      within(canvas.getByRole("columnheader", { name: /^Symbol/ })).getByText(
        "Symbol",
        { exact: true },
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
    await setListFilter(canvasElement, "country", ["Switzerland"]);
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 7 of 31 listings",
      ),
    );
    await expect(
      details.getByRole("heading", { name: "Alpine Technologies" }),
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
    await expect(
      canvas.getByRole("button", { name: "Clear Filters" }),
    ).toBeVisible();
  },
};

export const NewSearchResetsGrid: Story = {
  args: { initialSelectedId: "ALP:XNAS" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await setListFilter(canvasElement, "hasHistory", ["Available"]);
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 29 of 31 listings",
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Harbor{Enter}");
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 4 of 4 listings",
      ),
    );
    await expect(
      canvas.queryByRole("button", { name: "Clear Filters" }),
    ).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Page 1" }),
    ).toHaveAttribute("data-active");
    await userEvent.clear(input);
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 31 of 31 listings",
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
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const grid = canvas.getByRole("region", { name: "Security Results" });
    await setListFilter(canvasElement, "hasHistory", ["Available"]);
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "Showing 29 of 31 listings",
      ),
    );
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Unsubmitted draft");
    canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!.scrollLeft =
      0;
    await waitFor(() =>
      expect(
        canvas.getByRole("columnheader", { name: /^Symbol/ }),
      ).toBeVisible(),
    );
    await userEvent.click(
      within(canvas.getByRole("columnheader", { name: /^Symbol/ })).getByText(
        "Symbol",
        { exact: true },
      ),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    let row: HTMLElement | null = null;
    await waitFor(() => {
      row = canvasElement.querySelector('.ag-row[row-index="20"]');
      expect(row).toBeVisible();
    });
    const id = row!.getAttribute("row-id")!;
    await selectListing(canvasElement, id);
    await expect(grid).not.toBeVisible();
    await expect(input).not.toBeVisible();
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Back to Results" }),
    );
    await expect(grid).toBeVisible();
    await expect(input).toHaveValue("Unsubmitted draft");
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "Showing 29 of 31 listings",
    );
    await expect(
      canvas.getByRole("button", { name: "Page 2" }),
    ).toHaveAttribute("data-active");
    await expect(
      canvas.getByRole("columnheader", { name: /^Symbol/ }),
    ).toHaveAttribute("aria-sort", "ascending");
    await waitFor(() =>
      expect(document.activeElement?.closest(".ag-row")).toHaveAttribute(
        "row-id",
        id,
      ),
    );
    await expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth,
    );
  },
};
