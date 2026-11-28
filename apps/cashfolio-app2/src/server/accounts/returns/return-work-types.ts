import type {
  AccountReturnDetails,
  AccountReturnScope,
  AccountReturnSummaries,
  AccountReturnTarget,
  AccountReturnWorkResponse,
} from "../../../shared/accounts/account-returns";
import type { ReturnPlan } from "./return-plan.server";
import type { ReturnInputs } from "./return-engine.server";
import type {
  ReturnWorkState,
  returnWorkStore,
} from "./return-work-store.server";
export type ReturnWorkArgs = AccountReturnScope & {
  continuation?: string;
  batchSize?: number;
  target?: AccountReturnTarget;
  period?: string;
  includeDetails?: boolean;
};
export type ReturnWorkResponse = AccountReturnWorkResponse<
  AccountReturnSummaries | AccountReturnDetails
>;
export type ReturnWorkContext = Pick<
  ReturnWorkState,
  "binding" | "context" | "revision" | "asOfDate" | "publication"
>;
export type ReturnWorkStore = Awaited<ReturnType<typeof returnWorkStore>>;
export type ReturnWorkSession = {
  id: string;
  identity: ReturnWorkContext;
  plan: ReturnPlan;
  inputs?: ReturnInputs;
  store: ReturnWorkStore;
  initial: () => ReturnWorkState;
};
