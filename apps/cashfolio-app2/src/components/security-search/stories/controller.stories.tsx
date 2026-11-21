import type { StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { controllerStoryMeta } from "./story-meta";
import {
  serverSideBrowsingView,
  resultsRequestErrorView,
  obsoleteSearchResponseView,
  exchangeDirectoryRetryView,
} from "./story-support";
import { selectListing } from "./interaction-helpers";

const meta = { ...controllerStoryMeta, title: "Screens/Securities" };
export default meta;
type Story = StoryObj<typeof meta>;

export const ControllerDefault: Story = {
  ...serverSideBrowsingView,
  name: "Controller Default",
};

export const ServerSideBrowsing: Story = {
  ...serverSideBrowsingView,
  name: "Server Side Browsing Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await selectListing(canvasElement, "ALP:XSWX");
    await expect(
      canvas.getByLabelText("Latest Closing Price"),
    ).toHaveTextContent("CHF");
    const period = canvas.getByLabelText("Chart Period").textContent!;
    await userEvent.click(canvas.getByRole("radio", { name: "5Y" }));
    await expect(canvas.getByLabelText("Chart Period")).not.toHaveTextContent(
      period,
    );
    await userEvent.click(canvas.getByRole("button", { name: "Next Page" }));
    await expect(
      canvas.getByRole("region", { name: "Security Details" }),
    ).toBeVisible();
  },
};

export const ResultsRequestErrorPreview: Story = {
  ...resultsRequestErrorView,
  name: "Results Request Error",
};

export const ResultsRequestError: Story = {
  ...resultsRequestErrorView,
  name: "Results Request Error Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Temporary securities query failure",
    );
    const results = canvas.getByRole("region", { name: "Security Results" });
    await expect(results).toHaveAttribute("aria-busy", "false");
    await waitFor(() =>
      expect(
        within(results).queryAllByTestId("security-result-skeleton"),
      ).toHaveLength(0),
    );
    await expect(
      within(results).queryByText(/Loading\.{3}|ERR/),
    ).not.toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Results" }),
    );
    await waitFor(() =>
      expect(
        within(results).getAllByTestId("security-result-skeleton").length,
      ).toBeGreaterThan(0),
    );
    await expect(results).toHaveAttribute("aria-busy", "true");
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
    await expect(canvas.queryByRole("alert")).not.toBeInTheDocument();
  },
};

export const ObsoleteSearchResponsePreview: Story = {
  ...obsoleteSearchResponseView,
  name: "Obsolete Search Response",
};

export const ObsoleteSearchResponse: Story = {
  ...obsoleteSearchResponseView,
  name: "Obsolete Search Response Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", {
      name: "Security",
    });
    await userEvent.type(input, "Alpine{Enter}");
    await expect(
      await canvas.findByRole("button", { name: "Release Previous Response" }),
    ).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Harbor{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "4 listings",
      ),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Release Previous Response" }),
    );
    await expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
      "4 listings",
    );
    await expect(canvas.getByLabelText("Submitted Search")).toHaveTextContent(
      "Harbor",
    );
  },
};

export const ExchangeDirectoryRetryPreview: Story = {
  ...exchangeDirectoryRetryView,
  name: "Exchange Directory Retry",
};

export const ExchangeDirectoryRetry: Story = {
  ...exchangeDirectoryRetryView,
  name: "Exchange Directory Retry Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("combobox", { name: "Exchange" }));
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "Exchange names could not be loaded",
    );
    await userEvent.keyboard("{Escape}");
    await userEvent.click(
      canvas.getByRole("button", { name: "Retry Exchanges" }),
    );
    await waitFor(() =>
      expect(canvas.queryByRole("alert")).not.toBeInTheDocument(),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "31 listings",
      ),
    );
  },
};

export const ExplicitDiscoveryRequests: Story = {
  ...serverSideBrowsingView,
  name: "Explicit Discovery Requests Interaction Test",
  tags: ["regression", "!autodocs"],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("0");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    const input = canvas.getByRole("textbox", { name: "Security" });
    await userEvent.type(input, "Alpine");
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    const exchange = canvas.getByRole("combobox", { name: "Exchange" });
    await userEvent.click(exchange);
    await userEvent.type(exchange, "Swiss");
    await userEvent.click(
      await within(document.body).findByRole("option", {
        name: "SIX Swiss Exchange (XSWX)",
      }),
    );
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(input);
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(canvas.getByLabelText("Result Count")).toHaveTextContent(
        "2 listings",
      ),
    );
    await expect(
      canvas.getByLabelText("Fixture Search Requests"),
    ).toHaveTextContent("1");
    await expect(
      canvas.getByLabelText("Fixture History Requests"),
    ).toHaveTextContent("0");
    await userEvent.click(exchange);
    await userEvent.keyboard("{Escape}");
    await expect(
      canvas.getByLabelText("Fixture Exchange Requests"),
    ).toHaveTextContent("1");
  },
};
