import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { expect, fn, spyOn, userEvent, waitFor, within } from "storybook/test";
import { useAccountReturnBasis } from "@/hooks/use-account-return-basis";
import { AccountsPageHeader } from "@/components/account-management/header";
import { data, ReturnGridExample } from "./return-story-support";
import { AccountReturnSummaryView } from "./return-summary";
import { ReturnBasisSelect } from "./return-basis-select";

const bookId = "return-basis-story";
const otherBookId = "return-basis-story-other";
const storageKey = `cashfolio:returnBasis:${bookId}`;
const noop = fn();

function AccountsView({ accountBookId }: { accountBookId: string }) {
  const { basis, setBasis } = useAccountReturnBasis(accountBookId);
  return (
    <>
      <AccountsPageHeader
        accountBookId={accountBookId}
        tab="BALANCE"
        tabs={[]}
        grouping="accountStructure"
        returnBasis={basis}
        onReturnBasisChange={setBasis}
        onOpenCreateAccount={noop}
        onOpenCreateGroup={noop}
      />
      <ReturnGridExample basis={basis} />
    </>
  );
}

function LedgerView({ accountBookId }: { accountBookId: string }) {
  const { basis, setBasis } = useAccountReturnBasis(accountBookId);
  return (
    <AccountReturnSummaryView
      basis={basis}
      onBasisChange={setBasis}
      data={data}
      loading={false}
      onRetry={noop}
      onViewCalculation={noop}
    />
  );
}

function SessionViews() {
  const [view, setView] = useState<"accounts" | "ledger">("accounts");
  const [book, setBook] = useState(bookId);
  const [mount, setMount] = useState(0);
  return (
    <>
      <Group mb="sm">
        <Button onClick={() => setView("accounts")}>Open Accounts</Button>
        <Button onClick={() => setView("ledger")}>Open Ledger</Button>
        <Button onClick={() => setMount((value) => value + 1)}>
          Reload View
        </Button>
        <Button onClick={() => setBook(otherBookId)}>Use Other Book</Button>
        <Button onClick={() => setBook(bookId)}>Use First Book</Button>
      </Group>
      {view === "accounts" ? (
        <AccountsView key={`${book}:${mount}`} accountBookId={book} />
      ) : (
        <LedgerView key={`${book}:${mount}`} accountBookId={book} />
      )}
    </>
  );
}

const meta = {
  title: "Components/AccountReturns/Basis",
  component: SessionViews,
  beforeEach: () => {
    sessionStorage.removeItem(storageKey);
    sessionStorage.removeItem(`cashfolio:returnBasis:${otherBookId}`);
  },
} satisfies Meta<typeof SessionViews>;
export default meta;
type Story = StoryObj<typeof meta>;

async function chooseBasis(
  canvasElement: HTMLElement,
  name: "Annualized" | "Cumulative",
) {
  await userEvent.click(
    within(canvasElement).getByRole("combobox", { name: "Return Basis" }),
  );
  await userEvent.click(
    await within(document.body).findByRole("option", { name }),
  );
}

export const SharedSessionPreference: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Return Basis" }),
    ).toHaveValue("Annualized");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account/,
      }),
    ).toHaveTextContent("10.00%");
    await chooseBasis(canvasElement, "Cumulative");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account/,
      }),
    ).toHaveTextContent("21.00%");
    await userEvent.click(canvas.getByRole("button", { name: "Reload View" }));
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Return Basis" }),
      ).toHaveValue("Cumulative"),
    );
    await userEvent.click(canvas.getByRole("button", { name: "Open Ledger" }));
    await expect(
      await canvas.findByTestId("account-return-cumulative-twr"),
    ).toHaveTextContent("21.00%");
    await chooseBasis(canvasElement, "Annualized");
    await expect(
      await canvas.findByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("10.00%");
    await userEvent.click(
      canvas.getByRole("button", { name: "Open Accounts" }),
    );
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account/,
      }),
    ).toHaveTextContent("10.00%");
    await chooseBasis(canvasElement, "Cumulative");
    await userEvent.click(
      canvas.getByRole("button", { name: "Use Other Book" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Return Basis" }),
      ).toHaveValue("Annualized"),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Use First Book" }),
    );
    await waitFor(() =>
      expect(
        canvas.getByRole("combobox", { name: "Return Basis" }),
      ).toHaveValue("Cumulative"),
    );
  },
};

