import { beforeEach, describe, expect, it, vi } from "vitest";
import { AccountType, EquityAccountSubtype } from "../.prisma-client/enums";
import { OPENING_BALANCES_MANAGEMENT_MESSAGE } from "../shared/opening-balances";

const createServerFn = vi.hoisted(() =>
  vi.fn(() => {
    let validate: ((data: unknown) => unknown) | undefined;
    const chain = {
      inputValidator: vi.fn((validator: (data: unknown) => unknown) => {
        validate = validator;
        return chain;
      }),
      handler: vi.fn((handler: ({ data }: { data: unknown }) => unknown) => {
        return async ({ data }: { data: unknown }) => {
          const validatedData = validate ? validate(data) : data;
          return handler({ data: validatedData });
        };
      }),
    };
    return chain;
  }),
);

const ensureAuthorizedForAccountBookId = vi.hoisted(() => vi.fn());
const ensureSameOriginRequestFromServerContext = vi.hoisted(() => vi.fn());

const prisma = vi.hoisted(() => ({
  booking: {
    count: vi.fn(),
    deleteMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  transaction: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  account: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  accountBook: {
    findUniqueOrThrow: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn,
}));

vi.mock("../account-books/functions.server", () => ({
  ensureAuthorizedForAccountBookId,
}));

vi.mock("../security/same-origin.server", () => ({
  ensureSameOriginRequestFromServerContext,
}));

vi.mock("../prisma.server", () => ({
  prisma,
}));

import { deleteTransaction } from "./transactions-mutations";

describe("deleteTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.booking.count.mockResolvedValue(0);
    prisma.transaction.delete.mockResolvedValue({ id: "tx-1" });
  });

  it("blocks deleting opening-balance transactions", async () => {
    prisma.booking.count.mockResolvedValueOnce(1);

    await expect(
      deleteTransaction({
        data: { accountBookId: "book-1", transactionId: "tx-opening" },
      }),
    ).rejects.toThrow(OPENING_BALANCES_MANAGEMENT_MESSAGE);

    expect(prisma.booking.count).toHaveBeenCalledWith({
      where: {
        accountBookId: "book-1",
        transactionId: "tx-opening",
        account: {
          type: AccountType.EQUITY,
          equityAccountSubtype: EquityAccountSubtype.OPENING_BALANCES,
        },
      },
    });
    expect(prisma.transaction.delete).not.toHaveBeenCalled();
  });

  it("deletes non-opening-balance transactions", async () => {
    await deleteTransaction({
      data: { accountBookId: "book-1", transactionId: "tx-regular" },
    });

    expect(ensureSameOriginRequestFromServerContext).toHaveBeenCalledTimes(1);
    expect(ensureAuthorizedForAccountBookId).toHaveBeenCalledWith("book-1");
    expect(prisma.transaction.delete).toHaveBeenCalledWith({
      where: {
        id_accountBookId: {
          id: "tx-regular",
          accountBookId: "book-1",
        },
      },
    });
  });
});
