import type { HoldingTransferDirection } from "./transfer";
import type {
  HoldingAccountState,
  HoldingExecutionEvent,
  HoldingLot,
  HoldingTransactionBooking,
} from "./types";
export type TransferReplay = {
  bookings: HoldingTransactionBooking[];
  batches: HoldingTransactionBooking[][];
  atomic: boolean;
  direction: HoldingTransferDirection | null;
  canTransferLong: boolean;
  canTransferShort: boolean;
  pool: HoldingLot[];
};

export type Execution = {
  state: HoldingAccountState;
  event: HoldingExecutionEvent;
};

export type ReplayOperation =
  | {
      sortKey: string;
      execution: Execution;
      carry?: never;
      transfer?: never;
      bookings?: never;
    }
  | {
      sortKey: string;
      execution?: never;
      transfer: TransferReplay;
      carry?: never;
      bookings: HoldingTransactionBooking[];
    }
  | {
      sortKey: string;
      carry: HoldingTransactionBooking[];
      execution?: never;
      transfer?: never;
      bookings: HoldingTransactionBooking[];
    };