export const InvalidPreference: Story = {
  beforeEach: () => sessionStorage.setItem(storageKey, '"unsupported"'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Return Basis" }),
    ).toHaveValue("Annualized");
    await chooseBasis(canvasElement, "Cumulative");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account/,
      }),
    ).toHaveTextContent("21.00%");
  },
};

export const MalformedPreference: Story = {
  ...InvalidPreference,
  beforeEach: () => sessionStorage.setItem(storageKey, "not-json"),
};

export const StorageUnavailable: Story = {
  beforeEach: () => {
    const getItem = Storage.prototype.getItem;
    const setItem = Storage.prototype.setItem;
    const get = spyOn(Storage.prototype, "getItem").mockImplementation(
      function (this: Storage, key: string) {
        if (key.startsWith("cashfolio:returnBasis:"))
          throw new Error("Storage blocked");
        return getItem.call(this, key);
      },
    );
    const set = spyOn(Storage.prototype, "setItem").mockImplementation(
      function (this: Storage, key: string, value: string) {
        if (key.startsWith("cashfolio:returnBasis:"))
          throw new Error("Storage blocked");
        setItem.call(this, key, value);
      },
    );
    return () => {
      get.mockRestore();
      set.mockRestore();
    };
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("combobox", { name: "Return Basis" }),
    ).toHaveValue("Annualized");
    await chooseBasis(canvasElement, "Cumulative");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account/,
      }),
    ).toHaveTextContent("21.00%");
  },
};

function ProgressiveBasisView() {
  const { basis, setBasis } = useAccountReturnBasis(bookId);
  const [complete, setComplete] = useState(false);
  return (
    <>
      <ReturnBasisSelect value={basis} onChange={setBasis} />
      <Button onClick={() => setComplete(true)}>Complete All</Button>
      <ReturnGridExample
        basis={basis}
        loading
        unavailable
        completedIds={
          new Set(complete ? ["a", "group", "__return_total__"] : ["a"])
        }
      />
    </>
  );
}

export const SwitchDuringProgress: Story = {
  render: () => <ProgressiveBasisView />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account \(Annualized\)/,
      }),
    ).toHaveTextContent("—");
    await chooseBasis(canvasElement, "Cumulative");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account \(Cumulative\)/,
      }),
    ).toHaveTextContent("—");
    await expect(
      canvas.getAllByRole("status", { name: "Loading TWR" }),
    ).toHaveLength(2);
    await chooseBasis(canvasElement, "Annualized");
    await expect(
      await canvas.findByRole("button", {
        name: /View TWR calculation for Investment Account \(Annualized\)/,
      }),
    ).toHaveTextContent("—");
    await expect(
      canvas.getAllByRole("status", { name: "Loading TWR" }),
    ).toHaveLength(2);
    await userEvent.click(canvas.getByRole("button", { name: "Complete All" }));
    await waitFor(() =>
      expect(canvas.queryAllByRole("status")).toHaveLength(0),
    );
    await expect(
      canvas.getByRole("button", { name: /View TWR calculation for Group/ }),
    ).toHaveTextContent("10.00%");
  },
};

function ShortInvestmentView() {
  const { basis, setBasis } = useAccountReturnBasis(bookId);
  return (
    <AccountReturnSummaryView
      basis={basis}
      onBasisChange={setBasis}
      data={{
        ...data,
        annualizedTwr: null,
        annualizedMwr: null,
        effectiveStartDate: "2026-12-01",
        effectiveEndDate: "2026-12-31",
      }}
      loading={false}
      onRetry={noop}
      onViewCalculation={noop}
    />
  );
}

export const ShortInvestment: Story = {
  render: () => <ShortInvestmentView />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const value = await canvas.findByTestId("account-return-annualized-twr");
    await expect(value).toHaveTextContent("—");
    await expect(value).toHaveAccessibleName(/365 days.*Switch to Cumulative/);
    await userEvent.hover(value);
    await expect(
      await within(document.body).findByRole("tooltip"),
    ).toHaveTextContent("at least 365 days");
    await userEvent.unhover(value);
    await chooseBasis(canvasElement, "Cumulative");
    await expect(
      await canvas.findByTestId("account-return-cumulative-twr"),
    ).toHaveTextContent("21.00%");
    await chooseBasis(canvasElement, "Annualized");
    await expect(
      await canvas.findByTestId("account-return-annualized-twr"),
    ).toHaveTextContent("—");
  },
};
