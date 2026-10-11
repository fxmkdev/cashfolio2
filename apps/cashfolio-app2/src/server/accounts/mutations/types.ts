import { type AccountInput, type AccountGroupInput } from "../accounts-types";

export type AccountMutationOperationResult<T = undefined> = {
  data: T;
  invalidatePeriodCache: boolean;
};

export type AccountUpdateInput = AccountInput & {
  id: string;
};

export type AccountGroupUpdateInput = AccountGroupInput & {
  id: string;
};

export type AccountBookNodeIdInput = {
  id: string;
  accountBookId: string;
};

export type ReorderAccountTreeItemsInput = {
  accountBookId: string;
  updates: {
    id: string;
    nodeType: "account" | "accountGroup";
    sortOrder: number;
  }[];
};
