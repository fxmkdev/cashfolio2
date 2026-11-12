import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { UserLocaleProvider } from "@/user-locale-context";
import { SecuritySearchHarness } from "./harness";

const meta = {
  title: "Prototypes/Security Search",
  component: SecuritySearchHarness,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component: `Frontend-only UX prototype. All listings, symbol/exchange combinations and prices are illustrative local fixtures, not live Marketstack data or verified coverage.

Open **Prototypes / Security Search / Default**. Select Search with an empty query to browse all sample listings, or enter a name/symbol and optionally choose an exchange. Changes apply only on Search or Enter. Select a grid row (click, or focus a cell and press Space) to open details below. Explore price ranges and Copy Symbol. Page changes and new searches clear selection; sorting retains it.

No routes, account creation, backend, persistence or provider connections are included. Loading/error stories are fixed scenarios; Retry Search and Retry Price History recover locally. Clipboard feedback is simulated in the copy-specific stories. Other stories use the browser clipboard.

Run locally with Node 26: pnpm --filter cashfolio-app2 storybook.`,
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<typeof SecuritySearchHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

async function selectListing(canvasElement: HTMLElement, id: string) {
  // Row IDs disambiguate the same symbol/name on multiple exchanges in AG Grid.
  let cell: HTMLElement | null = null;
  await waitFor(() => {
    cell = canvasElement.querySelector(`[row-id="${id}"] [col-id="name"]`);
    expect(cell).toBeVisible();
  });
  await userEvent.click(cell!);
  return within(
    await within(canvasElement).findByRole("region", {
      name: "Security Details",
    }),
  );
}

export const Default: Story = {};

export const SearchAndFilter: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(/Search by name or symbol, or select Search/),
    ).toBeVisible();
    const input = canvas.getByRole("textbox", {
      name: "Security",
    });
    await userEvent.type(input, "  aLpInE  ");
    await expect(
      canvas.queryByLabelText("Submitted Search"),
    ).not.toBeInTheDocument();
    await userEvent.keyboard("{Enter}");
    await expect(canvas.getByLabelText("Submitted Search")).toHaveTextContent(
      "Results for “aLpInE”",
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("8 listings");
    await userEvent.clear(input);
    await userEvent.type(input, "Harbor");
    await expect(canvas.getByRole("status")).toHaveTextContent("8 listings");
    await expect(canvas.getByLabelText("Submitted Search")).toHaveTextContent(
      "aLpInE",
    );
    const exchange = canvas.getByRole("combobox", {
      name: "Exchange",
    });
    await userEvent.click(exchange);
    await userEvent.type(exchange, "Swiss");
    await userEvent.click(
      await within(document.body).findByRole("option", {
        name: "SIX Swiss Exchange (XSWX)",
      }),
    );
    await expect(canvas.getByRole("status")).toHaveTextContent("8 listings");
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("1 listing");
    const details = await selectListing(canvasElement, "HBR:XSWX");
    await expect(
      details.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    await userEvent.clear(input);
    await userEvent.type(input, "ced");
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
  },
};

export const BrowseAndSelect: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(canvas.getByRole("status")).toHaveTextContent("31 listings");
    const details = await selectListing(canvasElement, "ALP:XSWX");
    await expect(details.getByText("XSWX", { exact: true })).toBeVisible();
    await expect(
      details.getByRole("img", {
        name: "Alpine Technologies closing price chart",
      }),
    ).toBeVisible();
    await userEvent.click(
      canvas.getByRole("columnheader", { name: /^Symbol/ }),
    );
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /Next page/i }));
    await expect(
      canvas.queryByRole("region", { name: "Security Details" }),
    ).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        canvasElement.querySelectorAll('.ag-row[row-index="20"]'),
      ).not.toHaveLength(0),
    );
  },
};

export const SelectedListing: Story = {
  args: { initialSearch: "ready", initialSelectedId: "ALP:XNAS" },
  parameters: { colorScheme: "light" },
};

