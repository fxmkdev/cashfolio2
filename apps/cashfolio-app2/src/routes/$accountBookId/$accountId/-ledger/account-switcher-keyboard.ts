import type { ComboboxStore } from "@mantine/core";
import type { KeyboardEvent } from "react";
import type { getLedgerAccountSwitcherOptions } from "./account-switcher-options";

type KeyboardOptions = {
  accountId: string;
  accountIds: Set<string>;
  query: string;
  options: ReturnType<typeof getLedgerAccountSwitcherOptions>;
  highlightedValue: string | null;
  setHighlightedValue: (value: string | null) => void;
  combobox: ComboboxStore;
  activate: (value: string) => void;
  toggleExpanded: (value: string) => void;
};

export function handleAccountSwitcherKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  state: KeyboardOptions,
) {
  if (event.nativeEvent.isComposing) return;
  const { options, combobox, highlightedValue, setHighlightedValue } = state;
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    if (event.key === "ArrowDown" && highlightedValue === null) {
      const first = options.find(({ node }) =>
        state.accountIds.has(node.value),
      );
      const current =
        !state.query.trim() &&
        options.find(({ node }) => node.value === state.accountId);
      setHighlightedValue((current || first)?.node.value ?? null);
    } else {
      if (event.key === "ArrowDown") combobox.selectNextOption();
      else combobox.selectPreviousOption();
      setHighlightedValue(
        options[combobox.getSelectedOptionIndex()]?.node.value ?? null,
      );
    }
    return;
  }
  const current = options.find(({ node }) => node.value === highlightedValue);
  if (!current) return;
  if (event.key === "Enter") {
    event.preventDefault();
    state.activate(current.node.value);
  } else if (
    event.key === "ArrowRight" &&
    current.hasChildren &&
    !current.expanded
  ) {
    event.preventDefault();
    state.toggleExpanded(current.node.value);
  } else if (event.key === "ArrowLeft") {
    if (current.hasChildren && current.expanded) {
      event.preventDefault();
      state.toggleExpanded(current.node.value);
    } else if (current.parent) {
      event.preventDefault();
      setHighlightedValue(current.parent);
    }
  }
}
