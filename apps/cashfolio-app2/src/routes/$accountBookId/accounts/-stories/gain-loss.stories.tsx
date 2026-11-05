import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountType } from "@/.prisma-client/enums";
import { UserLocaleProvider } from "@/user-locale-context";
import { createGroupRow, createAccountRow } from "./fixtures";
import { openGainLossDetails } from "./interaction-helpers";
import { AccountsPageStoryHarness } from "./harness";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { AccountsPageView } from "../-page-view";
const meta: Meta<typeof AccountsPageView> = {
  title: "Routes/AccountsPageView",
  component: AccountsPageView,
};
export default meta;
type Story = StoryObj<typeof meta>;
export const GainLossFailure: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="error" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.queryByText("Dates unavailable")).not.toBeInTheDocument();
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Dates unavailable");
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Retry" }));
    const readyDetails = await openGainLossDetails(canvasElement);
    expect(readyDetails).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    expect(canvas.queryByText("Gain/Loss Unavailable")).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};

export const GainLossPartial: Story = {
  render: () => (
    <AccountsPageStoryHarness initialMode="active" gainLossState="partial" />
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1/1/2026 · As of 3/31/2026");
    await userEvent.keyboard("{Escape}");
  },
};

export const SignedLiabilityBalances: Story = {
  render: () => (
    <AccountsPageStoryHarness
      initialMode="active"
      initialTab="BALANCE"
      expandGroups
      rowsOverride={[
        {
          ...createGroupRow({
            id: "cards",
            name: "Credit Cards",
            type: AccountType.BALANCE,
            isActive: true,
            sortOrder: 0,
          }),
          // Group balances are computed by the controller before rendering.
          balanceInReferenceCurrency: -75,
        },
        createAccountRow({
          id: "card-debt",
          name: "Outstanding Debt",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 0,
          currency: "CHF",
          balance: -100,
          balanceInReferenceCurrency: -100,
        }),
        createAccountRow({
          id: "card-credit",
          name: "Overpaid Card",
          groupId: "cards",
          type: AccountType.BALANCE,
          isActive: true,
          sortOrder: 1,
          currency: "CHF",
          balance: 25,
          balanceInReferenceCurrency: 25,
        }),
      ]}
    />
  ),
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        canvasElement.querySelector(
          '[row-id="card-debt"] [col-id="balanceInReferenceCurrency"]',
        ),
      ).toHaveTextContent("-100.00"),
    );
    await expect(
      canvasElement.querySelector(
        '[row-id="card-credit"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("25.00");
    await expect(
      canvasElement.querySelector(
        '[row-id="cards"] [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
    await expect(
      canvasElement.querySelector(
        '.ag-row-pinned [col-id="balanceInReferenceCurrency"]',
      ),
    ).toHaveTextContent("-75.00");
  },
};

export const LocalizedLiabilityGainLoss: Story = {
  render: () => (
    <UserLocaleProvider locale="de-CH">
      <AccountsPageStoryHarness initialMode="active" initialTab="BALANCE" />
    </UserLocaleProvider>
  ),
  play: async ({ canvasElement }) => {
    const details = await openGainLossDetails(canvasElement);
    expect(details).toHaveTextContent("Since 1.1.2026 · As of 31.3.2026");
    await userEvent.keyboard("{Escape}");
  },
};
