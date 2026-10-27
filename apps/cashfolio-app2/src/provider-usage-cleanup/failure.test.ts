import { expect, test } from "vitest";
import { getCleanupFailureReason, isCleanupFailureReason } from "./failure";

test.each([
  ["P2028", "transaction-failed"],
  ["P1001", "connection-failed"],
  ["ECONNREFUSED", "connection-failed"],
  ["28P01", "authentication-failed"],
  ["42501", "permission-denied"],
  ["42P01", "schema-missing"],
  ["57014", "query-timeout"],
  ["55P03", "query-timeout"],
])("classifies %s without exposing the error payload", (code, expected) => {
  expect(
    getCleanupFailureReason({ code, message: "postgresql://user:secret@host" }),
  ).toBe(expected);
});

test("finds PostgreSQL errors inside Prisma driver-adapter metadata", () => {
  expect(
    getCleanupFailureReason({
      code: "P2010",
      meta: {
        driverAdapterError: {
          cause: { originalCode: "42501", originalMessage: "secret" },
        },
      },
    }),
  ).toBe("permission-denied");
});

test("unknown values and cyclic causes remain a fixed unknown category", () => {
  const error: { code: string; cause?: unknown } = { code: "secret" };
  error.cause = error;
  for (const value of [error, new Error("secret"), "secret", null])
    expect(getCleanupFailureReason(value)).toBe("unknown");
});

test("accepts only the fixed categories from remote logs", () => {
  expect(isCleanupFailureReason("transaction-failed")).toBe(true);
  expect(isCleanupFailureReason("postgresql://user:secret@host")).toBe(false);
  expect(isCleanupFailureReason({ reason: "connection-failed" })).toBe(false);
});
