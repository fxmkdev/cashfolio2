import { expect, it, vi } from "vitest";
import { AccountOrganizeDialogs } from "./organize";
import type { AccountsPageViewProps } from "../view-types";
import type { Organizer } from "@/components/hierarchy-organize/use-organizer";

it.each(["account", "accountGroup"] as const)(
  "routes a retained %s edit through canonical organizer recovery",
  async (nodeType) => {
    const save = vi.fn(async () => {});
    const performEdit = vi.fn(async (operation: () => Promise<void>) =>
      operation(),
    );
    const organizer = {
      performEdit,
      refresh: vi.fn(),
      submitState: {},
      pending: false,
    } as unknown as Organizer;
    const props = {
      editingAccount: { id: "account" },
      editingGroup: { id: "group" },
      onSubmitUpdateAccount: save,
      onSubmitUpdateGroup: save,
    } as unknown as AccountsPageViewProps;
    const element = AccountOrganizeDialogs({ props, organizer });
    const values = { name: "Retained draft" };
    if (nodeType === "account")
      await element.props.onSubmitUpdateAccount(values);
    else await element.props.onSubmitUpdateGroup(values);
    expect(save).toHaveBeenCalledExactlyOnceWith(values);
    expect(performEdit).toHaveBeenCalledWith(expect.any(Function), {
      id: nodeType === "account" ? "account" : "group",
      nodeType,
    });
  },
);