export const ChartAndCopy: Story = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    copySymbol: fn().mockResolvedValue(undefined),
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const details = within(
      canvas.getByRole("region", { name: "Security Details" }),
    );
    await expect(details.getByRole("radio", { name: "1Y" })).toBeChecked();
    const yearPeriod = details.getByLabelText("Chart Period").textContent!;
    await userEvent.click(details.getByText("1M", { exact: true }));
    await expect(details.getByRole("radio", { name: "1M" })).toBeChecked();
    await expect(details.getByLabelText("Chart Period")).not.toHaveTextContent(
      yearPeriod,
    );
    await userEvent.click(details.getByText("5Y", { exact: true }));
    await expect(details.getByRole("radio", { name: "5Y" })).toBeChecked();
    await userEvent.click(details.getByRole("button", { name: "Copy Symbol" }));
    await expect(args.copySymbol).toHaveBeenCalledWith("ALP");
    await expect(details.getByRole("status")).toHaveTextContent(
      "Symbol copied.",
    );
  },
};

export const KeyboardSelection: Story = {
  args: { initialSearch: "ready", initialQuery: "ALP" },
  play: async ({ canvasElement }) => {
    let cell: HTMLElement | null = null;
    await waitFor(() => {
      cell = canvasElement.querySelector('[row-id="ALP:XNAS"] [col-id="name"]');
      expect(cell).toBeVisible();
    });
    cell!.focus();
    await userEvent.keyboard(" ");
    await expect(
      await within(canvasElement).findByRole("region", {
        name: "Security Details",
      }),
    ).toBeVisible();
  },
};

export const NoResults: Story = {
  args: { initialSearch: "ready", initialQuery: "No matching security" },
};

export const SearchLoading: Story = {
  args: { initialSearch: "loading", initialQuery: "Alpine" },
};

export const SearchError: Story = {
  args: { initialSearch: "error", initialQuery: "Alpine" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Retry Search" }));
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(canvas.getByRole("status")).toHaveTextContent("8 listings");
  },
};

export const ChartLoading: Story = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    initialHistory: "loading",
  },
};

export const ChartError: Story = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    initialHistory: "error",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Price History" }),
    );
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
    await expect(
      canvas.getByRole("img", { name: /closing price chart/ }),
    ).toBeVisible();
  },
};

export const UnavailableHistory: Story = {
  args: {
    initialSearch: "ready",
    initialQuery: "ARCH",
    initialSelectedId: "ARCH:XNAS",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText(
        "Historical prices are unavailable for this listing. You can still copy its symbol.",
      ),
    ).toBeVisible();
    await expect(
      canvas.getByRole("button", { name: "Copy Symbol" }),
    ).toBeEnabled();
    await expect(
      canvas.queryByRole("img", { name: /closing price chart/ }),
    ).not.toBeInTheDocument();
  },
};

export const UnknownCurrency: Story = {
  args: {
    initialSearch: "ready",
    initialQuery: "MYST",
    initialSelectedId: "MYST:XLON",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Currency Unknown", { exact: true }),
    ).toBeVisible();
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).not.toHaveTextContent(/GBP|USD|CHF|EUR/);
  },
};

export const MissingMetadata: Story = {
  args: {
    initialSearch: "ready",
    initialQuery: "OLD",
    initialSelectedId: "OLD:unknown",
  },
};

export const CopyFailure: Story = {
  args: {
    initialSearch: "ready",
    initialSelectedId: "ALP:XNAS",
    copySymbol: async () => {
      throw new Error("Clipboard unavailable");
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Copy Symbol" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Could not copy the symbol.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Copy Symbol" }));
    await expect(
      canvas.getByRole("button", { name: "Copy Symbol" }),
    ).toBeEnabled();
  },
};

export const NarrowViewport: Story = {
  args: { initialSearch: "ready", initialSelectedId: "RIV:XETR" },
  parameters: { viewport: { defaultViewport: "cashfolioMobile" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("img", { name: /closing price chart/ }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
        window.innerWidth,
      ),
    );
    const viewport =
      canvasElement.querySelector<HTMLElement>(".ag-grid-viewport")!;
    await waitFor(() =>
      expect(viewport.scrollWidth).toBeGreaterThan(viewport.clientWidth),
    );
  },
};

export const DarkTheme: Story = {
  args: { initialSearch: "ready", initialSelectedId: "HBR:XSWX" },
  parameters: { colorScheme: "dark" },
};

export const SwissLocale: Story = {
  args: { initialSearch: "ready", initialSelectedId: "HBR:XSWX" },
  decorators: [
    (Story) => (
      <UserLocaleProvider locale="de-CH">
        <Story />
      </UserLocaleProvider>
    ),
  ],
};
